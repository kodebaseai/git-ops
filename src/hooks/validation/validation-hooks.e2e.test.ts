/**
 * End-to-end integration tests for validation hooks.
 *
 * Tests pre-commit and pre-push hooks with real git repositories and artifacts.
 * These tests verify the full hook integration including:
 * - Schema validation
 * - Dependency validation
 * - Warning generation
 * - Error message clarity
 *
 * Note: These are slower integration tests that use real git operations.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { PreCommitValidationResult } from "./pre-commit-validator.js";
import { validatePreCommit } from "./pre-commit-validator.js";
import type { PrePushValidationResult } from "./pre-push-validator.js";
import { validatePrePush } from "./pre-push-validator.js";

/**
 * Test fixture for a temporary git repository with artifacts.
 */
interface TestRepo {
  /** Absolute path to the repository */
  path: string;
  /** Cleanup function to remove the repository */
  cleanup: () => Promise<void>;
}

/**
 * Creates a temporary git repository for testing.
 */
async function createTestRepo(): Promise<TestRepo> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "git-ops-test-"));

  // Initialize git repo
  execSync("git init", { cwd: tmpDir });
  execSync('git config user.email "test@example.com"', { cwd: tmpDir });
  execSync('git config user.name "Test User"', { cwd: tmpDir });

  // Create artifacts directory structure
  const artifactsDir = path.join(tmpDir, ".kodebase", "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });

  return {
    path: tmpDir,
    cleanup: async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    },
  };
}

/**
 * Creates a valid test artifact (Issue type).
 */
function createValidArtifact(artifactId: string): string {
  return `metadata:
  title: Test Artifact ${artifactId}
  priority: high
  estimation: S
  created_by: "Test User (test@example.com)"
  assignee: "Test User (test@example.com)"
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "Test User (test@example.com)"
      trigger: artifact_created
content:
  summary: >-
    Test artifact for validation testing.
  acceptance_criteria:
    - "Test criterion 1"
    - "Test criterion 2"
`;
}

/**
 * Creates an artifact with invalid schema (missing required fields).
 */
function createInvalidSchemaArtifact(): string {
  return `metadata:
  title: Invalid Artifact
  # Missing priority, schema_version, relationships, events
content:
  summary: This artifact has invalid schema.
`;
}

/**
 * Creates an artifact with orphaned dependency.
 */
function createArtifactWithOrphanedDependency(
  _artifactId: string,
  missingDepId: string,
): string {
  return `metadata:
  title: Artifact with Orphaned Dependency
  priority: high
  estimation: S
  created_by: "Test User (test@example.com)"
  assignee: "Test User (test@example.com)"
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: ["${missingDepId}"]
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "Test User (test@example.com)"
      trigger: artifact_created
    - event: blocked
      timestamp: "2025-11-06T12:01:00Z"
      actor: "Test User (test@example.com)"
      trigger: has_dependencies
content:
  summary: >-
    This artifact depends on ${missingDepId} which does not exist.
  acceptance_criteria:
    - "Test criterion"
`;
}

/**
 * Creates an artifact in draft state.
 */
function createDraftArtifact(artifactId: string): string {
  return createValidArtifact(artifactId);
}

/**
 * Creates an artifact in blocked state.
 */
function createBlockedArtifact(artifactId: string, blockerId: string): string {
  return `metadata:
  title: Blocked Artifact ${artifactId}
  priority: high
  estimation: S
  created_by: "Test User (test@example.com)"
  assignee: "Test User (test@example.com)"
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: ["${blockerId}"]
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "Test User (test@example.com)"
      trigger: artifact_created
    - event: blocked
      timestamp: "2025-11-06T12:01:00Z"
      actor: "Test User (test@example.com)"
      trigger: has_dependencies
      metadata:
        blocking_dependencies:
          - artifact_id: ${blockerId}
            resolved: false
content:
  summary: >-
    This artifact is blocked by ${blockerId}.
  acceptance_criteria:
    - "Test criterion"
`;
}

/**
 * Writes an artifact file to the test repo.
 */
async function writeArtifact(
  repo: TestRepo,
  artifactId: string,
  content: string,
): Promise<string> {
  // Parse artifact ID to determine directory structure
  // E.g., "C.7.5" -> C.git-ops-package/C.7.validation-hooks/C.7.5.yml
  const parts = artifactId.split(".");
  const letter = parts[0];
  const dirName =
    letter === "C"
      ? "C.git-ops-package"
      : letter === "A"
        ? "A.test-package"
        : `${letter}.package`;

  // Create subdirectory if needed
  let subDir = "";
  if (parts.length >= 2) {
    subDir = `${letter}.${parts[1]}.sub`;
  }

  const dir = subDir
    ? path.join(repo.path, ".kodebase", "artifacts", dirName, subDir)
    : path.join(repo.path, ".kodebase", "artifacts", dirName);

  await fs.mkdir(dir, { recursive: true });

  const filePath = path.join(dir, `${artifactId}.yml`);
  await fs.writeFile(filePath, content, "utf8");

  return filePath;
}

/**
 * Stages a file in git.
 */
function stageFile(repo: TestRepo, filePath: string): void {
  execSync(`git add "${filePath}"`, { cwd: repo.path });
}

/**
 * Commits staged files.
 */
function commit(repo: TestRepo, message: string): void {
  execSync(`git commit -m "${message}"`, { cwd: repo.path });
}

describe("Validation Hooks E2E", () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await createTestRepo();
  });

  afterEach(async () => {
    if (repo) {
      await repo.cleanup();
    }
  });

  describe("Pre-Commit Hook", () => {
    test("blocks commit with invalid schema", async () => {
      const artifactPath = await writeArtifact(
        repo,
        "C.1.1",
        createInvalidSchemaArtifact(),
      );
      stageFile(repo, artifactPath);

      // Run validation from within the test repo
      const originalCwd = process.cwd();
      try {
        process.chdir(repo.path);

        const result: PreCommitValidationResult = await validatePreCommit();

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some((e) => e.type === "INVALID_SCHEMA")).toBe(
          true,
        );

        // Verify error message is clear and actionable
        const schemaError = result.errors.find(
          (e) => e.type === "INVALID_SCHEMA",
        );
        expect(schemaError).toMatchObject({
          artifactId: "C.1.1",
          message: expect.any(String),
          suggestedFix: expect.any(String),
        });
      } finally {
        process.chdir(originalCwd);
      }
    });

    test("blocks commit with orphaned dependencies", async () => {
      // Create artifact that depends on non-existent C.1.2
      const artifactPath = await writeArtifact(
        repo,
        "C.1.1",
        createArtifactWithOrphanedDependency("C.1.1", "C.1.2"),
      );
      stageFile(repo, artifactPath);

      const originalCwd = process.cwd();
      try {
        process.chdir(repo.path);

        const result: PreCommitValidationResult = await validatePreCommit();

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(
          result.errors.some((e) => e.type === "ORPHANED_DEPENDENCY"),
        ).toBe(true);

        // Verify error message is clear and actionable
        const orphanError = result.errors.find(
          (e) => e.type === "ORPHANED_DEPENDENCY",
        );
        expect(orphanError?.message).toContain("C.1.2");
        expect(orphanError?.message).toContain("does not exist");
        expect(orphanError).toMatchObject({
          field: "metadata.relationships.blocked_by",
          suggestedFix: expect.any(String),
        });
      } finally {
        process.chdir(originalCwd);
      }
    });

    test("allows commit with valid artifacts", async () => {
      const artifactPath = await writeArtifact(
        repo,
        "C.1.1",
        createValidArtifact("C.1.1"),
      );
      stageFile(repo, artifactPath);

      const originalCwd = process.cwd();
      try {
        process.chdir(repo.path);

        const result: PreCommitValidationResult = await validatePreCommit();

        // Debug: log errors if validation fails
        if (!result.valid) {
          console.log(
            "Validation errors:",
            JSON.stringify(result.errors, null, 2),
          );
        }

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.artifactsValidated).toBe(1);
      } finally {
        process.chdir(originalCwd);
      }
    });

    test("allows commit with valid dependency chain", async () => {
      // Create C.1.1 first (will be updated with reciprocal relationship)
      const artifact1Content = `metadata:
  title: Blocker Artifact C.1.1
  priority: high
  estimation: S
  created_by: "Test User (test@example.com)"
  assignee: "Test User (test@example.com)"
  schema_version: "0.0.1"
  relationships:
    blocks: ["C.1.2"]
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "Test User (test@example.com)"
      trigger: artifact_created
content:
  summary: >-
    Blocker artifact for dependency testing.
  acceptance_criteria:
    - "Test criterion"
`;
      const artifact1Path = await writeArtifact(
        repo,
        "C.1.1",
        artifact1Content,
      );
      stageFile(repo, artifact1Path);
      commit(repo, "Add C.1.1");

      // Create C.1.2 that depends on C.1.1 (which exists)
      const artifact2Path = await writeArtifact(
        repo,
        "C.1.2",
        createBlockedArtifact("C.1.2", "C.1.1"),
      );
      stageFile(repo, artifact2Path);

      const originalCwd = process.cwd();
      try {
        process.chdir(repo.path);

        const result: PreCommitValidationResult = await validatePreCommit();

        // Debug: log errors if validation fails
        if (!result.valid) {
          console.log(
            "Dependency chain validation errors:",
            JSON.stringify(result.errors, null, 2),
          );
        }

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      } finally {
        process.chdir(originalCwd);
      }
    });

    test("validation error messages are clear and actionable", async () => {
      const artifactPath = await writeArtifact(
        repo,
        "C.1.1",
        createInvalidSchemaArtifact(),
      );
      stageFile(repo, artifactPath);

      const originalCwd = process.cwd();
      try {
        process.chdir(repo.path);

        const result: PreCommitValidationResult = await validatePreCommit();

        expect(result.valid).toBe(false);

        // Verify each error has required fields for clarity
        for (const error of result.errors) {
          expect(typeof error.message).toBe("string");
          expect(error.message.length).toBeGreaterThan(0);
          expect(typeof error.type).toBe("string");
          expect(typeof error.artifactId).toBe("string");

          // Should have either a field path or suggested fix (or both)
          expect(
            typeof error.field === "string" ||
              typeof error.suggestedFix === "string",
          ).toBe(true);
        }
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe("Pre-Push Hook", () => {
    test("warns about uncommitted cascade changes", async () => {
      // Create and commit an artifact
      const artifact1Path = await writeArtifact(
        repo,
        "C.1.1",
        createValidArtifact("C.1.1"),
      );
      stageFile(repo, artifact1Path);
      commit(repo, "Add C.1.1");

      // Create another artifact but don't commit it (simulating cascade changes)
      await writeArtifact(repo, "C.1.2", createValidArtifact("C.1.2"));

      const originalCwd = process.cwd();
      try {
        process.chdir(repo.path);

        const result: PrePushValidationResult = await validatePrePush("C.1.1");

        expect(result.hasWarnings).toBe(true);
        expect(
          result.warnings.some((w) => w.type === "UNCOMMITTED_CHANGES"),
        ).toBe(true);

        // Verify warning is informative
        const warning = result.warnings.find(
          (w) => w.type === "UNCOMMITTED_CHANGES",
        );
        expect(warning?.message).toContain("uncommitted");
        expect(typeof warning?.details).toBe("string");
        expect(warning?.details).toContain(".kodebase/artifacts");
      } finally {
        process.chdir(originalCwd);
      }
    });

    test("warns about draft artifacts", async () => {
      const artifactPath = await writeArtifact(
        repo,
        "C.1.1",
        createDraftArtifact("C.1.1"),
      );
      stageFile(repo, artifactPath);
      commit(repo, "Add draft artifact");

      const originalCwd = process.cwd();
      try {
        process.chdir(repo.path);

        const result: PrePushValidationResult = await validatePrePush("C.1.1");

        expect(result.hasWarnings).toBe(true);
        expect(result.warnings.some((w) => w.type === "DRAFT_ARTIFACT")).toBe(
          true,
        );

        // Verify warning details
        const warning = result.warnings.find(
          (w) => w.type === "DRAFT_ARTIFACT",
        );
        expect(warning?.artifactId).toBe("C.1.1");
        expect(warning?.message).toContain("draft");
        expect(warning?.details).toContain("ready");
      } finally {
        process.chdir(originalCwd);
      }
    });

    test("warns about blocked artifacts", async () => {
      // Create blocker artifact
      const artifact1Path = await writeArtifact(
        repo,
        "C.1.1",
        createValidArtifact("C.1.1"),
      );
      stageFile(repo, artifact1Path);
      commit(repo, "Add C.1.1");

      // Create blocked artifact
      const artifact2Path = await writeArtifact(
        repo,
        "C.1.2",
        createBlockedArtifact("C.1.2", "C.1.1"),
      );
      stageFile(repo, artifact2Path);
      commit(repo, "Add blocked artifact");

      const originalCwd = process.cwd();
      try {
        process.chdir(repo.path);

        const result: PrePushValidationResult = await validatePrePush("C.1.2");

        expect(result.hasWarnings).toBe(true);
        expect(result.warnings.some((w) => w.type === "BLOCKED_ARTIFACT")).toBe(
          true,
        );

        // Verify warning details
        const warning = result.warnings.find(
          (w) => w.type === "BLOCKED_ARTIFACT",
        );
        expect(warning?.artifactId).toBe("C.1.2");
        expect(warning?.message).toContain("blocked");
        expect(warning?.details).toContain("dependencies");
      } finally {
        process.chdir(originalCwd);
      }
    });

    test("allows push despite warnings (non-blocking)", async () => {
      // Create draft artifact
      const artifactPath = await writeArtifact(
        repo,
        "C.1.1",
        createDraftArtifact("C.1.1"),
      );
      stageFile(repo, artifactPath);
      commit(repo, "Add draft artifact");

      const originalCwd = process.cwd();
      try {
        process.chdir(repo.path);

        const result: PrePushValidationResult = await validatePrePush("C.1.1");

        // Should have warnings but not block
        expect(result.hasWarnings).toBe(true);

        // The function returns warnings but doesn't throw or return valid:false
        // This demonstrates non-blocking behavior
        expect(result.warnings.length).toBeGreaterThan(0);
      } finally {
        process.chdir(originalCwd);
      }
    });

    test("validation warning messages are clear and actionable", async () => {
      // Create draft artifact
      const artifactPath = await writeArtifact(
        repo,
        "C.1.1",
        createDraftArtifact("C.1.1"),
      );
      stageFile(repo, artifactPath);
      commit(repo, "Add draft artifact");

      const originalCwd = process.cwd();
      try {
        process.chdir(repo.path);

        const result: PrePushValidationResult = await validatePrePush("C.1.1");

        expect(result.hasWarnings).toBe(true);

        // Verify each warning has required fields for clarity
        for (const warning of result.warnings) {
          expect(typeof warning.message).toBe("string");
          expect(warning.message.length).toBeGreaterThan(0);
          expect(typeof warning.type).toBe("string");

          // Warning should have details or artifact ID
          expect(
            typeof warning.details === "string" ||
              Array.isArray(warning.details) ||
              typeof warning.artifactId === "string",
          ).toBe(true);
        }
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe("Real Git Repository Integration", () => {
    test("uses real git repos with test artifacts", async () => {
      // Verify we're using a real git repo
      const originalCwd = process.cwd();
      try {
        process.chdir(repo.path);

        // Check git is initialized
        const gitDir = await fs.stat(path.join(repo.path, ".git"));
        expect(gitDir.isDirectory()).toBe(true);

        // Verify artifacts directory exists
        const artifactsDir = await fs.stat(
          path.join(repo.path, ".kodebase", "artifacts"),
        );
        expect(artifactsDir.isDirectory()).toBe(true);

        // Create and commit an artifact
        const artifactPath = await writeArtifact(
          repo,
          "C.1.1",
          createValidArtifact("C.1.1"),
        );
        stageFile(repo, artifactPath);
        commit(repo, "Test commit");

        // Verify commit was created
        const log = execSync("git log --oneline", {
          cwd: repo.path,
          encoding: "utf8",
        });
        expect(log).toContain("Test commit");
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
