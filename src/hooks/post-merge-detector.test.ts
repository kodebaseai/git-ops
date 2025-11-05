/**
 * Tests for post-merge hook trigger detection
 */

import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPostMergeDetector,
  PostMergeDetector,
} from "./post-merge-detector.js";

const execAsync = promisify(exec);

describe("PostMergeDetector", () => {
  let tempDir: string;
  let detector: PostMergeDetector;

  beforeEach(async () => {
    // Create temporary git repository
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "post-merge-test-"),
    );

    // Initialize git repo
    await execAsync("git init", { cwd: tempDir });
    await execAsync('git config user.email "test@example.com"', {
      cwd: tempDir,
    });
    await execAsync('git config user.name "Test User"', { cwd: tempDir });

    // Create initial commit on main
    await fs.promises.writeFile(path.join(tempDir, "README.md"), "# Test\n");
    await execAsync("git add .", { cwd: tempDir });
    await execAsync('git commit -m "Initial commit"', { cwd: tempDir });

    // Ensure we're on main branch
    await execAsync("git checkout -b main", { cwd: tempDir }).catch(() => {
      // Branch already exists
    });

    detector = new PostMergeDetector({ gitRoot: tempDir });
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe("Factory function", () => {
    it("creates detector with default config", () => {
      const detector = createPostMergeDetector();
      expect(detector).toBeInstanceOf(PostMergeDetector);
    });

    it("creates detector with custom config", () => {
      const detector = createPostMergeDetector({
        targetBranch: "develop",
        requirePR: false,
      });
      expect(detector).toBeInstanceOf(PostMergeDetector);
    });
  });

  describe("Branch detection", () => {
    it("executes on target branch (main)", async () => {
      // Create feature branch with artifact ID
      await execAsync("git checkout -b feature/A.1.5", { cwd: tempDir });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add test file"', { cwd: tempDir });

      // Merge to main
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync('git merge --no-ff feature/A.1.5 -m "Merge PR #123"', {
        cwd: tempDir,
      });

      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(true);
      expect(result.metadata?.targetBranch).toBe("main");
    });

    it("does not execute on non-target branch", async () => {
      // Create and checkout develop branch
      await execAsync("git checkout -b develop", { cwd: tempDir });

      const result = await detector.detectMerge();

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toContain("Not on target branch");
    });

    it("respects custom target branch", async () => {
      detector = new PostMergeDetector({
        gitRoot: tempDir,
        targetBranch: "develop",
      });

      // Create and checkout develop branch
      await execAsync("git checkout -b develop", { cwd: tempDir });

      // Create feature branch
      await execAsync("git checkout -b feature/A.1.5", { cwd: tempDir });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add test"', { cwd: tempDir });

      // Merge to develop
      await execAsync("git checkout develop", { cwd: tempDir });
      await execAsync('git merge --no-ff feature/A.1.5 -m "Merge PR #123"', {
        cwd: tempDir,
      });

      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(true);
      expect(result.metadata?.targetBranch).toBe("develop");
    });
  });

  describe("PR detection", () => {
    it("detects PR merge from commit message (#123 format)", async () => {
      // Create feature branch
      await execAsync("git checkout -b feature/A.1.5", { cwd: tempDir });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add feature"', { cwd: tempDir });

      // Merge with PR format
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync(
        'git merge --no-ff feature/A.1.5 -m "Merge pull request #123 from feature/A.1.5"',
        {
          cwd: tempDir,
        },
      );

      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(true);
      expect(result.metadata?.isPRMerge).toBe(true);
      expect(result.metadata?.prNumber).toBe(123);
    });

    it("detects PR merge from squelch parameter", async () => {
      // Create feature branch
      await execAsync("git checkout -b feature/A.1.5", { cwd: tempDir });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add feature"', { cwd: tempDir });

      // Merge
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync('git merge --no-ff feature/A.1.5 -m "Merge feature"', {
        cwd: tempDir,
      });

      // squelchMerge = 0 indicates merge commit
      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(true);
      expect(result.metadata?.isPRMerge).toBe(true);
    });

    it("rejects direct commit when requirePR is true", async () => {
      // Make direct commit on main
      await fs.promises.writeFile(path.join(tempDir, "direct.txt"), "direct");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Direct commit on main"', {
        cwd: tempDir,
      });

      const result = await detector.detectMerge();

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toContain("Direct commit to main");
    });

    it("allows direct commit when requirePR is false", async () => {
      detector = new PostMergeDetector({
        gitRoot: tempDir,
        requirePR: false,
      });

      // Create branch with artifact ID in name
      await execAsync("git checkout -b A.1.5", { cwd: tempDir });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add feature"', { cwd: tempDir });

      // Merge to main
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync('git merge --no-ff A.1.5 -m "Merge A.1.5"', {
        cwd: tempDir,
      });

      const result = await detector.detectMerge();

      expect(result.shouldExecute).toBe(true);
    });
  });

  describe("Artifact ID extraction", () => {
    it("extracts artifact ID from branch name", async () => {
      // Create feature branch with artifact ID
      await execAsync("git checkout -b feature/A.1.5", { cwd: tempDir });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add feature"', { cwd: tempDir });

      // Merge
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync('git merge --no-ff feature/A.1.5 -m "Merge PR #123"', {
        cwd: tempDir,
      });

      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(true);
      expect(result.metadata?.artifactIds).toContain("A.1.5");
    });

    it("extracts multiple artifact IDs from branch name", async () => {
      // Create branch with multiple artifacts
      await execAsync("git checkout -b feature/A.1.5-B.2.3", { cwd: tempDir });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add features"', { cwd: tempDir });

      // Merge
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync(
        'git merge --no-ff feature/A.1.5-B.2.3 -m "Merge PR #123"',
        {
          cwd: tempDir,
        },
      );

      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(true);
      expect(result.metadata?.artifactIds).toContain("A.1.5");
      expect(result.metadata?.artifactIds).toContain("B.2.3");
    });

    it("extracts nested artifact IDs (C.4.1.2 format)", async () => {
      // Create branch with nested artifact ID
      await execAsync("git checkout -b feature/C.4.1.2", { cwd: tempDir });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add feature"', { cwd: tempDir });

      // Merge
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync('git merge --no-ff feature/C.4.1.2 -m "Merge PR #123"', {
        cwd: tempDir,
      });

      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(true);
      expect(result.metadata?.artifactIds).toContain("C.4.1.2");
    });

    it("does not execute if no artifact IDs found", async () => {
      // Create branch without artifact ID
      await execAsync("git checkout -b feature/add-logging", { cwd: tempDir });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add logging"', { cwd: tempDir });

      // Merge
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync(
        'git merge --no-ff feature/add-logging -m "Merge PR #123"',
        {
          cwd: tempDir,
        },
      );

      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toContain("No artifact IDs found");
    });

    it("returns sorted unique artifact IDs", async () => {
      // Create branch with duplicate artifacts
      await execAsync("git checkout -b feature/A.1.5-B.2.3-A.1.5", {
        cwd: tempDir,
      });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add features"', { cwd: tempDir });

      // Merge
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync(
        'git merge --no-ff feature/A.1.5-B.2.3-A.1.5 -m "Merge PR #123"',
        {
          cwd: tempDir,
        },
      );

      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(true);
      expect(result.metadata?.artifactIds).toEqual(["A.1.5", "B.2.3"]); // Sorted, no duplicates
    });
  });

  describe("Metadata extraction", () => {
    it("extracts commit SHA", async () => {
      // Create feature branch
      await execAsync("git checkout -b feature/A.1.5", { cwd: tempDir });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add feature"', { cwd: tempDir });

      // Merge
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync('git merge --no-ff feature/A.1.5 -m "Merge PR #123"', {
        cwd: tempDir,
      });

      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(true);
      expect(result.metadata?.commitSha).toMatch(/^[0-9a-f]{40}$/);
    });

    it("extracts source branch name", async () => {
      // Create feature branch
      await execAsync("git checkout -b feature/A.1.5", { cwd: tempDir });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add feature"', { cwd: tempDir });

      // Merge
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync('git merge --no-ff feature/A.1.5 -m "Merge PR #123"', {
        cwd: tempDir,
      });

      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(true);
      expect(result.metadata?.sourceBranch).toBe("feature/A.1.5");
    });

    it("handles missing source branch gracefully", async () => {
      // Direct commit (no merge, no source branch)
      detector = new PostMergeDetector({
        gitRoot: tempDir,
        requirePR: false,
      });

      await fs.promises.writeFile(path.join(tempDir, "direct.txt"), "direct");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Direct commit A.1.5"', { cwd: tempDir });

      const result = await detector.detectMerge();

      // Should not execute because no artifact in branch name
      // but test the metadata extraction
      expect(result.metadata?.sourceBranch).toBeNull();
    });
  });

  describe("Error handling", () => {
    it("handles invalid git repository", async () => {
      const invalidDetector = new PostMergeDetector({
        gitRoot: "/nonexistent/path",
      });

      const result = await invalidDetector.detectMerge();

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toContain("Error detecting merge");
    });

    it("handles git command failures gracefully", async () => {
      // Remove .git directory to simulate git failure
      await fs.promises.rm(path.join(tempDir, ".git"), {
        recursive: true,
        force: true,
      });

      const result = await detector.detectMerge();

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toContain("Error detecting merge");
    });
  });

  describe("PR metadata extraction", () => {
    it("returns null PR metadata when gh CLI unavailable", async () => {
      // Create feature branch
      await execAsync("git checkout -b feature/A.1.5", { cwd: tempDir });
      await fs.promises.writeFile(path.join(tempDir, "test.txt"), "test");
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add feature"', { cwd: tempDir });

      // Merge with PR number
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync(
        'git merge --no-ff feature/A.1.5 -m "Merge PR #123: Add A.1.5"',
        {
          cwd: tempDir,
        },
      );

      const result = await detector.detectMerge(0);

      // PR number should be extracted from commit message
      expect(result.metadata?.prNumber).toBe(123);
      // But title and body will be null (no gh CLI in test environment)
      expect(result.metadata?.prTitle).toBeNull();
      expect(result.metadata?.prBody).toBeNull();
    });
  });

  describe("Integration scenarios", () => {
    it("handles typical GitHub PR merge workflow", async () => {
      // Simulate GitHub PR merge:
      // 1. Create feature branch with artifact ID
      await execAsync("git checkout -b feature/implement-A.1.5", {
        cwd: tempDir,
      });
      await fs.promises.writeFile(
        path.join(tempDir, "feature.ts"),
        "export const feature = true;",
      );
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Implement A.1.5: Add feature"', {
        cwd: tempDir,
      });

      // 2. Merge to main (GitHub style)
      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync(
        'git merge --no-ff feature/implement-A.1.5 -m "Merge pull request #456 from feature/implement-A.1.5\n\nImplement A.1.5"',
        {
          cwd: tempDir,
        },
      );

      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(true);
      expect(result.reason).toContain("PR merge detected");
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.prNumber).toBe(456);
      expect(result.metadata?.sourceBranch).toBe("feature/implement-A.1.5");
      expect(result.metadata?.artifactIds).toContain("A.1.5");
      expect(result.metadata?.isPRMerge).toBe(true);
    });

    it("handles cascade PR merge with parent artifact", async () => {
      // Simulate cascade commit with parent artifact
      await execAsync("git checkout -b cascade/A.1", { cwd: tempDir });
      await fs.promises.writeFile(
        path.join(tempDir, "parent.yml"),
        "metadata:\n  title: Parent\n",
      );
      await execAsync("git add .", { cwd: tempDir });
      await execAsync(
        'git commit -m "Cascade: Update A.1 (children completed)"',
        {
          cwd: tempDir,
        },
      );

      await execAsync("git checkout main", { cwd: tempDir });
      await execAsync(
        'git merge --no-ff cascade/A.1 -m "Merge pull request #789 from cascade/A.1"',
        {
          cwd: tempDir,
        },
      );

      const result = await detector.detectMerge(0);

      expect(result.shouldExecute).toBe(true);
      expect(result.metadata?.artifactIds).toContain("A.1");
      expect(result.metadata?.prNumber).toBe(789);
    });
  });
});
