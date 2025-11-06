/**
 * Tests for PostMergeOrchestrator
 */

import type { CascadeResult, CascadeService } from "@kodebase/artifacts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPostMergeOrchestrator,
  PostMergeOrchestrator,
} from "./post-merge-orchestrator.js";
import type { MergeMetadata } from "./post-merge-types.js";

describe("PostMergeOrchestrator", () => {
  let mockCascadeService: CascadeService;
  let orchestrator: PostMergeOrchestrator;

  beforeEach(() => {
    // Mock CascadeService
    mockCascadeService = {
      executeCompletionCascade: vi.fn(),
      executeReadinessCascade: vi.fn(),
    } as unknown as CascadeService;

    orchestrator = new PostMergeOrchestrator({}, mockCascadeService);
  });

  describe("Basic orchestration", () => {
    it("should execute completion cascade followed by readiness cascade", async () => {
      const mergeMetadata: MergeMetadata = {
        targetBranch: "main",
        sourceBranch: "feature/A.1.5",
        commitSha: "abc123",
        prNumber: 42,
        prTitle: "Implement A.1.5",
        prBody: null,
        isPRMerge: true,
        artifactIds: ["A.1.5"],
      };

      const completionResult: CascadeResult = {
        updatedArtifacts: [],
        events: [
          {
            artifactId: "A.1",
            event: "in_review",
            timestamp: "2025-11-05T18:00:00Z",
            actor: "System Cascade",
            trigger: "children_completed",
          },
        ],
      };

      const readinessResult: CascadeResult = {
        updatedArtifacts: [],
        events: [
          {
            artifactId: "A.1.7",
            event: "ready",
            timestamp: "2025-11-05T18:00:01Z",
            actor: "System Cascade",
            trigger: "dependencies_met",
          },
        ],
      };

      vi.mocked(mockCascadeService.executeCompletionCascade).mockResolvedValue(
        completionResult,
      );
      vi.mocked(mockCascadeService.executeReadinessCascade).mockResolvedValue(
        readinessResult,
      );

      const result = await orchestrator.execute({ mergeMetadata });

      // Verify completion cascade called first
      expect(mockCascadeService.executeCompletionCascade).toHaveBeenCalledWith({
        artifactId: "A.1.5",
        trigger: "pr_merged",
        actor: "System Cascade (cascade@post-merge)",
        baseDir: process.cwd(),
      });

      // Verify readiness cascade called second
      expect(mockCascadeService.executeReadinessCascade).toHaveBeenCalledWith({
        completedArtifactId: "A.1.5",
        trigger: "dependencies_met",
        actor: "System Cascade (cascade@post-merge)",
        baseDir: process.cwd(),
      });

      // Verify results collected
      expect(result.completionCascade.events).toHaveLength(1);
      expect(result.readinessCascade.events).toHaveLength(1);
      expect(result.totalArtifactsUpdated).toBe(2); // A.1 and A.1.7
      expect(result.totalEventsAdded).toBe(2);
    });

    it("should handle multiple artifacts", async () => {
      const mergeMetadata: MergeMetadata = {
        targetBranch: "main",
        sourceBranch: "feature/A.1.5-B.2.3",
        commitSha: "abc123",
        prNumber: 42,
        prTitle: null,
        prBody: null,
        isPRMerge: true,
        artifactIds: ["A.1.5", "B.2.3"],
      };

      vi.mocked(mockCascadeService.executeCompletionCascade).mockResolvedValue({
        updatedArtifacts: [],
        events: [],
      });
      vi.mocked(mockCascadeService.executeReadinessCascade).mockResolvedValue({
        updatedArtifacts: [],
        events: [],
      });

      await orchestrator.execute({ mergeMetadata });

      // Should execute for both artifacts
      expect(mockCascadeService.executeCompletionCascade).toHaveBeenCalledTimes(
        2,
      );
      expect(mockCascadeService.executeReadinessCascade).toHaveBeenCalledTimes(
        2,
      );
    });

    it("should return empty result when no artifact IDs", async () => {
      const mergeMetadata: MergeMetadata = {
        targetBranch: "main",
        sourceBranch: "feature/no-artifact",
        commitSha: "abc123",
        prNumber: 42,
        prTitle: null,
        prBody: null,
        isPRMerge: true,
        artifactIds: [],
      };

      const result = await orchestrator.execute({ mergeMetadata });

      expect(result.summary).toContain("No artifact IDs found");
      expect(result.totalArtifactsUpdated).toBe(0);
      expect(result.totalEventsAdded).toBe(0);
      expect(
        mockCascadeService.executeCompletionCascade,
      ).not.toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    it("should continue after completion cascade error", async () => {
      const mergeMetadata: MergeMetadata = {
        targetBranch: "main",
        sourceBranch: "feature/A.1.5",
        commitSha: "abc123",
        prNumber: 42,
        prTitle: null,
        prBody: null,
        isPRMerge: true,
        artifactIds: ["A.1.5"],
      };

      // Completion cascade fails
      vi.mocked(mockCascadeService.executeCompletionCascade).mockRejectedValue(
        new Error("Completion failed"),
      );

      // Readiness cascade succeeds
      vi.mocked(mockCascadeService.executeReadinessCascade).mockResolvedValue({
        updatedArtifacts: [],
        events: [
          {
            artifactId: "A.1.7",
            event: "ready",
            timestamp: "2025-11-05T18:00:00Z",
            actor: "System Cascade",
            trigger: "dependencies_met",
          },
        ],
      });

      const result = await orchestrator.execute({ mergeMetadata });

      // Should still execute readiness cascade
      expect(mockCascadeService.executeReadinessCascade).toHaveBeenCalled();

      // Should have readiness results
      expect(result.readinessCascade.events).toHaveLength(1);
      expect(result.totalEventsAdded).toBe(1);
    });

    it("should continue after readiness cascade error", async () => {
      const mergeMetadata: MergeMetadata = {
        targetBranch: "main",
        sourceBranch: "feature/A.1.5",
        commitSha: "abc123",
        prNumber: 42,
        prTitle: null,
        prBody: null,
        isPRMerge: true,
        artifactIds: ["A.1.5"],
      };

      // Completion cascade succeeds
      vi.mocked(mockCascadeService.executeCompletionCascade).mockResolvedValue({
        updatedArtifacts: [],
        events: [
          {
            artifactId: "A.1",
            event: "in_review",
            timestamp: "2025-11-05T18:00:00Z",
            actor: "System Cascade",
            trigger: "children_completed",
          },
        ],
      });

      // Readiness cascade fails
      vi.mocked(mockCascadeService.executeReadinessCascade).mockRejectedValue(
        new Error("Readiness failed"),
      );

      const result = await orchestrator.execute({ mergeMetadata });

      // Should have completion results
      expect(result.completionCascade.events).toHaveLength(1);
      expect(result.totalEventsAdded).toBe(1);
    });

    it("should handle errors for individual artifacts gracefully", async () => {
      const mergeMetadata: MergeMetadata = {
        targetBranch: "main",
        sourceBranch: "feature/multi",
        commitSha: "abc123",
        prNumber: 42,
        prTitle: null,
        prBody: null,
        isPRMerge: true,
        artifactIds: ["A.1.5", "B.2.3", "C.3.1"],
      };

      // First artifact fails, others succeed
      vi.mocked(mockCascadeService.executeCompletionCascade)
        .mockRejectedValueOnce(new Error("A.1.5 failed"))
        .mockResolvedValueOnce({ updatedArtifacts: [], events: [] })
        .mockResolvedValueOnce({ updatedArtifacts: [], events: [] });

      vi.mocked(mockCascadeService.executeReadinessCascade).mockResolvedValue({
        updatedArtifacts: [],
        events: [],
      });

      const _result = await orchestrator.execute({ mergeMetadata });

      // Should attempt all artifacts
      expect(mockCascadeService.executeCompletionCascade).toHaveBeenCalledTimes(
        3,
      );
      expect(mockCascadeService.executeReadinessCascade).toHaveBeenCalledTimes(
        3,
      );
    });
  });

  describe("Result collection", () => {
    it("should count unique artifacts updated", async () => {
      const mergeMetadata: MergeMetadata = {
        targetBranch: "main",
        sourceBranch: "feature/A.1.5",
        commitSha: "abc123",
        prNumber: 42,
        prTitle: null,
        prBody: null,
        isPRMerge: true,
        artifactIds: ["A.1.5"],
      };

      // Both cascades update same artifact (A.1)
      vi.mocked(mockCascadeService.executeCompletionCascade).mockResolvedValue({
        updatedArtifacts: [],
        events: [
          {
            artifactId: "A.1",
            event: "in_review",
            timestamp: "2025-11-05T18:00:00Z",
            actor: "System Cascade",
            trigger: "children_completed",
          },
        ],
      });

      vi.mocked(mockCascadeService.executeReadinessCascade).mockResolvedValue({
        updatedArtifacts: [],
        events: [
          {
            artifactId: "A.1",
            event: "ready",
            timestamp: "2025-11-05T18:00:01Z",
            actor: "System Cascade",
            trigger: "dependencies_met",
          },
        ],
      });

      const result = await orchestrator.execute({ mergeMetadata });

      // Should count A.1 only once even though it has 2 events
      expect(result.totalArtifactsUpdated).toBe(1);
      expect(result.totalEventsAdded).toBe(2);
    });

    it("should generate summary with cascade results", async () => {
      const mergeMetadata: MergeMetadata = {
        targetBranch: "main",
        sourceBranch: "feature/A.1.5",
        commitSha: "abc123",
        prNumber: 42,
        prTitle: null,
        prBody: null,
        isPRMerge: true,
        artifactIds: ["A.1.5"],
      };

      vi.mocked(mockCascadeService.executeCompletionCascade).mockResolvedValue({
        updatedArtifacts: [],
        events: [
          {
            artifactId: "A.1",
            event: "in_review",
            timestamp: "2025-11-05T18:00:00Z",
            actor: "System Cascade",
            trigger: "children_completed",
          },
        ],
      });

      vi.mocked(mockCascadeService.executeReadinessCascade).mockResolvedValue({
        updatedArtifacts: [],
        events: [
          {
            artifactId: "A.1.7",
            event: "ready",
            timestamp: "2025-11-05T18:00:01Z",
            actor: "System Cascade",
            trigger: "dependencies_met",
          },
        ],
      });

      const result = await orchestrator.execute({ mergeMetadata });

      expect(result.summary).toContain("A.1.5");
      expect(result.summary).toContain("Completion cascade: 1 event(s)");
      expect(result.summary).toContain("A.1 → in_review");
      expect(result.summary).toContain("Readiness cascade: 1 event(s)");
      expect(result.summary).toContain("A.1.7 → ready");
    });
  });

  describe("Factory function", () => {
    it("should create orchestrator with factory", () => {
      const orch = createPostMergeOrchestrator();
      expect(orch).toBeInstanceOf(PostMergeOrchestrator);
    });

    it("should accept config and custom cascade service", () => {
      const config = { gitRoot: "/custom/path", baseDir: "/custom/base" };
      const orch = createPostMergeOrchestrator(config, mockCascadeService);
      expect(orch).toBeInstanceOf(PostMergeOrchestrator);
    });
  });
});
