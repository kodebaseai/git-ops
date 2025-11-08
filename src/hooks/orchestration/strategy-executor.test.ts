/**
 * Tests for StrategyExecutor
 */

import type { KodebaseConfig } from "@kodebase/config";
import { FakeGitAdapter } from "@kodebase/test-utils/fakes";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { MergeMetadataBuilder } from "../../../../../test/builders/merge-metadata-builder.js";
import { OrchestrationResultBuilder } from "../../../../../test/builders/orchestration-result-builder.js";
import type { OrchestrationResult } from "./post-merge-orchestrator-types.js";
import { StrategyExecutor } from "./strategy-executor.js";

// Mock dependencies
vi.mock("@kodebase/config", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../factory.js", () => ({
  createAdapterFactory: vi.fn(),
}));

// Import execAsync so we can mock it
import * as execModule from "../../utils/exec.js";

vi.mock("../../utils/exec.js", () => ({
  execAsync: vi.fn(),
}));

describe("StrategyExecutor", () => {
  let executor: StrategyExecutor;
  let mockConfig: KodebaseConfig;
  let fakeAdapter: FakeGitAdapter;
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

    // Shared fake adapter
    fakeAdapter = new FakeGitAdapter({
      authenticated: true,
      user: "kodebase-bot",
    });

    // Mock cascade results
    const mergeMetadata = MergeMetadataBuilder.prMerge()
      .withArtifacts("A.1.5")
      .withPRNumber(42)
      .withPRTitle("Test PR")
      .withSourceBranch("A.1.5")
      .withCommitSha("abc123")
      .build();

    mockCascadeResults = new OrchestrationResultBuilder()
      .withMergeMetadata(mergeMetadata)
      .withCompletionCascade((cascade) =>
        cascade.withEvents({
          artifactId: "A.1",
          event: "in_review",
          timestamp: new Date().toISOString(),
          actor: "System",
          trigger: "pr_merged",
        }),
      )
      .withReadinessCascade((cascade) =>
        cascade.withEvents({
          artifactId: "A.1.7",
          event: "ready",
          timestamp: new Date().toISOString(),
          actor: "System",
          trigger: "dependencies_met",
        }),
      )
      .withSummary("Test cascade")
      .withTotals({ artifacts: 2, events: 2 })
      .build();

    // Mock execAsync
    execAsyncMock = vi.fn();
    vi.mocked(execModule).execAsync = execAsyncMock;

    // Create executor with mocked dependencies
    executor = new StrategyExecutor(
      { gitRoot: "/test/repo", repoPath: "org/repo" },
      mockConfig,
      fakeAdapter,
    );
  });

  describe("execute()", () => {
    describe("no changes scenario", () => {
      it("should handle no cascade changes gracefully", async () => {
        const emptyResults = new OrchestrationResultBuilder(mockCascadeResults)
          .withTotals({ artifacts: 0, events: 0 })
          .build();

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
          { gitRoot: "/test/repo", repoPath: "org/repo" },
          undefined,
          new FakeGitAdapter(),
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
    });

    it("should create cascade PR successfully", async () => {
      const result = await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(result.success).toBe(true);
      expect(result.strategy).toBe("cascade_pr");
      expect(result.prInfo).toBeDefined();
      expect(result.prInfo?.number).toBe(1);
      expect(result.prInfo?.url).toBe("https://github.com/org/repo/pull/1");

      const pr = await fakeAdapter.getPR(result.prInfo?.number ?? -1);
      expect(pr?.title).toBe("[Automated] Cascade updates from PR #42");
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

      const createdPR = await fakeAdapter.getPR(1);
      expect(createdPR).toBeDefined();
      expect(createdPR?.title).toBe("[Automated] Cascade updates from PR #42");
      expect(createdPR?.body).toContain("## Cascade Updates from PR #42");
      expect(createdPR?.sourceBranch).toBe("cascade/pr-42");
      expect(createdPR?.targetBranch).toBe("main");
      expect(createdPR?.labels).toEqual(["automated", "cascade"]);
    });

    it("should auto-merge PR when configured", async () => {
      const result = await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      const pr = await fakeAdapter.getPR(result.prInfo?.number ?? -1);
      expect(pr?.state).toBe("merged");
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

      const adapterWithChecks = new FakeGitAdapter();
      const executorWithChecks = new StrategyExecutor(
        { gitRoot: "/test/repo", repoPath: "org/repo" },
        configWithChecks,
        adapterWithChecks,
      );

      await executorWithChecks.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      const pr = await adapterWithChecks.getPR(1);
      expect(pr?.autoMergeEnabled).toBe(true);
      expect(pr?.state).toBe("open");
    });

    it("should handle PR creation failure", async () => {
      // Reset the beforeEach mocks completely
      execAsyncMock.mockReset();

      // Set up git mocks for successful operations up to PR creation
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

      // Mock PR creation to fail
      const createPRSpy = vi
        .spyOn(fakeAdapter, "createPR")
        .mockRejectedValueOnce(new Error("API error"));

      const result = await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("API error");
      createPRSpy.mockRestore();
    });

    it("should handle git command failures", async () => {
      // Reset the beforeEach mocks completely
      execAsyncMock.mockReset();

      // Mock git commands: successful PR number lookup, then branch creation failure
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

    it("should continue if auto-merge fails", async () => {
      // Reset the beforeEach mocks completely
      execAsyncMock.mockReset();

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

      const mergeSpy = vi
        .spyOn(fakeAdapter, "mergePR")
        .mockRejectedValueOnce(new Error("Merge conflict"));

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
      mergeSpy.mockRestore();
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
        { gitRoot: "/test/repo", repoPath: "org/repo" },
        configWithPrefix,
        new FakeGitAdapter(),
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
        { gitRoot: "/test/repo", repoPath: "org/repo" },
        configNoPush,
        new FakeGitAdapter(),
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
        { gitRoot: "/test/repo", repoPath: "org/repo" },
        configWithPrefix,
        new FakeGitAdapter(),
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
      expect(fakeAdapter.getState().prs.size).toBe(0);
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

      await executor.execute({
        strategy: "cascade_pr",
        cascadeResults: mockCascadeResults,
      });

      const pr = await fakeAdapter.getPR(1);
      const body = pr?.body ?? "";

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
