/**
 * Tests for cascade commit creation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as execModule from "../../utils/exec.js";
import type { MergeMetadata } from "../detection/post-merge-types.js";
import type { OrchestrationResult } from "../orchestration/post-merge-orchestrator-types.js";
import { createCascadeCommit } from "./cascade-commit.js";
import type { CascadeCommitAttribution } from "./cascade-commit-types.js";

// Mock execAsync
vi.mock("../../utils/exec.js", () => ({
  execAsync: vi.fn(),
}));

describe("createCascadeCommit", () => {
  const execAsyncMock = vi.mocked(execModule.execAsync);

  // Mock data
  const mockMergeMetadata: MergeMetadata = {
    artifactIds: ["C.1.1", "C.1.2"],
    prNumber: 123,
    prTitle: "Test PR",
    prBody: null,
    sourceBranch: "feature-branch",
    targetBranch: "main",
    commitSha: "abc123",
    isPRMerge: true,
  };

  const mockCascadeResults: OrchestrationResult = {
    mergeMetadata: mockMergeMetadata,
    completionCascade: {
      updatedArtifacts: [
        {
          artifact: {
            metadata: {
              title: "Test Artifact",
              priority: "high",
              estimation: "M",
              created_by: "test@example.com",
              schema_version: "0.0.1",
              events: [],
            },
            content: {
              summary: "Test",
              acceptance_criteria: [],
            },
          },
          filePath: ".kodebase/artifacts/C.1.1.yml",
        },
      ],
      events: [
        {
          artifactId: "C.1.1",
          event: "completed",
          timestamp: "2025-11-05T10:00:00Z",
          actor: "System",
          trigger: "cascade",
        },
      ],
    },
    readinessCascade: {
      updatedArtifacts: [
        {
          artifact: {
            metadata: {
              title: "Test Artifact 2",
              priority: "high",
              estimation: "M",
              created_by: "test@example.com",
              schema_version: "0.0.1",
              events: [],
            },
            content: {
              summary: "Test",
              acceptance_criteria: [],
            },
          },
          filePath: ".kodebase/artifacts/C.1.2.yml",
        },
      ],
      events: [
        {
          artifactId: "C.1.2",
          event: "ready",
          timestamp: "2025-11-05T10:01:00Z",
          actor: "System",
          trigger: "cascade",
        },
      ],
    },
    summary: "Updated 2 artifacts",
    totalArtifactsUpdated: 2,
    totalEventsAdded: 2,
  };

  const mockAttribution: CascadeCommitAttribution = {
    agentName: "Kodebase GitOps",
    agentVersion: "v1.0.0",
    triggerEvent: "post-merge",
    prNumber: 123,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("successful commit creation", () => {
    it("should create commit with cascade changes", async () => {
      // Mock git commands
      execAsyncMock
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "",
          exitCode: 0,
        }) // git add
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "",
          exitCode: 0,
        }) // git commit
        .mockResolvedValueOnce({
          stdout: "abc123def456",
          stderr: "",
          exitCode: 0,
        }); // git rev-parse HEAD

      const result = await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
      });

      expect(result.success).toBe(true);
      expect(result.commitSha).toBe("abc123def456");
      expect(result.filesChanged).toBe(2);
      expect(result.message).toContain("cascade: Update artifact states");
    });

    it("should stage artifact YAML files", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
        gitRoot: "/test/repo",
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        "git add .kodebase/artifacts/**/*.yml",
        { cwd: "/test/repo" },
      );
    });

    it("should use custom git root", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
        gitRoot: "/custom/path",
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ cwd: "/custom/path" }),
      );
    });

    it("should use custom author name and email", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
        authorName: "Custom Agent",
        authorEmail: "custom@example.com",
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        expect.stringContaining('"Custom Agent"'),
        expect.any(Object),
      );
      expect(execAsyncMock).toHaveBeenCalledWith(
        expect.stringContaining('"custom@example.com"'),
        expect.any(Object),
      );
    });
  });

  describe("commit message format", () => {
    it("should include PR number in title", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      const result = await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
      });

      expect(result.message).toContain("(PR #123)");
    });

    it("should list affected artifacts", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      const result = await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
      });

      expect(result.message).toContain("Affected artifacts:");
      expect(result.message).toContain("- C.1.1: completed");
      expect(result.message).toContain("- C.1.2: ready");
    });

    it("should include agent attribution footer", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      const result = await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
      });

      expect(result.message).toContain(
        "Agent-Attribution: Kodebase GitOps/v1.0.0",
      );
      expect(result.message).toContain("Trigger: post-merge (PR #123)");
    });

    it("should handle missing PR number", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      const resultsNoPR: OrchestrationResult = {
        ...mockCascadeResults,
        mergeMetadata: {
          ...mockMergeMetadata,
          prNumber: null,
        },
      };

      const attributionNoPR: CascadeCommitAttribution = {
        ...mockAttribution,
        prNumber: undefined,
      };

      const result = await createCascadeCommit({
        cascadeResults: resultsNoPR,
        attribution: attributionNoPR,
      });

      expect(result.message).not.toContain("(PR #");
      expect(result.message).toContain("Trigger: post-merge");
    });

    it("should add Co-Authored-By when human actor provided", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      const attributionWithHuman: CascadeCommitAttribution = {
        ...mockAttribution,
        humanActor: "john@example.com",
      };

      await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: attributionWithHuman,
      });

      // Check that commit message includes Co-Authored-By
      expect(execAsyncMock).toHaveBeenCalledWith(
        expect.stringContaining("Co-Authored-By: john@example.com"),
        expect.any(Object),
      );
    });
  });

  describe("no changes scenario", () => {
    it("should return success with no commit when no artifacts updated", async () => {
      const emptyResults: OrchestrationResult = {
        ...mockCascadeResults,
        totalArtifactsUpdated: 0,
        totalEventsAdded: 0,
      };

      const result = await createCascadeCommit({
        cascadeResults: emptyResults,
        attribution: mockAttribution,
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe("No cascade changes to commit");
      expect(result.filesChanged).toBe(0);
      expect(result.commitSha).toBeUndefined();
      expect(execAsyncMock).not.toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should handle git add failure", async () => {
      execAsyncMock.mockResolvedValueOnce({
        stdout: "",
        stderr: "Permission denied",
        exitCode: 1,
      });

      const result = await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to stage changes");
    });

    it("should handle git commit failure", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git add success
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "Nothing to commit",
          exitCode: 1,
        }); // git commit fails

      const result = await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to create commit");
    });

    it("should handle git rev-parse failure", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git commit
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "Not a git repository",
          exitCode: 1,
        }); // git rev-parse fails

      const result = await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to get commit SHA");
    });

    it("should handle exception during commit", async () => {
      execAsyncMock.mockRejectedValueOnce(new Error("Unexpected error"));

      const result = await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unexpected error");
    });
  });

  describe("affected artifacts collection", () => {
    it("should group multiple events for same artifact", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      const resultsMultipleEvents: OrchestrationResult = {
        ...mockCascadeResults,
        completionCascade: {
          ...mockCascadeResults.completionCascade,
          events: [
            {
              artifactId: "C.1.1",
              event: "completed",
              timestamp: "2025-11-05T10:00:00Z",
              actor: "System",
              trigger: "cascade",
            },
          ],
        },
        readinessCascade: {
          ...mockCascadeResults.readinessCascade,
          events: [
            {
              artifactId: "C.1.1",
              event: "ready",
              timestamp: "2025-11-05T10:01:00Z",
              actor: "System",
              trigger: "cascade",
            },
          ],
        },
      };

      const result = await createCascadeCommit({
        cascadeResults: resultsMultipleEvents,
        attribution: mockAttribution,
      });

      expect(result.message).toContain("- C.1.1: completed, ready");
    });

    it("should sort artifacts alphabetically", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      const resultsUnsorted: OrchestrationResult = {
        ...mockCascadeResults,
        completionCascade: {
          ...mockCascadeResults.completionCascade,
          events: [
            {
              artifactId: "C.2.1",
              event: "completed",
              timestamp: "2025-11-05T10:00:00Z",
              actor: "System",
              trigger: "cascade",
            },
            {
              artifactId: "C.1.1",
              event: "completed",
              timestamp: "2025-11-05T10:00:00Z",
              actor: "System",
              trigger: "cascade",
            },
          ],
        },
        readinessCascade: {
          updatedArtifacts: [],
          events: [],
        },
      };

      const result = await createCascadeCommit({
        cascadeResults: resultsUnsorted,
        attribution: mockAttribution,
      });

      const c11Index = result.message?.indexOf("- C.1.1") ?? -1;
      const c21Index = result.message?.indexOf("- C.2.1") ?? -1;

      expect(c11Index).toBeLessThan(c21Index);
    });
  });

  describe("default values", () => {
    it("should use default author name from attribution", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        expect.stringContaining('"Kodebase GitOps"'),
        expect.any(Object),
      );
    });

    it("should use default author email", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        expect.stringContaining('"noreply@kodebase.ai"'),
        expect.any(Object),
      );
    });

    it("should use process.cwd() as default git root", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 })
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 });

      await createCascadeCommit({
        cascadeResults: mockCascadeResults,
        attribution: mockAttribution,
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ cwd: process.cwd() }),
      );
    });
  });
});
