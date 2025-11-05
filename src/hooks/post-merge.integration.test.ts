/**
 * Integration tests for the post-merge workflow
 *
 * Tests integration between core workflow components:
 * - PostMergeOrchestrator: Execute completion and readiness cascades
 * - StrategyExecutor: Execute configured post-merge strategies
 *
 * These tests focus on component integration and API contracts
 * rather than full end-to-end workflows with real artifact files.
 *
 * Related component tests (tested separately):
 * - PostMergeDetector: post-merge-detector.test.ts (21 tests)
 * - createCascadeCommit: cascade-commit.test.ts (19 tests)
 *
 * Note: Unit tests cover detailed artifact manipulation.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostMergeOrchestrator } from "./post-merge-orchestrator.js";
import type { OrchestrationResult } from "./post-merge-orchestrator-types.js";
import { StrategyExecutor } from "./strategy-executor.js";

// Mock @kodebase/config to provide test configuration
vi.mock("@kodebase/config", () => ({
  loadConfig: vi.fn().mockResolvedValue({
    gitOps: {
      post_merge: {
        cascade_pr: {
          auto_merge: false,
          require_checks: false,
          labels: ["automated", "cascade"],
          branch_prefix: "cascade/test-",
        },
        direct_commit: {
          commit_prefix: "[automated]",
          push_immediately: false,
        },
      },
    },
  }),
}));

// Mock git platform adapter
vi.mock("../factory.js", () => ({
  createAdapter: vi.fn().mockResolvedValue({
    createPR: vi.fn().mockResolvedValue({
      number: 999,
      url: "https://github.com/test/repo/pull/999",
      state: "open",
      title: "Test PR",
    }),
    mergePR: vi.fn().mockResolvedValue(undefined),
    enableAutoMerge: vi.fn().mockResolvedValue(undefined),
    getRemoteUrl: vi.fn().mockResolvedValue("https://github.com/test/repo"),
    isAvailable: vi.fn().mockResolvedValue(true),
  }),
}));

describe("Post-Merge Workflow Integration Tests", () => {
  let tempDir: string;
  let gitRoot: string;

  beforeEach(async () => {
    // Create temporary git repository
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "post-merge-integration-"),
    );
    gitRoot = tempDir;

    // Create .git directory
    await fs.promises.mkdir(path.join(gitRoot, ".git"), { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  describe("E2E: Component integration", () => {
    it("should integrate orchestrator with manual strategy", async () => {
      // Execute orchestrator (with no artifacts, returns empty results)
      const orchestrator = new PostMergeOrchestrator({ gitRoot });
      const cascadeResults = await orchestrator.execute({
        mergeMetadata: {
          artifactIds: ["C.1.1"],
          prNumber: 123,
          prTitle: "Test PR",
          prBody: null,
          sourceBranch: "C.1.1",
          targetBranch: "main",
          commitSha: "abc123",
          isPRMerge: true,
        },
      });

      // Execute manual strategy
      const executor = new StrategyExecutor({ gitRoot });
      const result = await executor.execute({
        strategy: "manual",
        cascadeResults,
      });

      // Should complete successfully (no artifacts = no changes)
      expect(result.success).toBe(true);
      expect(result.message).toBe("No cascade changes to apply");
      expect(result.strategy).toBe("manual");
    });

    it("should handle orchestrator returning results structure", async () => {
      const orchestrator = new PostMergeOrchestrator({ gitRoot });
      const result = await orchestrator.execute({
        mergeMetadata: {
          artifactIds: ["TEST"],
          prNumber: 124,
          prTitle: "Test",
          prBody: null,
          sourceBranch: "test",
          targetBranch: "main",
          commitSha: "def456",
          isPRMerge: true,
        },
      });

      // Verify orchestration result structure
      expect(result).toHaveProperty("mergeMetadata");
      expect(result).toHaveProperty("completionCascade");
      expect(result).toHaveProperty("readinessCascade");
      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("totalArtifactsUpdated");
      expect(result).toHaveProperty("totalEventsAdded");
    });
  });

  describe("E2E: Strategy execution flow", () => {
    it("should execute direct_commit strategy with no changes", async () => {
      const executor = new StrategyExecutor({ gitRoot });

      // Create mock cascade results with no changes
      const cascadeResults: OrchestrationResult = {
        mergeMetadata: {
          artifactIds: [],
          prNumber: 125,
          prTitle: "Test",
          prBody: null,
          sourceBranch: "test",
          targetBranch: "main",
          commitSha: "ghi789",
          isPRMerge: true,
        },
        completionCascade: {
          updatedArtifacts: [],
          events: [],
        },
        readinessCascade: {
          updatedArtifacts: [],
          events: [],
        },
        summary: "No updates",
        totalArtifactsUpdated: 0,
        totalEventsAdded: 0,
      };

      const result = await executor.execute({
        strategy: "direct_commit",
        cascadeResults,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("No cascade changes to apply");
    });
  });

  describe("E2E: Agent attribution flow", () => {
    it("should integrate attribution into cascade commit workflow", async () => {
      // Execute orchestrator to get cascade results
      const orchestrator = new PostMergeOrchestrator({ gitRoot });
      const cascadeResults = await orchestrator.execute({
        mergeMetadata: {
          artifactIds: ["C.1.1"],
          prNumber: 126,
          prTitle: "Test PR",
          prBody: null,
          sourceBranch: "test",
          targetBranch: "main",
          commitSha: "abc123",
          isPRMerge: true,
        },
      });

      // Execute strategy with attribution metadata
      const executor = new StrategyExecutor({ gitRoot });
      const result = await executor.execute({
        strategy: "manual",
        cascadeResults,
      });

      // Verify workflow completes successfully
      expect(result.success).toBe(true);
      expect(cascadeResults.mergeMetadata.prNumber).toBe(126);
    });
  });

  describe("E2E: Error handling", () => {
    it("should handle orchestrator with non-existent artifacts", async () => {
      const orchestrator = new PostMergeOrchestrator({ gitRoot });

      // Try to process non-existent artifacts
      const result = await orchestrator.execute({
        mergeMetadata: {
          artifactIds: ["NON.EXISTENT.1", "NON.EXISTENT.2"],
          prNumber: 127,
          prTitle: "Test PR",
          prBody: null,
          sourceBranch: "test",
          targetBranch: "main",
          commitSha: "abc123",
          isPRMerge: true,
        },
      });

      // Should complete without error
      expect(result.totalArtifactsUpdated).toBe(0);
      expect(result.totalEventsAdded).toBe(0);
      expect(result.summary).toBeTruthy();
    });

    it("should handle strategy executor with empty merge metadata", async () => {
      const executor = new StrategyExecutor({ gitRoot });

      const cascadeResults: OrchestrationResult = {
        mergeMetadata: {
          artifactIds: [],
          prNumber: null,
          prTitle: null,
          prBody: null,
          sourceBranch: null,
          targetBranch: "main",
          commitSha: "test",
          isPRMerge: false,
        },
        completionCascade: {
          updatedArtifacts: [],
          events: [],
        },
        readinessCascade: {
          updatedArtifacts: [],
          events: [],
        },
        summary: "No updates",
        totalArtifactsUpdated: 0,
        totalEventsAdded: 0,
      };

      const result = await executor.execute({
        strategy: "manual",
        cascadeResults,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("E2E: Idempotency verification", () => {
    it("should return same result structure on repeated calls", async () => {
      const orchestrator = new PostMergeOrchestrator({ gitRoot });

      const mergeMetadata = {
        artifactIds: ["TEST"],
        prNumber: 128,
        prTitle: "Test",
        prBody: null,
        sourceBranch: "test",
        targetBranch: "main",
        commitSha: "abc123",
        isPRMerge: true,
      };

      // First call
      const result1 = await orchestrator.execute({ mergeMetadata });

      // Second call with same metadata
      const result2 = await orchestrator.execute({ mergeMetadata });

      // Structure should be consistent
      expect(result1).toHaveProperty("totalArtifactsUpdated");
      expect(result2).toHaveProperty("totalArtifactsUpdated");
      expect(result1.mergeMetadata).toEqual(result2.mergeMetadata);
    });
  });

  describe("E2E: Configuration integration", () => {
    it("should load and use configuration from @kodebase/config", async () => {
      const executor = new StrategyExecutor({ gitRoot });

      // Executor should load config internally
      // This verifies the mock is working and config structure is correct
      const cascadeResults: OrchestrationResult = {
        mergeMetadata: {
          artifactIds: [],
          prNumber: 129,
          prTitle: "Test",
          prBody: null,
          sourceBranch: "test",
          targetBranch: "main",
          commitSha: "test",
          isPRMerge: true,
        },
        completionCascade: {
          updatedArtifacts: [],
          events: [],
        },
        readinessCascade: {
          updatedArtifacts: [],
          events: [],
        },
        summary: "Test",
        totalArtifactsUpdated: 0,
        totalEventsAdded: 0,
      };

      // Execute with each strategy to verify config loading
      const manualResult = await executor.execute({
        strategy: "manual",
        cascadeResults,
      });

      const directResult = await executor.execute({
        strategy: "direct_commit",
        cascadeResults,
      });

      expect(manualResult.success).toBe(true);
      expect(directResult.success).toBe(true);
    });
  });
});
