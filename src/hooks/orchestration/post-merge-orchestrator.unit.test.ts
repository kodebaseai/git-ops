import type { CascadeResult, CascadeService } from "@kodebase/artifacts";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MergeMetadata } from "../detection/post-merge-types.js";
import { PostMergeOrchestrator } from "./post-merge-orchestrator.js";

const baseMergeMetadata = (artifactIds: string[]): MergeMetadata => ({
  targetBranch: "main",
  sourceBranch: "feature/test",
  commitSha: "abc123",
  prNumber: 42,
  prTitle: "Add feature",
  prBody: "Body",
  isPRMerge: true,
  artifactIds,
});

const makeCascadeResult = (events: CascadeResult["events"]): CascadeResult => ({
  updatedArtifacts: [],
  events,
});

describe("PostMergeOrchestrator", () => {
  const completionEvents: CascadeResult["events"] = [
    {
      artifactId: "A.1",
      event: "in_review",
      actor: "completion",
      trigger: "pr_merged",
      timestamp: "2025-11-08T00:00:00Z",
    },
  ];
  const readinessEvents: CascadeResult["events"] = [
    {
      artifactId: "B.2",
      event: "ready",
      actor: "readiness",
      trigger: "dependencies_met",
      timestamp: "2025-11-08T00:00:01Z",
    },
  ];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns early when no artifact IDs are provided", async () => {
    const cascade = {
      executeCompletionCascade: vi.fn(),
      executeReadinessCascade: vi.fn(),
    };
    const orchestrator = new PostMergeOrchestrator(
      {},
      cascade as unknown as CascadeService,
    );

    const result = await orchestrator.execute({
      mergeMetadata: baseMergeMetadata([]),
    });

    expect(result.summary).toBe("No artifact IDs found in merge");
    expect(result.totalArtifactsUpdated).toBe(0);
    expect(cascade.executeCompletionCascade).not.toHaveBeenCalled();
  });

  it("merges cascade results and generates summary", async () => {
    const cascade = {
      executeCompletionCascade: vi
        .fn()
        .mockResolvedValue(makeCascadeResult(completionEvents)),
      executeReadinessCascade: vi
        .fn()
        .mockResolvedValue(makeCascadeResult(readinessEvents)),
    };
    const orchestrator = new PostMergeOrchestrator(
      {},
      cascade as unknown as CascadeService,
    );

    const result = await orchestrator.execute({
      mergeMetadata: baseMergeMetadata(["A.1"]),
      actor: "Agent",
    });

    expect(result.totalEventsAdded).toBe(2);
    expect(result.totalArtifactsUpdated).toBe(2);
    expect(result.summary).toContain("Completion cascade: 1 event");
    expect(result.summary).toContain("Readiness cascade: 1 event");
    expect(result.completionCascade.events[0].artifactId).toBe("A.1");
  });

  it("logs errors when cascades fail but continues processing", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const cascade = {
      executeCompletionCascade: vi.fn().mockRejectedValue(new Error("boom")),
      executeReadinessCascade: vi
        .fn()
        .mockResolvedValue(makeCascadeResult(readinessEvents)),
    };
    const orchestrator = new PostMergeOrchestrator(
      {},
      cascade as unknown as CascadeService,
    );

    const result = await orchestrator.execute({
      mergeMetadata: baseMergeMetadata(["A.1"]),
    });

    expect(consoleError).toHaveBeenCalledWith(
      "Completion cascade failed for A.1:",
      "boom",
    );
    expect(result.summary).toContain("Readiness cascade: 1 event");
  });
});
