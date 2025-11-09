import type { KodebaseConfig } from "@kodebase/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitPlatformAdapter } from "../../types/adapter.js";
import { StrategyExecutor } from "./strategy-executor.js";
import type { ExecuteStrategyOptions } from "./strategy-executor-types.js";

const execAsyncMock = vi.hoisted(() => vi.fn());

vi.mock("../../utils/exec.js", () => ({
  execAsync: execAsyncMock,
}));

const cascadeResults: ExecuteStrategyOptions["cascadeResults"] = {
  mergeMetadata: {
    targetBranch: "main",
    sourceBranch: "feature/C.1.2",
    commitSha: "abc123",
    prNumber: 42,
    prTitle: "Cascade PR",
    prBody: "Body",
    isPRMerge: true,
    artifactIds: ["C.1.2"],
  },
  completionCascade: {
    updatedArtifacts: [],
    events: [
      {
        artifactId: "C.1.2",
        event: "in_review",
        timestamp: "2025-01-01T00:00:00Z",
        actor: "System",
        trigger: "pr_merged",
      },
    ],
  },
  readinessCascade: {
    updatedArtifacts: [],
    events: [
      {
        artifactId: "A.1",
        event: "ready",
        timestamp: "2025-01-01T00:00:01Z",
        actor: "System",
        trigger: "dependencies_met",
      },
    ],
  },
  totalArtifactsUpdated: 2,
  totalEventsAdded: 2,
  summary: "Updated 2 artifacts",
};

describe("StrategyExecutor (unit)", () => {
  const consoleLog = vi
    .spyOn(console, "log")
    .mockImplementation(() => undefined);
  const consoleWarn = vi
    .spyOn(console, "warn")
    .mockImplementation(() => undefined);

  beforeEach(() => {
    consoleLog.mockClear();
    consoleWarn.mockClear();
  });

  it("executes manual strategy without touching git", async () => {
    const executor = new StrategyExecutor(
      { gitRoot: "/repo", repoPath: "org/repo" },
      { gitOps: {} } as never,
    );

    const result = await executor.execute({
      strategy: "manual",
      cascadeResults,
    });

    expect(result).toEqual(
      expect.objectContaining({
        strategy: "manual",
        success: true,
      }),
    );
    expect(consoleLog).toHaveBeenCalledWith(
      expect.stringContaining("Manual Cascade Updates"),
    );
  });

  it("formats cascade report sections for PR body", () => {
    const executor = new StrategyExecutor(
      { gitRoot: "/repo", repoPath: "org/repo" },
      { gitOps: {} } as never,
    ) as unknown as {
      generateCascadeReport: (
        results: ExecuteStrategyOptions["cascadeResults"],
        prNumber: number,
      ) => string;
    };

    const report = executor.generateCascadeReport(cascadeResults, 42);

    expect(report).toContain("## Cascade Updates from PR #42");
    expect(report).toContain("### Merged Artifacts");
    expect(report).toContain("### Completion Cascade");
    expect(report).toContain("### Readiness Cascade");
    expect(report).toContain("This PR was automatically created");
  });

  it("returns descriptive error for unknown strategies", async () => {
    const executor = new StrategyExecutor(
      { gitRoot: "/repo", repoPath: "org/repo" },
      { gitOps: {} } as never,
    );

    const result = await executor.execute({
      strategy: "unknown" as never,
      cascadeResults,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Strategy 'unknown' is not supported");
  });

  it("creates cascade PR and handles auto-merge flow", async () => {
    const adapter: Partial<GitPlatformAdapter> = {
      createPR: vi
        .fn()
        .mockResolvedValue({ number: 5, url: "https://example/pr/5" }),
      enableAutoMerge: vi.fn().mockResolvedValue(undefined),
      mergePR: vi.fn().mockResolvedValue(undefined),
    };

    const executor = new StrategyExecutor(
      { gitRoot: "/repo", repoPath: "org/repo" },
      {
        gitOps: {
          post_merge: {
            cascade_pr: {
              auto_merge: true,
              require_checks: false,
              labels: ["automated"],
              branch_prefix: "cascade/pr-",
            },
          },
        },
      } as KodebaseConfig,
      adapter as GitPlatformAdapter,
    ) as StrategyExecutor & {
      getCurrentPRNumber: ReturnType<typeof vi.fn>;
      createBranch: ReturnType<typeof vi.fn>;
      stageArtifactChanges: ReturnType<typeof vi.fn>;
      commitChanges: ReturnType<typeof vi.fn>;
      pushBranch: ReturnType<typeof vi.fn>;
    };

    executor.getCurrentPRNumber = vi.fn().mockResolvedValue(101);
    executor.createBranch = vi.fn().mockResolvedValue(undefined);
    executor.stageArtifactChanges = vi.fn().mockResolvedValue(undefined);
    executor.commitChanges = vi.fn().mockResolvedValue(undefined);
    executor.pushBranch = vi.fn().mockResolvedValue(undefined);

    const result = await executor.execute({
      strategy: "cascade_pr",
      cascadeResults,
      actor: "Agent",
    });

    expect(result.success).toBe(true);
    expect(result.prInfo?.number).toBe(5);
    expect(executor.createBranch).toHaveBeenCalledWith("cascade/pr-101");
    expect(adapter.createPR).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[Automated] Cascade updates from PR #101",
        labels: ["automated"],
      }),
    );
    expect(adapter.mergePR).toHaveBeenCalledWith(
      5,
      expect.objectContaining({ deleteBranch: true }),
    );
    expect(result.message).toContain("auto-merged");
  });

  it("reports failures during cascade PR creation", async () => {
    const executor = new StrategyExecutor(
      { gitRoot: "/repo", repoPath: "org/repo" },
      { gitOps: { post_merge: { cascade_pr: {} } } } as KodebaseConfig,
      {
        createPR: vi.fn().mockRejectedValue(new Error("gh cli missing")),
      } as Partial<GitPlatformAdapter> as GitPlatformAdapter,
    ) as StrategyExecutor & {
      getCurrentPRNumber: ReturnType<typeof vi.fn>;
      createBranch: ReturnType<typeof vi.fn>;
      stageArtifactChanges: ReturnType<typeof vi.fn>;
      commitChanges: ReturnType<typeof vi.fn>;
      pushBranch: ReturnType<typeof vi.fn>;
    };

    executor.getCurrentPRNumber = vi.fn().mockResolvedValue(7);
    executor.createBranch = vi.fn().mockResolvedValue(undefined);
    executor.stageArtifactChanges = vi.fn().mockResolvedValue(undefined);
    executor.commitChanges = vi.fn().mockResolvedValue(undefined);
    executor.pushBranch = vi.fn().mockResolvedValue(undefined);

    const result = await executor.execute({
      strategy: "cascade_pr",
      cascadeResults,
      actor: "Agent",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Failed to create cascade PR");
  });

  it("commits directly when push_immediately is disabled", async () => {
    const executor = new StrategyExecutor(
      { gitRoot: "/repo", repoPath: "org/repo" },
      {
        gitOps: {
          post_merge: {
            direct_commit: { push_immediately: false },
          },
        },
      } as never,
    ) as StrategyExecutor & {
      stageArtifactChanges: ReturnType<typeof vi.fn>;
      commitChanges: ReturnType<typeof vi.fn>;
      pushCurrentBranch: ReturnType<typeof vi.fn>;
    };

    executor.stageArtifactChanges = vi.fn().mockResolvedValue(undefined);
    executor.commitChanges = vi.fn().mockResolvedValue("abc123");
    executor.pushCurrentBranch = vi.fn();

    const result = await executor.execute({
      strategy: "direct_commit",
      cascadeResults,
      actor: "Tester",
    });

    expect(result.success).toBe(true);
    expect(result.commitInfo?.sha).toBe("abc123");
    expect(executor.pushCurrentBranch).not.toHaveBeenCalled();
  });

  it("reports failure when staging artifacts throws", async () => {
    const executor = new StrategyExecutor(
      { gitRoot: "/repo", repoPath: "org/repo" },
      { gitOps: {} } as never,
    ) as StrategyExecutor & {
      stageArtifactChanges: ReturnType<typeof vi.fn>;
      commitChanges: ReturnType<typeof vi.fn>;
      pushCurrentBranch: ReturnType<typeof vi.fn>;
    };

    executor.stageArtifactChanges = vi
      .fn()
      .mockRejectedValue(new Error("git add failed"));
    executor.commitChanges = vi.fn();
    executor.pushCurrentBranch = vi.fn();

    const result = await executor.execute({
      strategy: "direct_commit",
      cascadeResults,
      actor: "Tester",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Failed to commit cascade updates");
    expect(executor.commitChanges).not.toHaveBeenCalled();
  });
});
describe("git helper methods", () => {
  beforeEach(() => {
    execAsyncMock.mockReset();
  });

  const buildExecutor = () =>
    new StrategyExecutor({
      gitRoot: "/repo",
      repoPath: "org/repo",
    }) as StrategyExecutor & {
      stageArtifactChanges: () => Promise<void>;
      commitChanges: (message: string, actor: string) => Promise<string>;
      pushBranch: (name: string) => Promise<void>;
      pushCurrentBranch: () => Promise<void>;
      createBranch: (name: string) => Promise<void>;
      getCurrentPRNumber: () => Promise<number>;
    };

  it("stages artifact changes via git add", async () => {
    execAsyncMock.mockResolvedValueOnce({ exitCode: 0, stderr: "" });

    await buildExecutor().stageArtifactChanges();

    expect(execAsyncMock).toHaveBeenCalledWith(
      "git add .kodebase/artifacts/**/*.yml",
      { cwd: "/repo" },
    );
  });

  it("throws when staging fails", async () => {
    execAsyncMock.mockResolvedValueOnce({ exitCode: 1, stderr: "boom" });

    await expect(buildExecutor().stageArtifactChanges()).rejects.toThrow(
      "Failed to stage changes: boom",
    );
  });

  it("commits changes and returns sha", async () => {
    execAsyncMock
      .mockResolvedValueOnce({ exitCode: 0, stderr: "" })
      .mockResolvedValueOnce({ stdout: "abc123\n", exitCode: 0 });

    const sha = await buildExecutor().commitChanges("msg", "Agent");

    expect(execAsyncMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("git commit"),
      { cwd: "/repo" },
    );
    expect(execAsyncMock).toHaveBeenNthCalledWith(2, "git rev-parse HEAD", {
      cwd: "/repo",
    });
    expect(sha.trim()).toBe("abc123");
  });

  it("fails when git commit exits non-zero", async () => {
    execAsyncMock.mockResolvedValueOnce({ exitCode: 1, stderr: "conflict" });

    await expect(buildExecutor().commitChanges("msg", "Agent")).rejects.toThrow(
      "Failed to commit changes: conflict",
    );
  });

  it("fails when commit SHA cannot be read after committing", async () => {
    execAsyncMock
      .mockResolvedValueOnce({ exitCode: 0, stderr: "" })
      .mockRejectedValueOnce(new Error("rev-parse missing"));

    await expect(buildExecutor().commitChanges("msg", "Agent")).rejects.toThrow(
      "rev-parse missing",
    );
  });

  it("pushes branches and current branch", async () => {
    execAsyncMock.mockResolvedValue({ exitCode: 0, stderr: "" });

    await buildExecutor().pushBranch("cascade/pr-1");
    await buildExecutor().pushCurrentBranch();

    expect(execAsyncMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("git push -u origin cascade/pr-1"),
      { cwd: "/repo" },
    );
    expect(execAsyncMock).toHaveBeenNthCalledWith(2, "git push", {
      cwd: "/repo",
    });
  });

  it("throws when push fails", async () => {
    execAsyncMock.mockResolvedValueOnce({ exitCode: 1, stderr: "denied" });

    await expect(buildExecutor().pushCurrentBranch()).rejects.toThrow(
      "Failed to push: denied",
    );
  });

  it("creates new cascade branches and reports git errors", async () => {
    execAsyncMock.mockResolvedValueOnce({ exitCode: 0, stderr: "" });

    await buildExecutor().createBranch("cascade/pr-7");

    expect(execAsyncMock).toHaveBeenCalledWith(
      expect.stringContaining("git checkout -b cascade/pr-7"),
      { cwd: "/repo" },
    );

    execAsyncMock.mockReset();
    execAsyncMock.mockResolvedValueOnce({
      exitCode: 1,
      stderr: "already exists",
    });

    await expect(buildExecutor().createBranch("cascade/pr-7")).rejects.toThrow(
      "Failed to create branch: already exists",
    );
  });

  it("parses PR numbers from git log and falls back when missing", async () => {
    const fallbackValue = 1234567890 % 100000;
    const dateSpy = vi.spyOn(Date, "now").mockReturnValue(1234567890);
    execAsyncMock
      .mockResolvedValueOnce({
        exitCode: 0,
        stderr: "",
        stdout: "Merge pull request #55 from feature/branch",
      })
      .mockResolvedValueOnce({
        exitCode: 0,
        stderr: "",
        stdout: "feat: add logging",
      })
      .mockRejectedValueOnce(new Error("git log unavailable"));

    const executor = buildExecutor();

    const parsed = await executor.getCurrentPRNumber();
    expect(parsed).toBe(55);

    const fallbackFromContent = await executor.getCurrentPRNumber();
    expect(fallbackFromContent).toBe(fallbackValue);

    const fallbackFromError = await executor.getCurrentPRNumber();
    expect(fallbackFromError).toBe(fallbackValue);

    dateSpy.mockRestore();
  });
});
