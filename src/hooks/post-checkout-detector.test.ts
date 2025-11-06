/**
 * Tests for post-checkout hook detection
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PostCheckoutDetector } from "./post-checkout-detector.js";

describe("PostCheckoutDetector", () => {
  let tempDir: string;
  let gitRoot: string;

  beforeEach(async () => {
    // Create temporary git repository for testing
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "post-checkout-"),
    );
    gitRoot = tempDir;

    // Initialize git repo
    execSync("git init", { cwd: gitRoot });
    execSync('git config user.name "Test User"', { cwd: gitRoot });
    execSync('git config user.email "test@example.com"', { cwd: gitRoot });

    // Create initial commit on main
    await fs.promises.writeFile(path.join(gitRoot, "README.md"), "# Test\n");
    execSync("git add .", { cwd: gitRoot });
    execSync('git commit -m "Initial commit"', { cwd: gitRoot });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe("Branch checkout detection", () => {
    it("should detect new branch creation", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      // Create new branch C.1.2
      execSync("git checkout -b C.1.2", { cwd: gitRoot });

      // Get current commit SHA
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      // New branch: previousHead === newHead (both same commit)
      const result = await detector.detectCheckout(sha, sha, 1);

      expect(result.shouldExecute).toBe(true);
      expect(result.reason).toContain("New branch created");
      expect(result.metadata?.branchName).toBe("C.1.2");
      expect(result.metadata?.isNewBranch).toBe(true);
      expect(result.metadata?.artifactIds).toEqual(["C.1.2"]);
    });

    it("should detect existing branch checkout", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      // Create and switch to new branch
      execSync("git checkout -b C.1.2", { cwd: gitRoot });
      const sha1 = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      // Make a commit
      await fs.promises.writeFile(path.join(gitRoot, "test.txt"), "test\n");
      execSync("git add .", { cwd: gitRoot });
      execSync('git commit -m "Test commit"', { cwd: gitRoot });
      const sha2 = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      // Switch back to main
      execSync("git checkout main", { cwd: gitRoot });

      // Switch to existing branch C.1.2
      execSync("git checkout C.1.2", { cwd: gitRoot });

      // Existing branch: previousHead !== newHead (different commits)
      const result = await detector.detectCheckout(sha1, sha2, 1);

      expect(result.shouldExecute).toBe(true);
      expect(result.reason).toContain("Checked out existing branch");
      expect(result.metadata?.branchName).toBe("C.1.2");
      expect(result.metadata?.isNewBranch).toBe(false);
      expect(result.metadata?.artifactIds).toEqual(["C.1.2"]);
    });

    it("should ignore file checkout (branch_flag = 0)", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      // File checkout: branch_flag = 0
      const result = await detector.detectCheckout(sha, sha, 0);

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toBe("File checkout (not branch)");
      expect(result.metadata).toBeUndefined();
    });

    it("should handle branch without artifact IDs", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      // Create branch without artifact ID
      execSync("git checkout -b feature-branch", { cwd: gitRoot });

      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await detector.detectCheckout(sha, sha, 1);

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toBe("No artifact IDs found in branch name");
      expect(result.metadata?.branchName).toBe("feature-branch");
      expect(result.metadata?.artifactIds).toEqual([]);
    });
  });

  describe("Artifact ID extraction", () => {
    it("should extract single artifact ID from branch name", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      execSync("git checkout -b C.1.5", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await detector.detectCheckout(sha, sha, 1);

      expect(result.metadata?.artifactIds).toEqual(["C.1.5"]);
    });

    it("should extract multiple artifact IDs from branch name", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      execSync("git checkout -b C.1.2-C.1.3", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await detector.detectCheckout(sha, sha, 1);

      expect(result.metadata?.artifactIds).toEqual(["C.1.2", "C.1.3"]);
    });

    it("should extract nested artifact IDs (C.4.1.2 format)", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      execSync("git checkout -b C.4.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await detector.detectCheckout(sha, sha, 1);

      expect(result.metadata?.artifactIds).toEqual(["C.4.1.2"]);
    });

    it("should return sorted unique artifact IDs", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      execSync("git checkout -b C.2.1-C.1.5-C.2.1", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await detector.detectCheckout(sha, sha, 1);

      // Unique and sorted
      expect(result.metadata?.artifactIds).toEqual(["C.1.5", "C.2.1"]);
    });

    it("should extract artifact ID with prefix", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      execSync("git checkout -b feature-C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await detector.detectCheckout(sha, sha, 1);

      expect(result.metadata?.artifactIds).toEqual(["C.1.2"]);
    });

    it("should extract artifact ID with suffix", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      execSync("git checkout -b C.1.2-feature", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await detector.detectCheckout(sha, sha, 1);

      expect(result.metadata?.artifactIds).toEqual(["C.1.2"]);
    });
  });

  describe("Metadata extraction", () => {
    it("should extract previous and new HEAD SHAs", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      const previousSha = "abc123def456";
      const newSha = "789ghi012jkl";

      execSync("git checkout -b C.1.2", { cwd: gitRoot });

      const result = await detector.detectCheckout(previousSha, newSha, 1);

      expect(result.metadata?.previousHead).toBe(previousSha);
      expect(result.metadata?.newHead).toBe(newSha);
    });

    it("should extract current branch name", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      execSync("git checkout -b my-feature-C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await detector.detectCheckout(sha, sha, 1);

      expect(result.metadata?.branchName).toBe("my-feature-C.1.2");
    });

    it("should include isNewBranch flag in metadata", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      execSync("git checkout -b C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      // New branch
      const result1 = await detector.detectCheckout(sha, sha, 1);
      expect(result1.metadata?.isNewBranch).toBe(true);

      // Existing branch (different SHAs)
      const result2 = await detector.detectCheckout("abc123", sha, 1);
      expect(result2.metadata?.isNewBranch).toBe(false);
    });
  });

  describe("Error handling", () => {
    it("should handle invalid git repository", async () => {
      const invalidDir = path.join(tempDir, "invalid");
      await fs.promises.mkdir(invalidDir, { recursive: true });

      const detector = new PostCheckoutDetector({ gitRoot: invalidDir });

      const result = await detector.detectCheckout("abc123", "def456", 1);

      expect(result.shouldExecute).toBe(false);
      // Error can be either from git command failure or no artifacts found
      expect(
        result.reason.includes("Error detecting checkout") ||
          result.reason.includes("No artifact IDs"),
      ).toBe(true);
    });

    it("should handle missing git directory", async () => {
      const missingDir = path.join(tempDir, "missing");

      const detector = new PostCheckoutDetector({ gitRoot: missingDir });

      const result = await detector.detectCheckout("abc123", "def456", 1);

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toContain("Error detecting checkout");
    });
  });

  describe("Configuration", () => {
    it("should use default gitRoot if not provided", () => {
      const detector = new PostCheckoutDetector();

      // Should not throw - uses process.cwd()
      expect(detector).toBeDefined();
    });

    it("should use custom gitRoot from config", async () => {
      const detector = new PostCheckoutDetector({ gitRoot });

      execSync("git checkout -b C.1.2", { cwd: gitRoot });
      const sha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const result = await detector.detectCheckout(sha, sha, 1);

      expect(result.shouldExecute).toBe(true);
      expect(result.metadata?.branchName).toBe("C.1.2");
    });
  });
});
