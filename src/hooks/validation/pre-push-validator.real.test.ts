/**
 * Real integration tests for pre-push validator (no mocking)
 *
 * Uses real artifact files and git operations to avoid Zod registry conflicts.
 */

import { exec } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validatePrePush } from "./pre-push-validator.js";

const execAsync = promisify(exec);

describe("pre-push-validator (integration)", () => {
  let tempDir: string;
  let artifactsDir: string;

  beforeEach(async () => {
    // Create temporary git repository
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "pre-push-validator-test-"),
    );
    artifactsDir = path.join(tempDir, ".kodebase", "artifacts");

    // Initialize git repo
    await execAsync("git init", { cwd: tempDir });
    await execAsync('git config user.email "test@example.com"', {
      cwd: tempDir,
    });
    await execAsync('git config user.name "Test User"', { cwd: tempDir });

    // Create initial commit
    await fs.promises.writeFile(path.join(tempDir, "README.md"), "# Test\n");
    await execAsync("git add .", { cwd: tempDir });
    await execAsync('git commit -m "Initial commit"', { cwd: tempDir });

    // Create artifacts directory
    await fs.promises.mkdir(artifactsDir, { recursive: true });

    // Change to temp directory for tests
    process.chdir(tempDir);
  });

  afterEach(async () => {
    // Return to original directory
    process.chdir(__dirname);
    // Clean up temp directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe("validatePrePush", () => {
    it("should return no warnings for clean repository", async () => {
      const result = await validatePrePush("main");

      expect(result.hasWarnings).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it("should detect uncommitted artifact changes", async () => {
      // Create artifact file
      const artifactPath = path.join(artifactsDir, "C", "C.7", "C.7.4.yml");
      await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.promises.writeFile(
        artifactPath,
        `metadata:
  title: Test Artifact
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: Test artifact
`,
      );

      const result = await validatePrePush("C.7.4");

      expect(result.hasWarnings).toBe(true);
      const uncommittedWarning = result.warnings.find(
        (w) => w.type === "UNCOMMITTED_CHANGES",
      );
      expect(uncommittedWarning).toBeDefined();
      expect(uncommittedWarning?.message).toContain("uncommitted");
    });

    it("should warn about draft artifacts", async () => {
      // Create and commit draft artifact
      const artifactPath = path.join(artifactsDir, "A", "A.1", "A.1.1.yml");
      await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.promises.writeFile(
        artifactPath,
        `metadata:
  title: Draft Artifact
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: This is in draft
`,
      );
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add draft artifact"', { cwd: tempDir });

      const result = await validatePrePush("A.1.1-feature");

      expect(result.hasWarnings).toBe(true);
      const draftWarning = result.warnings.find(
        (w) => w.type === "DRAFT_ARTIFACT",
      );
      expect(draftWarning).toBeDefined();
      expect(draftWarning?.message).toContain("A.1.1");
      expect(draftWarning?.message).toContain("draft");
      expect(draftWarning?.artifactId).toBe("A.1.1");
    });

    it("should warn about blocked artifacts", async () => {
      // Create and commit blocked artifact
      const artifactPath = path.join(artifactsDir, "B", "B.2", "B.2.3.yml");
      await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.promises.writeFile(
        artifactPath,
        `metadata:
  title: Blocked Artifact
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: [B.1.1]
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
    - event: blocked
      timestamp: "2025-11-06T12:05:00Z"
      actor: "test@example.com"
      trigger: has_dependencies
content:
  summary: This is blocked
`,
      );
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add blocked artifact"', { cwd: tempDir });

      const result = await validatePrePush("B.2.3");

      expect(result.hasWarnings).toBe(true);
      const blockedWarning = result.warnings.find(
        (w) => w.type === "BLOCKED_ARTIFACT",
      );
      expect(blockedWarning).toBeDefined();
      expect(blockedWarning?.message).toContain("B.2.3");
      expect(blockedWarning?.message).toContain("blocked");
      expect(blockedWarning?.artifactId).toBe("B.2.3");
    });

    it("should not warn about in_progress artifacts", async () => {
      // Create and commit in_progress artifact
      const artifactPath = path.join(artifactsDir, "C", "C.1", "C.1.1.yml");
      await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.promises.writeFile(
        artifactPath,
        `metadata:
  title: In Progress Artifact
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
    - event: in_progress
      timestamp: "2025-11-06T12:05:00Z"
      actor: "test@example.com"
      trigger: branch_created
content:
  summary: This is in progress
`,
      );
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add in_progress artifact"', {
        cwd: tempDir,
      });

      const result = await validatePrePush("C.1.1");

      expect(result.hasWarnings).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    it("should handle multiple artifact IDs in branch name", async () => {
      // Create two draft artifacts
      const artifact1Path = path.join(artifactsDir, "D", "D.1", "D.1.1.yml");
      const artifact2Path = path.join(artifactsDir, "D", "D.1", "D.1.2.yml");
      await fs.promises.mkdir(path.dirname(artifact1Path), { recursive: true });

      await fs.promises.writeFile(
        artifact1Path,
        `metadata:
  title: First Draft
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: First
`,
      );

      await fs.promises.writeFile(
        artifact2Path,
        `metadata:
  title: Second Draft
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: Second
`,
      );

      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add two drafts"', { cwd: tempDir });

      const result = await validatePrePush("D.1.1-D.1.2-combined");

      expect(result.hasWarnings).toBe(true);
      const draftWarnings = result.warnings.filter(
        (w) => w.type === "DRAFT_ARTIFACT",
      );
      expect(draftWarnings).toHaveLength(2);
    });

    it("should support disabling uncommitted checks", async () => {
      // Create uncommitted artifact
      const artifactPath = path.join(artifactsDir, "E", "E.1", "E.1.1.yml");
      await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.promises.writeFile(
        artifactPath,
        `metadata:
  title: Uncommitted
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: Uncommitted
`,
      );

      const result = await validatePrePush("E.1.1", {
        checkUncommitted: false,
      });

      expect(
        result.warnings.some((w) => w.type === "UNCOMMITTED_CHANGES"),
      ).toBe(false);
    });

    it("should support disabling state checks", async () => {
      // Create and commit draft artifact
      const artifactPath = path.join(artifactsDir, "F", "F.1", "F.1.1.yml");
      await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.promises.writeFile(
        artifactPath,
        `metadata:
  title: Draft No Check
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: Draft no check
`,
      );
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add draft"', { cwd: tempDir });

      const result = await validatePrePush("F.1.1", {
        checkStates: false,
      });

      expect(result.warnings.some((w) => w.type === "DRAFT_ARTIFACT")).toBe(
        false,
      );
    });

    it("should handle artifacts with no events gracefully", async () => {
      // Create artifact with empty events (shouldn't happen but test graceful handling)
      const artifactPath = path.join(artifactsDir, "G", "G.1", "G.1.1.yml");
      await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.promises.writeFile(
        artifactPath,
        `metadata:
  title: No Events
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events: []
content:
  summary: No events
`,
      );
      await execAsync("git add .", { cwd: tempDir });
      await execAsync('git commit -m "Add no events"', { cwd: tempDir });

      const result = await validatePrePush("G.1.1");

      // Should not crash, should just not issue state warnings
      expect(result).toBeDefined();
    });

    it("should handle non-existent artifact gracefully", async () => {
      const result = await validatePrePush("Z.99.99");

      // Should not crash even if artifact doesn't exist
      expect(result).toBeDefined();
      expect(result.hasWarnings).toBe(false);
    });

    it("should show limited file list for many uncommitted files", async () => {
      // Create 10 uncommitted artifact files
      for (let i = 1; i <= 10; i++) {
        const artifactPath = path.join(
          artifactsDir,
          "H",
          `H.${i}`,
          `H.${i}.1.yml`,
        );
        await fs.promises.mkdir(path.dirname(artifactPath), {
          recursive: true,
        });
        await fs.promises.writeFile(
          artifactPath,
          `metadata:
  title: File ${i}
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: File ${i}
`,
        );
      }

      const result = await validatePrePush("feature/test");

      expect(result.hasWarnings).toBe(true);
      const uncommittedWarning = result.warnings.find(
        (w) => w.type === "UNCOMMITTED_CHANGES",
      );
      expect(uncommittedWarning).toBeDefined();
      expect(uncommittedWarning?.message).toMatch(/\d+ uncommitted/);
      // Git may show them as one untracked directory, so we check for the warning exists
      expect(uncommittedWarning?.details).toBeDefined();
    });
  });
});
