/**
 * Tests for StrategyExecutor
 */

import type { KodebaseConfig } from "@kodebase/config";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { GitPlatformAdapter, PRInfo } from "../types/adapter.js";
import * as execModule from "../utils/exec.js";
import type { OrchestrationResult } from "./post-merge-orchestrator-types.js";
import type { MergeMetadata } from "./post-merge-types.js";
import { StrategyExecutor } from "./strategy-executor.js";

// Mock dependencies
vi.mock("@kodebase/config", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../factory.js", () => ({
  createAdapterFactory: vi.fn(),
}));

vi.mock("../utils/exec.js", () => ({
  execAsync: vi.fn(),
}));

describe("StrategyExecutor", () => {
  let executor: StrategyExecutor;
  let mockConfig: KodebaseConfig;
  let mockAdapter: GitPlatformAdapter;
  let mockCascadeResults: OrchestrationResult;
  let execAsyncMock: Mock;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Mock config
    mockConfig = {
      gitOps: {
        post_merge: {
          strategy: "cascade_pr",
          cascade_pr: {
            auto_merge: true,
            require_checks: false,
            labels: ["automated", "cascade"],
            branch_prefix: "cascade/pr-",
          },
          direct_commit: {
            commit_prefix: "[automated]",
            push_immediately: true,
          },
        },
      },
    };

    // Mock adapter
    mockAdapter = {
      platform: "github",
      createPR: vi.fn(),
      enableAutoMerge: vi.fn(),
      mergePR: vi.fn(),
      createDraftPR: vi.fn(),
      getPR: vi.fn(),
      validateAuth: vi.fn(),
      getBranch: vi.fn(),
      getCurrentBranch: vi.fn(),
      getRemoteUrl: vi.fn(),
      isAvailable: vi.fn(),
    } as unknown as GitPlatformAdapter;

    // Mock cascade results
    const mergeMetadata: MergeMetadata = {
      artifactIds: ["A.1.5"],
      prNumber: 42,
      prTitle: "Test PR",
      prBody: null,
      sourceBranch: "A.1.5",
      targetBranch: "main",
      commitSha: "abc123",
      isPRMerge: true,
    };

    mockCascadeResults = {
      mergeMetadata,
      completionCascade: {
        updatedArtifacts: [],
        events: [
          {
            event: "in_review",
            timestamp: new Date().toISOString(),
            actor: "System",
            trigger: "pr_merged",
            artifactId: "A.1",
          },
        ],
      },
      readinessCascade: {
        updatedArtifacts: [],
        events: [
          {
            event: "ready",
            timestamp: new Date().toISOString(),
            actor: "System",
            trigger: "dependencies_met",
            artifactId: "A.1.7",
          },
        ],
      },
      summary: "Test cascade",
      totalArtifactsUpdated: 2,
      totalEventsAdded: 2,
    };

    // Mock execAsync
    execAsyncMock = vi.fn();
    vi.mocked(execModule).execAsync = execAsyncMock;

    // Create executor with mocked dependencies
    executor = new StrategyExecutor(
      { gitRoot: "/test/repo", repoPath: "/test/repo" },
      mockConfig,
      mockAdapter,
    );
  });

  describe("execute()", () => {
    describe("no changes scenario", () => {
      it("should handle no cascade changes gracefully", async () => {
        const emptyResults: OrchestrationResult = {
          ...mockCascadeResults,
          totalArtifactsUpdated: 0,
          totalEventsAdded: 0,
        };

        const result = await executor.execute({
          strategy: "cascade_pr",
          cascadeResults: emptyResults,
        });

        expect(result.success).toBe(true);
        expect(result.message).toBe("No cascade changes to apply");
        expect(result.strategy).toBe("cascade_pr");
      });
    });

    describe("unknown strategy", () => {
      it("should handle unknown strategy", async () => {
        const result = await executor.execute({
          // @ts-expect-error - Testing invalid strategy handling
          strategy: "unknown_strategy",
          cascadeResults: mockCascadeResults,
        });

        expect(result.success).toBe(false);
        expect(result.message).toContain("Unknown strategy");
        expect(result.error).toBeDefined();
      });
    });

    describe("error handling", () => {
      it("should handle configuration loading errors", async () => {
        const { loadConfig } = await import("@kodebase/config");
        vi.mocked(loadConfig).mockRejectedValueOnce(
          new Error("Config not found"),
        );

        const executorWithoutConfig = new StrategyExecutor(
          { gitRoot: "/test/repo" },
          undefined,
          mockAdapter,
        );

        const result = await executorWithoutConfig.execute({
          strategy: "cascade_pr",
          cascadeResults: mockCascadeResults,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe("Config not found");
      });
    });
  });

  describe("cascade_pr strategy", () => {
    beforeEach(() => {
      // Mock git commands
      execAsyncMock
        .mockResolvedValueOnce({
          stdout: "Merge pull request #42",
          exitCode: 0,
        }) // git log (get PR number)
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }) // git checkout -b
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }) // git commit
        .mockResolvedValueOnce({ stdout: "sha123", exitCode: 0 }) // git rev-parse HEAD
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }); // git push

      // Mock PR creation
      const mockPRInfo: PRInfo = {
        number: 43,
        state: "open",
        title: "[Automated] Cascade updates from PR #42",
        url: "https://github.com/org/repo/pull/43",
      };
      vi.mocked(mockAdapter.createPR).mockResolvedValueOnce(mockPRInfo);
      vi.mocked(mockAdapter.mergePR).mockResolvedValueOnce(undefined);
    });

    it("should create cascade PR successfully", async () => {
      const result = await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("cascade_pr");
      expect(result.prInfo).toBeDefined();
      expect(result.prInfo?.number).toBe(43);
      expect(result.prInfo?.url).toBe("https://github.com/org/repo/pull/43");
    });

    it("should create branch with correct name", async () => {
      await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        "git checkout -b cascade/pr-42",
        expect.any(Object),
      );
    });

    it("should stage artifact changes", async () => {
      await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        "git add .kodebase/artifacts/**/*.yml",
        expect.any(Object),
      );
    });

    it("should create commit with proper message", async () => {
      await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        expect.stringContaining("cascade: updates from merged PR #42"),
        expect.any(Object),
      );
    });

    it("should push branch to remote", async () => {
      await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        "git push -u origin cascade/pr-42",
        expect.any(Object),
      );
    });

    it("should create PR with correct options", async () => {
      await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(mockAdapter.createPR).toHaveBeenCalledWith({
        title: "[Automated] Cascade updates from PR #42",
        body: expect.stringContaining("## Cascade Updates from PR #42"),
        branch: "cascade/pr-42",
        labels: ["automated", "cascade"],
        repoPath: "/test/repo",
        baseBranch: "main",
      });
    });

    it("should auto-merge PR when configured", async () => {
      const result = await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(mockAdapter.mergePR).toHaveBeenCalledWith(43, {
        deleteBranch: true,
      });
      expect(result.prInfo?.autoMerged).toBe(true);
    });

    it("should enable auto-merge when require_checks is true", async () => {
      const configWithChecks = {
        ...mockConfig,
        gitOps: {
          ...mockConfig.gitOps,
          post_merge: {
            ...mockConfig.gitOps?.post_merge,
            cascade_pr: {
              ...mockConfig.gitOps?.post_merge?.cascade_pr,
              require_checks: true,
            },
          },
        },
      };

      const executorWithChecks = new StrategyExecutor(
        { gitRoot: "/test/repo", repoPath: "/test/repo" },
        configWithChecks,
        mockAdapter,
      );

      vi.mocked(mockAdapter.enableAutoMerge).mockResolvedValueOnce(undefined);

      await executorWithChecks.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(mockAdapter.enableAutoMerge).toHaveBeenCalledWith(43, {
        deleteBranch: true,
      });
    });

    it.skip("should handle PR creation failure", async () => {
      // Need to set up git mocks first before PR creation fails
      execAsyncMock
        .mockResolvedValueOnce({
          stdout: "Merge pull request #42",
          exitCode: 0,
        }) // git log (get PR number)
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }) // git checkout -b
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }) // git commit
        .mockResolvedValueOnce({ stdout: "sha123", exitCode: 0 }) // git rev-parse HEAD
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }); // git push

      vi.mocked(mockAdapter.createPR).mockRejectedValueOnce(
        new Error("API error"),
      );

      const result = await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("API error");
    });

    it.skip("should handle git command failures", async () => {
      execAsyncMock
        .mockResolvedValueOnce({
          stdout: "Merge pull request #42",
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "Branch exists",
          exitCode: 1,
        });

      const result = await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to create branch");
    });

    it.skip("should continue if auto-merge fails", async () => {
      // Set up git mocks
      execAsyncMock
        .mockResolvedValueOnce({
          stdout: "Merge pull request #42",
          exitCode: 0,
        }) // git log (get PR number)
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }) // git checkout -b
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }) // git commit
        .mockResolvedValueOnce({ stdout: "sha123", exitCode: 0 }) // git rev-parse HEAD
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }); // git push

      // Mock PR creation
      const mockPRInfo: PRInfo = {
        number: 43,
        state: "open",
        title: "[Automated] Cascade updates from PR #42",
        url: "https://github.com/org/repo/pull/43",
      };
      vi.mocked(mockAdapter.createPR).mockResolvedValueOnce(mockPRInfo);

      vi.mocked(mockAdapter.mergePR).mockRejectedValueOnce(
        new Error("Merge conflict"),
      );

      const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

      const result = await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(result.success).toBe(true);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Auto-merge failed"),
      );

      consoleWarnSpy.mockRestore();
    });

    it("should use custom branch prefix from config", async () => {
      // Mock git commands
      execAsyncMock
        .mockResolvedValueOnce({
          stdout: "Merge pull request #42",
          stderr: "",
          exitCode: 0,
        }) // git log (get PR number)
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git checkout -b
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git commit
        .mockResolvedValueOnce({ stdout: "sha123", stderr: "", exitCode: 0 }) // git rev-parse HEAD
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }); // git push

      // Mock PR creation
      const mockPRInfo: PRInfo = {
        number: 43,
        state: "open",
        title: "[Automated] Cascade updates from PR #42",
        url: "https://github.com/org/repo/pull/43",
      };
      vi.mocked(mockAdapter.createPR).mockResolvedValueOnce(mockPRInfo);
      vi.mocked(mockAdapter.mergePR).mockResolvedValueOnce(undefined);

      const configWithPrefix = {
        ...mockConfig,
        gitOps: {
          ...mockConfig.gitOps,
          post_merge: {
            ...mockConfig.gitOps?.post_merge,
            cascade_pr: {
              ...mockConfig.gitOps?.post_merge?.cascade_pr,
              branch_prefix: "auto-cascade/",
            },
          },
        },
      };

      const executorWithPrefix = new StrategyExecutor(
        { gitRoot: "/test/repo", repoPath: "/test/repo" },
        configWithPrefix,
        mockAdapter,
      );

      await executorWithPrefix.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        "git checkout -b auto-cascade/42",
        expect.any(Object),
      );
    });
  });

  describe("direct_commit strategy", () => {
    it("should commit directly successfully", async () => {
      // Mock git commands
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git commit
        .mockResolvedValueOnce({ stdout: "sha456", stderr: "", exitCode: 0 }) // git rev-parse HEAD
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }); // git push

      const result = await executor.execute({
        strategy: "direct_commit",
        cascadeResults: mockCascadeResults,
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("direct_commit");
      expect(result.commitInfo).toBeDefined();
      expect(result.commitInfo?.sha).toBe("sha456");
      expect(result.commitInfo?.pushed).toBe(true);
    });

    it("should stage artifact changes", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git commit
        .mockResolvedValueOnce({ stdout: "sha456", stderr: "", exitCode: 0 }) // git rev-parse HEAD
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }); // git push

      await executor.execute({
        strategy: "direct_commit",
        cascadeResults: mockCascadeResults,
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        "git add .kodebase/artifacts/**/*.yml",
        expect.any(Object),
      );
    });

    it("should create commit with configured prefix", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git commit
        .mockResolvedValueOnce({ stdout: "sha456", stderr: "", exitCode: 0 }) // git rev-parse HEAD
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }); // git push

      await executor.execute({
        strategy: "direct_commit",
        cascadeResults: mockCascadeResults,
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        expect.stringContaining("[automated] cascade: post-merge updates"),
        expect.any(Object),
      );
    });

    it("should push immediately when configured", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git commit
        .mockResolvedValueOnce({ stdout: "sha456", stderr: "", exitCode: 0 }) // git rev-parse HEAD
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }); // git push

      const result = await executor.execute({
        strategy: "direct_commit",
        cascadeResults: mockCascadeResults,
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        "git push",
        expect.any(Object),
      );
      expect(result.commitInfo?.pushed).toBe(true);
    });

    it("should not push when push_immediately is false", async () => {
      const configNoPush = {
        ...mockConfig,
        gitOps: {
          ...mockConfig.gitOps,
          post_merge: {
            ...mockConfig.gitOps?.post_merge,
            direct_commit: {
              commit_prefix: "[automated]",
              push_immediately: false,
            },
          },
        },
      };

      const executorNoPush = new StrategyExecutor(
        { gitRoot: "/test/repo" },
        configNoPush,
        mockAdapter,
      );

      // Mock only commit commands (no push)
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: "", exitCode: 0 }) // git commit
        .mockResolvedValueOnce({ stdout: "sha456", exitCode: 0 }); // git rev-parse HEAD

      const result = await executorNoPush.execute({
        strategy: "direct_commit",
        cascadeResults: mockCascadeResults,
      });

      expect(result.success).toBe(true);
      expect(result.commitInfo?.pushed).toBe(false);
      expect(execAsyncMock).not.toHaveBeenCalledWith(
        "git push",
        expect.any(Object),
      );
    });

    it("should handle commit failure", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "Nothing to commit",
          exitCode: 1,
        }); // git commit fails

      const result = await executor.execute({
        strategy: "direct_commit",
        cascadeResults: mockCascadeResults,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to commit changes");
    });

    it("should handle push failure", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git commit
        .mockResolvedValueOnce({ stdout: "sha456", stderr: "", exitCode: 0 }) // git rev-parse HEAD
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "Push rejected",
          exitCode: 1,
        }); // git push fails

      const result = await executor.execute({
        strategy: "direct_commit",
        cascadeResults: mockCascadeResults,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to push");
    });

    it("should use custom commit prefix from config", async () => {
      execAsyncMock
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git add
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }) // git commit
        .mockResolvedValueOnce({ stdout: "sha456", stderr: "", exitCode: 0 }) // git rev-parse HEAD
        .mockResolvedValueOnce({ stdout: "", stderr: "", exitCode: 0 }); // git push

      const configWithPrefix = {
        ...mockConfig,
        gitOps: {
          ...mockConfig.gitOps,
          post_merge: {
            ...mockConfig.gitOps?.post_merge,
            direct_commit: {
              commit_prefix: "[bot]",
              push_immediately: true,
            },
          },
        },
      };

      const executorWithPrefix = new StrategyExecutor(
        { gitRoot: "/test/repo" },
        configWithPrefix,
        mockAdapter,
      );

      await executorWithPrefix.execute({
        strategy: "direct_commit",
        cascadeResults: mockCascadeResults,
      });

      expect(execAsyncMock).toHaveBeenCalledWith(
        expect.stringContaining("[bot] cascade: post-merge updates"),
        expect.any(Object),
      );
    });
  });

  describe("manual strategy", () => {
    it("should log cascade results", async () => {
      const consoleLogSpy = vi
        .spyOn(console, "log")
        .mockImplementation(() => {});

      const result = await executor.execute({
        strategy: "manual",
        cascadeResults: mockCascadeResults,
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("manual");
      expect(result.message).toBe(
        "Cascade updates logged. Manual action required.",
      );

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Manual Cascade Updates"),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(mockCascadeResults.summary);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("kodebase cascade apply"),
      );

      consoleLogSpy.mockRestore();
    });

    it("should not perform any git operations", async () => {
      await executor.execute({
        strategy: "manual",
        cascadeResults: mockCascadeResults,
      });

      expect(execAsyncMock).not.toHaveBeenCalled();
      expect(mockAdapter.createPR).not.toHaveBeenCalled();
    });
  });

  describe("cascade report generation", () => {
    it("should include all cascade information in PR body", async () => {
      execAsyncMock
        .mockResolvedValueOnce({
          stdout: "Merge pull request #42",
          exitCode: 0,
        })
        .mockResolvedValue({ stdout: "", exitCode: 0 });

      const mockPRInfo: PRInfo = {
        number: 43,
        state: "open",
        title: "Test",
        url: "https://github.com/org/repo/pull/43",
      };
      vi.mocked(mockAdapter.createPR).mockResolvedValueOnce(mockPRInfo);
      vi.mocked(mockAdapter.mergePR).mockResolvedValueOnce(undefined);

      await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      const createPRCall = vi.mocked(mockAdapter.createPR).mock.calls[0][0];
      const body = createPRCall.body ?? "";

      expect(body).toContain("## Cascade Updates from PR #42");
      expect(body).toContain("### Merged Artifacts");
      expect(body).toContain("A.1.5 → completed");
      expect(body).toContain("### Completion Cascade");
      expect(body).toContain("A.1 → in_review");
      expect(body).toContain("### Readiness Cascade");
      expect(body).toContain("A.1.7 → ready");
      expect(body).toContain("**Artifacts Updated:** 2");
      expect(body).toContain("**Events Added:** 2");
      expect(body).toContain("automatically created by Kodebase");
    });
  });
});
