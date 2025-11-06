/**
 * Integration tests for the post-checkout workflow
 *
 * Tests integration between core workflow components:
 * - PostCheckoutOrchestrator: Execute progress cascades and draft PR creation
 * - PostCheckoutDetector: Detect artifact branches and extract metadata
 *
 * These tests focus on component integration and E2E workflows with
 * real git operations and artifact files.
 *
 * Related component tests (tested separately):
 * - PostCheckoutDetector: post-checkout-detector.test.ts (19 tests)
 * - DraftPRService: draft-pr-service.test.ts (8 tests)
 * - PostCheckoutOrchestrator: post-checkout-orchestrator.test.ts (14 tests, excluded)
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PostCheckoutOrchestrator } from "./post-checkout-orchestrator.js";

describe("Post-Checkout Workflow Integration Tests", () => {
  let tempDir: string;
  let gitRoot: string;
  let artifactsRoot: string;

  beforeEach(async () => {
    // Create temporary git repository
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "post-checkout-integration-"),
    );
    gitRoot = tempDir;
    artifactsRoot = path.join(gitRoot, ".kodebase", "artifacts");

    // Initialize git repository
    execSync("git init", { cwd: gitRoot });
    execSync("git config user.name 'Test User'", { cwd: gitRoot });
    execSync("git config user.email 'test@example.com'", { cwd: gitRoot });

    // Create main branch with initial commit
    await fs.promises.mkdir(artifactsRoot, { recursive: true });
    await fs.promises.writeFile(path.join(gitRoot, "README.md"), "# Test Repo");
    execSync("git add .", { cwd: gitRoot });
    execSync('git commit -m "Initial commit"', { cwd: gitRoot });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

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

    // Determine path based on artifact level
    let artifactPath: string;
    if (segments.length === 1) {
      // Initiative: A.test/A.yml
      const dir = path.join(artifactsRoot, slug);
      await fs.promises.mkdir(dir, { recursive: true });
      artifactPath = path.join(dir, `${id}.yml`);
    } else if (segments.length === 2) {
      // Milestone: A.test/A.1.milestone/A.1.yml
      const initiativeDir = path.join(artifactsRoot, slug);
      const milestoneDir = path.join(initiativeDir, `${id}.milestone`);
      await fs.promises.mkdir(milestoneDir, { recursive: true });
      artifactPath = path.join(milestoneDir, `${id}.yml`);
    } else {
      // Issue: A.test/A.1.milestone/A.1.2.issue.yml
      const initiativeDir = path.join(artifactsRoot, slug);
      const milestoneId = segments.slice(0, 2).join(".");
      const milestoneDir = path.join(initiativeDir, `${milestoneId}.milestone`);
      await fs.promises.mkdir(milestoneDir, { recursive: true });
      artifactPath = path.join(milestoneDir, `${id}.issue.yml`);
    }

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
      trigger: ${state === "in_progress" ? "branch_created" : "ready"}
content:
  summary: Test artifact ${id}
  acceptance_criteria:
    - "Test criteria"
`;

    await fs.promises.writeFile(artifactPath, content);
  }

  /**
   * Helper to get current artifact state
   */
  async function getArtifactState(id: string): Promise<string | null> {
    const segments = id.split(".");
    const letter = segments[0];
    const slug = `${letter}.test`;

    // Find artifact file
    let artifactPath: string;
    if (segments.length === 1) {
      artifactPath = path.join(artifactsRoot, slug, `${id}.yml`);
    } else if (segments.length === 2) {
      artifactPath = path.join(
        artifactsRoot,
        slug,
        `${id}.milestone`,
        `${id}.yml`,
      );
    } else {
      const milestoneId = segments.slice(0, 2).join(".");
      artifactPath = path.join(
        artifactsRoot,
        slug,
        `${milestoneId}.milestone`,
        `${id}.issue.yml`,
      );
    }

    try {
      const content = await fs.promises.readFile(artifactPath, "utf-8");
      const lines = content.split("\n");
      // Find last event
      let lastEvent = null;
      for (const line of lines) {
        const match = line.match(/^\s+- event: (\w+)/);
        if (match) {
          lastEvent = match[1];
        }
      }
      return lastEvent;
    } catch {
      return null;
    }
  }

  describe("E2E: Progress cascade on branch checkout", () => {
    it("should transition artifact to in_progress and trigger cascade", async () => {
      // Create parent (A) and child (A.1) artifacts
      await createArtifact("A", "ready");
      await createArtifact("A.1", "ready");
      execSync("git add .", { cwd: gitRoot });
      execSync('git commit -m "Add artifacts"', { cwd: gitRoot });

      // Checkout new branch with artifact ID
      const prevSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();
      execSync("git checkout -b A.1", { cwd: gitRoot });
      const newSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      // Execute orchestrator
      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableCascade: true,
        enableDraftPR: false,
      });

      const result = await orchestrator.execute(prevSha, newSha, 1);

      // Verify result
      expect(result.success).toBe(true);
      expect(result.artifactIds).toContain("A.1");
      expect(result.artifactsTransitioned).toContain("A.1");
      expect(result.parentsCascaded).toContain("A");

      // Verify artifact states
      const childState = await getArtifactState("A.1");
      const parentState = await getArtifactState("A");
      expect(childState).toBe("in_progress");
      expect(parentState).toBe("in_progress");
    });

    it("should handle nested artifact hierarchy (A -> A.1 -> A.1.2)", async () => {
      // Create three-level hierarchy
      await createArtifact("A", "ready");
      await createArtifact("A.1", "ready");
      await createArtifact("A.1.2", "ready");
      execSync("git add .", { cwd: gitRoot });
      execSync('git commit -m "Add artifacts"', { cwd: gitRoot });

      // Checkout branch for issue A.1.2
      const prevSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();
      execSync("git checkout -b A.1.2", { cwd: gitRoot });
      const newSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      // Execute orchestrator
      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableCascade: true,
        enableDraftPR: false,
      });

      const result = await orchestrator.execute(prevSha, newSha, 1);

      // Verify cascade propagated up
      expect(result.success).toBe(true);
      expect(result.artifactsTransitioned).toContain("A.1.2");
      expect(result.parentsCascaded).toContain("A.1");
      expect(result.parentsCascaded).toContain("A");

      // Verify all are in_progress
      const issueState = await getArtifactState("A.1.2");
      const milestoneState = await getArtifactState("A.1");
      const initiativeState = await getArtifactState("A");
      expect(issueState).toBe("in_progress");
      expect(milestoneState).toBe("in_progress");
      expect(initiativeState).toBe("in_progress");
    });
  });

  describe("E2E: Branch validation and artifact extraction", () => {
    it("should extract single artifact ID from branch name", async () => {
      await createArtifact("B", "ready");
      await createArtifact("B.2", "ready");
      execSync("git add .", { cwd: gitRoot });
      execSync('git commit -m "Add artifacts"', { cwd: gitRoot });

      const prevSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();
      execSync("git checkout -b B.2", { cwd: gitRoot });
      const newSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableCascade: true,
        enableDraftPR: false,
      });

      const result = await orchestrator.execute(prevSha, newSha, 1);

      expect(result.success).toBe(true);
      expect(result.artifactIds).toEqual(["B.2"]);
      expect(result.branchName).toBe("B.2");
    });

    it("should extract multiple artifact IDs from branch name", async () => {
      await createArtifact("C", "ready");
      await createArtifact("C.1", "ready");
      await createArtifact("C.2", "ready");
      execSync("git add .", { cwd: gitRoot });
      execSync('git commit -m "Add artifacts"', { cwd: gitRoot });

      const prevSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();
      execSync("git checkout -b C.1-C.2", { cwd: gitRoot });
      const newSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableCascade: true,
        enableDraftPR: false,
      });

      const result = await orchestrator.execute(prevSha, newSha, 1);

      expect(result.success).toBe(true);
      expect(result.artifactIds).toContain("C.1");
      expect(result.artifactIds).toContain("C.2");
      expect(result.artifactsTransitioned).toContain("C.1");
      expect(result.artifactsTransitioned).toContain("C.2");
    });

    it("should ignore non-artifact branches", async () => {
      const prevSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();
      execSync("git checkout -b feature/my-feature", { cwd: gitRoot });
      const newSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableCascade: true,
        enableDraftPR: false,
      });

      const result = await orchestrator.execute(prevSha, newSha, 1);

      expect(result.success).toBe(true);
      expect(result.reason).toBe("not_artifact_branch");
      expect(result.artifactIds).toBeUndefined();
    });
  });

  describe("E2E: Idempotency", () => {
    it("should not re-cascade if artifact already in_progress", async () => {
      // Create artifacts with child already in_progress
      await createArtifact("D", "ready");
      await createArtifact("D.1", "in_progress");
      execSync("git add .", { cwd: gitRoot });
      execSync('git commit -m "Add artifacts"', { cwd: gitRoot });

      const prevSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();
      execSync("git checkout -b D.1", { cwd: gitRoot });
      const newSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableCascade: true,
        enableDraftPR: false,
      });

      const result = await orchestrator.execute(prevSha, newSha, 1);

      // Should succeed but not transition (already in_progress)
      expect(result.success).toBe(true);
      expect(result.artifactsTransitioned).toEqual([]);
      expect(result.parentsCascaded).toEqual([]);
    });

    it("should handle repeated hook execution gracefully", async () => {
      await createArtifact("E", "ready");
      await createArtifact("E.1", "ready");
      execSync("git add .", { cwd: gitRoot });
      execSync('git commit -m "Add artifacts"', { cwd: gitRoot });

      const prevSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();
      execSync("git checkout -b E.1", { cwd: gitRoot });
      const newSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableCascade: true,
        enableDraftPR: false,
      });

      // First execution
      const result1 = await orchestrator.execute(prevSha, newSha, 1);
      expect(result1.success).toBe(true);
      expect(result1.artifactsTransitioned).toContain("E.1");

      // Second execution (re-run hook)
      const result2 = await orchestrator.execute(prevSha, newSha, 1);
      expect(result2.success).toBe(true);
      expect(result2.artifactsTransitioned).toEqual([]);
      expect(result2.parentsCascaded).toEqual([]);
    });
  });

  describe("E2E: Error handling", () => {
    it("should handle invalid artifact ID gracefully", async () => {
      const prevSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();
      execSync("git checkout -b Z.99.99", { cwd: gitRoot });
      const newSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableCascade: true,
        enableDraftPR: false,
      });

      const result = await orchestrator.execute(prevSha, newSha, 1);

      // Should succeed but report errors
      expect(result.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.artifactsTransitioned).toEqual([]);
    });

    it("should handle file checkout (not branch) gracefully", async () => {
      // Create a file and check it out
      await fs.promises.writeFile(path.join(gitRoot, "test.txt"), "test");
      execSync("git add test.txt", { cwd: gitRoot });
      execSync('git commit -m "Add test file"', { cwd: gitRoot });

      const prevSha = "0000000000000000000000000000000000000000";
      const newSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableCascade: true,
        enableDraftPR: false,
      });

      const result = await orchestrator.execute(prevSha, newSha, 0); // 0 = file checkout

      expect(result.success).toBe(true);
      expect(result.reason).toBe("file_checkout");
    });

    it("should handle cascade failure gracefully", async () => {
      // Create artifact without parent (invalid hierarchy)
      await createArtifact("F.1", "ready");
      execSync("git add .", { cwd: gitRoot });
      execSync('git commit -m "Add orphan artifact"', { cwd: gitRoot });

      const prevSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();
      execSync("git checkout -b F.1", { cwd: gitRoot });
      const newSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableCascade: true,
        enableDraftPR: false,
      });

      const result = await orchestrator.execute(prevSha, newSha, 1);

      // Should succeed with warnings about missing parent
      expect(result.success).toBe(true);
      expect(result.artifactsTransitioned).toContain("F.1");
      // Cascade may fail but hook should still succeed
    });
  });

  describe("E2E: Configuration integration", () => {
    it("should respect enableCascade configuration", async () => {
      await createArtifact("G", "ready");
      await createArtifact("G.1", "ready");
      execSync("git add .", { cwd: gitRoot });
      execSync('git commit -m "Add artifacts"', { cwd: gitRoot });

      const prevSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();
      execSync("git checkout -b G.1", { cwd: gitRoot });
      const newSha = execSync("git rev-parse HEAD", { cwd: gitRoot })
        .toString()
        .trim();

      // Execute with cascade disabled
      const orchestrator = new PostCheckoutOrchestrator({
        baseDir: gitRoot,
        enableCascade: false,
        enableDraftPR: false,
      });

      const result = await orchestrator.execute(prevSha, newSha, 1);

      // Should transition artifact but not cascade
      expect(result.success).toBe(true);
      expect(result.artifactsTransitioned).toContain("G.1");
      expect(result.parentsCascaded).toEqual([]);

      // Parent should remain ready
      const parentState = await getArtifactState("G");
      expect(parentState).toBe("ready");
    });
  });
});
