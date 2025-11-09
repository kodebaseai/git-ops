import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCascadeCommit } from "./cascade-commit.js";
import type {
  CascadeCommitAttribution,
  CreateCascadeCommitOptions,
} from "./cascade-commit-types.js";

const execAsyncMock = vi.hoisted(() => vi.fn());

vi.mock("../../utils/exec.js", () => ({
  execAsync: execAsyncMock,
}));

const mergeMetadata = {
  targetBranch: "main",
  sourceBranch: "feature/C.1.2",
  commitSha: "abc123",
  prNumber: 42,
  prTitle: "Test PR",
  prBody: "Body",
  isPRMerge: true,
  artifactIds: ["C.1.2"],
};

const baseAttribution: CascadeCommitAttribution = {
  agentName: "Kodebase GitOps",
  agentVersion: "v1.0.0",
  triggerEvent: "post-merge",
  prNumber: 42,
};

const makeCascadeResults = (
  overrides: Partial<CreateCascadeCommitOptions["cascadeResults"]> = {},
): CreateCascadeCommitOptions["cascadeResults"] => ({
  mergeMetadata,
  completionCascade: {
    events: [
      {
        artifactId: "C.1.2",
        event: "in_review",
        timestamp: "2025-01-01T00:00:00Z",
        actor: "System",
        trigger: "pr_merged",
      },
    ],
    updatedArtifacts: [],
  },
  readinessCascade: {
    events: [
      {
        artifactId: "A.1",
        event: "ready",
        timestamp: "2025-01-01T00:00:01Z",
        actor: "System",
        trigger: "dependencies_met",
      },
    ],
    updatedArtifacts: [],
  },
  totalArtifactsUpdated: 2,
  totalEventsAdded: 2,
  summary: "Updated 2 artifacts",
  ...overrides,
});

describe("createCascadeCommit", () => {
  beforeEach(() => {
    execAsyncMock.mockReset();
  });

  it("returns early when there are no cascade changes", async () => {
    const result = await createCascadeCommit({
      cascadeResults: makeCascadeResults({
        totalArtifactsUpdated: 0,
        totalEventsAdded: 0,
      }),
      attribution: baseAttribution,
    });

    expect(result).toEqual({
      success: true,
      message: "No cascade changes to commit",
      filesChanged: 0,
    });
    expect(execAsyncMock).not.toHaveBeenCalled();
  });

  it("stages and commits cascade changes with attribution", async () => {
    execAsyncMock
      .mockResolvedValueOnce({ exitCode: 0, stderr: "" }) // git add
      .mockResolvedValueOnce({ exitCode: 0, stderr: "" }) // git commit
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: "def456",
        stderr: "",
      }); // rev-parse

    const result = await createCascadeCommit({
      cascadeResults: makeCascadeResults(),
      attribution: {
        ...baseAttribution,
        humanActor: "Jane Developer <jane@example.com>",
      },
      gitRoot: "/repo",
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        commitSha: "def456",
        filesChanged: 2,
      }),
    );

    expect(execAsyncMock).toHaveBeenNthCalledWith(
      1,
      "git add .kodebase/artifacts/**/*.yml",
      { cwd: "/repo" },
    );

    const commitCall = execAsyncMock.mock.calls[1];
    expect(commitCall?.[0]).toContain("git -c user.name=");
    expect(commitCall?.[0]).toContain("Co-Authored-By: Jane Developer");
    expect(commitCall?.[0]).toContain("cascade: Update artifact states");
    expect(commitCall?.[0]).toContain("Affected artifacts:");
  });

  it("bubbles up staging errors", async () => {
    execAsyncMock.mockResolvedValueOnce({
      exitCode: 1,
      stderr: "permission denied",
    });

    const result = await createCascadeCommit({
      cascadeResults: makeCascadeResults(),
      attribution: baseAttribution,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("permission denied");
  });

  it("handles git errors when git add throws", async () => {
    execAsyncMock.mockRejectedValueOnce(new Error("git missing"));

    const result = await createCascadeCommit({
      cascadeResults: makeCascadeResults(),
      attribution: baseAttribution,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("git missing");
  });

  it("returns commit failures when git commit exits non-zero", async () => {
    execAsyncMock
      .mockResolvedValueOnce({ exitCode: 0, stderr: "" })
      .mockResolvedValueOnce({ exitCode: 1, stderr: "conflict" });

    const result = await createCascadeCommit({
      cascadeResults: makeCascadeResults(),
      attribution: baseAttribution,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("conflict");
  });

  it("bubbles up errors when commit metadata cannot be read", async () => {
    execAsyncMock
      .mockResolvedValueOnce({ exitCode: 0, stderr: "" })
      .mockResolvedValueOnce({ exitCode: 0, stderr: "" })
      .mockResolvedValueOnce({ exitCode: 1, stderr: "" });

    const result = await createCascadeCommit({
      cascadeResults: makeCascadeResults(),
      attribution: baseAttribution,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Failed to get commit SHA");
  });

  it("handles unexpected errors during commit message generation", async () => {
    execAsyncMock.mockResolvedValueOnce({ exitCode: 0, stderr: "" });

    const brokenResults =
      makeCascadeResults() as unknown as CreateCascadeCommitOptions["cascadeResults"];
    Object.assign(brokenResults, { completionCascade: null });

    const result = await createCascadeCommit({
      cascadeResults: brokenResults,
      attribution: baseAttribution,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Cannot read");
  });

  it("handles thrown git errors when creating commit", async () => {
    execAsyncMock
      .mockResolvedValueOnce({ exitCode: 0, stderr: "" })
      .mockRejectedValueOnce(new Error("fatal: repository not found"));

    const result = await createCascadeCommit({
      cascadeResults: makeCascadeResults(),
      attribution: baseAttribution,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("fatal");
  });
});
