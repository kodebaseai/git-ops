/**
 * Tests for post-checkout orchestrator
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostCheckoutOrchestrator } from "./post-checkout-orchestrator.js";
import type { DraftPRCreator } from "./post-checkout-orchestrator-types.js";

describe("PostCheckoutOrchestrator", () => {
  let tempDir: string;
  let gitRoot: string;
  let artifactsRoot: string;
  let mockDraftPRService: DraftPRCreator;

  /**
   * Helper to create a test artifact
   */
  async function createArtifact(
    id: string,
    state: "draft" | "ready" | "in_progress" = "ready",
  ): Promise<void> {
    const segments = id.split(".");
    const letter = segments[0];
    const slug = `${letter}.test`;

    const content = `metadata:
  title: Test ${id}
  priority: medium
  estimation: M
  created_by: "Test User (test@example.com)"
  assignee: "Test User (test@example.com)"
  schema_version: "0.0.1"
  events:
    - event: draft
      timestamp: "2025-11-01T10:00:00Z"
      actor: "Test User (test@example.com)"
      trigger: artifact_created
    - event: ${state}
      timestamp: "2025-11-01T11:00:00Z"
      actor: "Test User (test@example.com)"
      trigger: test_trigger
content:
  summary: Test artifact ${id}
  acceptance_criteria:
    - "Test criterion 1"
`;

    if (segments.length === 1) {
      // Initiative: A.yml
      const dir = path.join(artifactsRoot, slug);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, `${letter}.yml`), content);
    } else if (segments.length === 2) {
      // Milestone: A.1.yml
      const initiativeDir = path.join(artifactsRoot, slug);
      const milestoneSlug = `${id}.test`;
      const milestoneDir = path.join(initiativeDir, milestoneSlug);
      await fs.promises.mkdir(milestoneDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(milestoneDir, `${id}.yml`),
        content,
      );
    } else {
      // Issue: A.1.2.test.yml
      const initiativeSlug = `${letter}.test`;
      const milestoneId = `${letter}.${segments[1]}`;
      const milestoneSlug = `${milestoneId}.test`;
      const milestoneDir = path.join(
        artifactsRoot,
        initiativeSlug,
        milestoneSlug,
      );
      await fs.promises.mkdir(milestoneDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(milestoneDir, `${id}.test.yml`),
        content,
      );
    }
  }

  beforeEach(async () => {
    // Create temporary git repository for testing
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "post-checkout-orch-"),
    );
    gitRoot = tempDir;
    artifactsRoot = path.join(tempDir, ".kodebase", "artifacts");

    // Initialize git repo
    execSync("git init", { cwd: gitRoot });
    execSync('git config user.name "Test User"', { cwd: gitRoot });
    execSync('git config user.email "test@example.com"', { cwd: gitRoot });

    // Create initial commit on main
    await fs.promises.writeFile(path.join(gitRoot, "README.md"), "# Test\n");
    execSync("git add .", { cwd: gitRoot });
    execSync('git commit -m "Initial commit"', { cwd: gitRoot });

    // Mock DraftPRService
    mockDraftPRService = {
      createDraftPR: vi.fn().mockResolvedValue({
        url: "https://github.com/test/repo/pull/123",
      }),
    };
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("execute", () => {
    it("should skip file checkouts (branchFlag = 0)", async () => {
      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: false,
      });

      const result = await orchestrator.execute("abc123", "def456", 0);

      expect(result.success).toBe(false);
      expect(result.reason).toContain("File checkout");
    });

    it("should skip branches without artifact IDs", async () => {
      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: false,
      });

      // Checkout a regular branch
      execSync("git checkout -b feature/test-branch", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(false);
      expect(result.reason).toContain("No artifact IDs found");
    });

    it("should transition artifact to in_progress on new branch", async () => {
      // Create artifacts
      await createArtifact("C", "ready");
      await createArtifact("C.1", "ready");
      await createArtifact("C.1.2", "ready");

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: false,
        enableCascade: false,
      });

      // Create new branch C.1.2
      execSync("git checkout -b C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(true);
      expect(result.branchName).toBe("C.1.2");
      expect(result.artifactIds).toEqual(["C.1.2"]);
      expect(result.artifactsTransitioned).toEqual(["C.1.2"]);
      expect(result.errors).toEqual([]);

      // Verify artifact was transitioned
      const artifactPath = path.join(
        artifactsRoot,
        "C.test/C.1.test/C.1.2.test.yml",
      );
      const content = await fs.promises.readFile(artifactPath, "utf-8");
      expect(content).toContain("event: in_progress");
      expect(content).toContain("trigger: branch_created");
    });

    it("should handle idempotency - skip if already in_progress", async () => {
      // Create artifact already in_progress
      await createArtifact("C", "ready");
      await createArtifact("C.1", "ready");
      await createArtifact("C.1.2", "in_progress");

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: false,
        enableCascade: false,
      });

      // Create new branch C.1.2
      execSync("git checkout -b C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(true);
      expect(result.artifactsTransitioned).toEqual(["C.1.2"]);

      // Verify no duplicate in_progress events
      const artifactPath = path.join(
        artifactsRoot,
        "C.test/C.1.test/C.1.2.test.yml",
      );
      const content = await fs.promises.readFile(artifactPath, "utf-8");
      const matches = content.match(/event: in_progress/g);
      expect(matches).toHaveLength(1); // Only one in_progress event
    });

    it("should execute progress cascade when enabled", async () => {
      // Create parent artifacts in ready state
      await createArtifact("C", "ready");
      await createArtifact("C.1", "ready");
      await createArtifact("C.1.2", "ready");

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: false,
        enableCascade: true,
      });

      // Create new branch C.1.2
      execSync("git checkout -b C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(true);
      expect(result.artifactsTransitioned).toEqual(["C.1.2"]);
      expect(result.parentsCascaded).toContain("C.1"); // Parent should be cascaded

      // Verify parent was transitioned
      const parentPath = path.join(artifactsRoot, "C.test/C.1.test/C.1.yml");
      const content = await fs.promises.readFile(parentPath, "utf-8");
      expect(content).toContain("event: in_progress");
      expect(content).toContain("trigger: progress_cascade");
    });

    it("should not cascade if parent already in_progress", async () => {
      // Create parent already in_progress
      await createArtifact("C", "ready");
      await createArtifact("C.1", "in_progress"); // Already started
      await createArtifact("C.1.2", "ready");

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: false,
        enableCascade: true,
      });

      // Create new branch C.1.2
      execSync("git checkout -b C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(true);
      expect(result.parentsCascaded).toEqual([]); // No cascade needed
    });

    it("should create draft PR when enabled", async () => {
      // Create artifacts
      await createArtifact("C", "ready");
      await createArtifact("C.1", "ready");
      await createArtifact("C.1.2", "ready");

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: true,
        enableCascade: false,
        draftPRService: mockDraftPRService,
      });

      // Create new branch C.1.2
      execSync("git checkout -b C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(true);
      expect(result.prUrl).toBe("https://github.com/test/repo/pull/123");
      expect(mockDraftPRService.createDraftPR).toHaveBeenCalledWith({
        branchName: "C.1.2",
        artifactIds: ["C.1.2"],
      });
    });

    it("should handle PR creation failures gracefully", async () => {
      // Create artifacts
      await createArtifact("C", "ready");
      await createArtifact("C.1", "ready");
      await createArtifact("C.1.2", "ready");

      // Mock PR service to fail
      const failingPRService: DraftPRCreator = {
        createDraftPR: vi.fn().mockRejectedValue(new Error("GitHub API error")),
      };

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: true,
        enableCascade: false,
        draftPRService: failingPRService,
      });

      // Create new branch C.1.2
      execSync("git checkout -b C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(true); // Still succeeds because artifact was transitioned
      expect(result.artifactsTransitioned).toEqual(["C.1.2"]);
      expect(result.warnings).toContain("PR creation failed: GitHub API error");
      expect(result.prUrl).toBeUndefined();
    });

    it("should handle cascade failures gracefully", async () => {
      // Create artifacts
      await createArtifact("C", "ready");
      await createArtifact("C.1", "ready");
      await createArtifact("C.1.2", "ready");

      // Mock CascadeService to throw errors
      const { CascadeService } = await import("@kodebase/artifacts");
      const originalExecute = CascadeService.prototype.executeProgressCascade;
      CascadeService.prototype.executeProgressCascade = vi
        .fn()
        .mockRejectedValue(new Error("Cascade engine error"));

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: false,
        enableCascade: true,
      });

      // Create new branch C.1.2
      execSync("git checkout -b C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(true); // Still succeeds
      expect(result.artifactsTransitioned).toEqual(["C.1.2"]);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("Cascade failed");

      // Restore original
      CascadeService.prototype.executeProgressCascade = originalExecute;
    });

    it("should handle multiple artifacts in branch name", async () => {
      // Create artifacts
      await createArtifact("C", "ready");
      await createArtifact("C.1", "ready");
      await createArtifact("C.1.2", "ready");
      await createArtifact("C.1.3", "ready");

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: false,
        enableCascade: false,
      });

      // Create branch with multiple artifact IDs
      execSync("git checkout -b C.1.2-C.1.3-combined", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(true);
      expect(result.artifactIds).toEqual(["C.1.2", "C.1.3"]);
      expect(result.artifactsTransitioned).toEqual(["C.1.2", "C.1.3"]);
    });

    it("should handle transition failures and continue", async () => {
      // Create artifacts - one in invalid state for transition
      await createArtifact("C", "ready");
      await createArtifact("C.1", "ready");
      await createArtifact("C.1.2", "ready");
      await createArtifact("C.1.3", "in_progress"); // Manually set to in_progress first

      // Now manually transition C.1.3 to completed (invalid for transition to in_progress)
      const artifactPath = path.join(
        artifactsRoot,
        "C.test/C.1.test/C.1.3.test.yml",
      );
      let content = await fs.promises.readFile(artifactPath, "utf-8");
      content = content.replace(/event: in_progress/, "event: completed");
      await fs.promises.writeFile(artifactPath, content);

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: false,
        enableCascade: false,
      });

      // Create branch with multiple artifact IDs
      execSync("git checkout -b C.1.2-C.1.3-combined", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(true); // Still succeeds with partial success
      expect(result.artifactsTransitioned).toEqual(["C.1.2"]); // Only C.1.2 succeeded
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("C.1.3");
    });

    it("should skip cascade when enableCascade is false", async () => {
      // Create artifacts
      await createArtifact("C", "ready");
      await createArtifact("C.1", "ready");
      await createArtifact("C.1.2", "ready");

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: false,
        enableCascade: false,
      });

      // Create new branch C.1.2
      execSync("git checkout -b C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(true);
      expect(result.parentsCascaded).toEqual([]); // No cascade executed

      // Verify parent was NOT transitioned
      const parentPath = path.join(artifactsRoot, "C.test/C.1.test/C.1.yml");
      const content = await fs.promises.readFile(parentPath, "utf-8");
      expect(content).not.toContain("trigger: progress_cascade");
    });

    it("should skip PR creation when enableDraftPR is false", async () => {
      // Create artifacts
      await createArtifact("C", "ready");
      await createArtifact("C.1", "ready");
      await createArtifact("C.1.2", "ready");

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: false,
        draftPRService: mockDraftPRService,
      });

      // Create new branch C.1.2
      execSync("git checkout -b C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(true);
      expect(result.prUrl).toBeUndefined();
      expect(mockDraftPRService.createDraftPR).not.toHaveBeenCalled();
    });

    it("should handle errors in detection phase", async () => {
      // Don't create artifacts - detector will fail
      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableDraftPR: false,
      });

      // Create branch with invalid artifact ID
      execSync("git checkout -b Z.99.99", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await orchestrator.execute(sha, sha, 1);

      expect(result.success).toBe(false);
      expect(result.reason).toContain("Invalid artifact IDs");
    });
  });
});
