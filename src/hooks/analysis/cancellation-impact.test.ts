import { ArtifactService } from "@kodebase/artifacts";
import {
  scaffoldInitiative,
  scaffoldIssue,
  scaffoldMilestone,
} from "@kodebase/core";
import { vol } from "memfs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImpactAnalyzer } from "./impact-analyzer.js";

// Mock node:fs/promises to use memfs
vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return {
    default: fs.promises,
  };
});

describe("ImpactAnalyzer - Cancellation Impact Analysis (C.8.2)", () => {
  const testBaseDir = "/test-project";
  let analyzer: ImpactAnalyzer;
  let artifactService: ArtifactService;

  beforeEach(() => {
    vol.reset();
    analyzer = new ImpactAnalyzer({ baseDir: testBaseDir });
    artifactService = new ArtifactService(testBaseDir);
  });

  afterEach(() => {
    vol.reset();
  });

  /**
   * Creates test hierarchy with completed/cancelled siblings:
   * A.1 (Milestone)
   *   ├── A.1.1 (completed)
   *   ├── A.1.2 (in_progress) <- target for cancellation
   *   └── A.1.3 (ready)
   */
  async function createMilestoneWithMixedChildren(): Promise<void> {
    await artifactService.createArtifact({
      id: "A",
      artifact: scaffoldInitiative({
        title: "Initiative A",
        createdBy: "Test User (test@example.com)",
        vision: "Vision A",
        scopeIn: ["Feature A"],
        scopeOut: ["Feature Z"],
        successCriteria: ["Criterion A"],
      }),
      slug: "initiative-a",
      baseDir: testBaseDir,
    });

    await artifactService.createArtifact({
      id: "A.1",
      artifact: scaffoldMilestone({
        title: "Milestone A.1",
        createdBy: "Test User (test@example.com)",
        summary: "First milestone",
        deliverables: ["Deliverable 1"],
      }),
      slug: "milestone-a1",
      baseDir: testBaseDir,
    });

    // A.1.1 - completed
    let issue = scaffoldIssue({
      title: "Issue A.1.1",
      createdBy: "Test User (test@example.com)",
      summary: "First issue",
      acceptanceCriteria: ["AC1"],
    });
    issue.metadata.events.push({
      event: "completed",
      timestamp: new Date().toISOString(),
      actor: "Test User (test@example.com)",
      trigger: "pr_merged",
    });
    await artifactService.createArtifact({
      id: "A.1.1",
      artifact: issue,
      slug: "issue-a11",
      baseDir: testBaseDir,
    });

    // A.1.2 - in progress
    issue = scaffoldIssue({
      title: "Issue A.1.2",
      createdBy: "Test User (test@example.com)",
      summary: "Second issue",
      acceptanceCriteria: ["AC2"],
    });
    issue.metadata.events.push({
      event: "in_progress",
      timestamp: new Date().toISOString(),
      actor: "Test User (test@example.com)",
      trigger: "branch_created",
    });
    await artifactService.createArtifact({
      id: "A.1.2",
      artifact: issue,
      slug: "issue-a12",
      baseDir: testBaseDir,
    });

    // A.1.3 - ready (blocked by A.1.2)
    issue = scaffoldIssue({
      title: "Issue A.1.3",
      createdBy: "Test User (test@example.com)",
      summary: "Third issue",
      acceptanceCriteria: ["AC3"],
    });
    issue.metadata.relationships = {
      blocked_by: ["A.1.2"],
      blocks: [],
    };
    await artifactService.createArtifact({
      id: "A.1.3",
      artifact: issue,
      slug: "issue-a13",
      baseDir: testBaseDir,
    });
  }

  /**
   * Creates milestone where all children except one are done/cancelled:
   * B.1 (Milestone)
   *   ├── B.1.1 (completed)
   *   ├── B.1.2 (cancelled)
   *   └── B.1.3 (in_progress) <- cancelling this will allow parent completion
   */
  async function createMilestoneNearCompletion(): Promise<void> {
    await artifactService.createArtifact({
      id: "B",
      artifact: scaffoldInitiative({
        title: "Initiative B",
        createdBy: "Test User (test@example.com)",
        vision: "Vision B",
        scopeIn: ["Feature B"],
        scopeOut: ["Feature Y"],
        successCriteria: ["Criterion B"],
      }),
      slug: "initiative-b",
      baseDir: testBaseDir,
    });

    await artifactService.createArtifact({
      id: "B.1",
      artifact: scaffoldMilestone({
        title: "Milestone B.1",
        createdBy: "Test User (test@example.com)",
        summary: "Milestone near completion",
        deliverables: ["Deliverable 1"],
      }),
      slug: "milestone-b1",
      baseDir: testBaseDir,
    });

    // B.1.1 - completed
    let issue = scaffoldIssue({
      title: "Issue B.1.1",
      createdBy: "Test User (test@example.com)",
      summary: "First issue",
      acceptanceCriteria: ["AC1"],
    });
    issue.metadata.events.push({
      event: "completed",
      timestamp: new Date().toISOString(),
      actor: "Test User (test@example.com)",
      trigger: "pr_merged",
    });
    await artifactService.createArtifact({
      id: "B.1.1",
      artifact: issue,
      slug: "issue-b11",
      baseDir: testBaseDir,
    });

    // B.1.2 - cancelled
    issue = scaffoldIssue({
      title: "Issue B.1.2",
      createdBy: "Test User (test@example.com)",
      summary: "Second issue",
      acceptanceCriteria: ["AC2"],
    });
    issue.metadata.events.push({
      event: "cancelled",
      timestamp: new Date().toISOString(),
      actor: "Test User (test@example.com)",
      trigger: "manual",
    });
    await artifactService.createArtifact({
      id: "B.1.2",
      artifact: issue,
      slug: "issue-b12",
      baseDir: testBaseDir,
    });

    // B.1.3 - in progress (last incomplete child)
    issue = scaffoldIssue({
      title: "Issue B.1.3",
      createdBy: "Test User (test@example.com)",
      summary: "Third issue",
      acceptanceCriteria: ["AC3"],
    });
    issue.metadata.events.push({
      event: "in_progress",
      timestamp: new Date().toISOString(),
      actor: "Test User (test@example.com)",
      trigger: "branch_created",
    });
    await artifactService.createArtifact({
      id: "B.1.3",
      artifact: issue,
      slug: "issue-b13",
      baseDir: testBaseDir,
    });
  }

  /**
   * Creates artifact with children to test child handling:
   * C (Initiative)
   *   ├── C.1 (Milestone) <- target for cancellation
   *   │   ├── C.1.1 (completed)
   *   │   └── C.1.2 (in_progress)
   *   └── C.2 (Milestone)
   */
  async function createArtifactWithChildren(): Promise<void> {
    await artifactService.createArtifact({
      id: "C",
      artifact: scaffoldInitiative({
        title: "Initiative C",
        createdBy: "Test User (test@example.com)",
        vision: "Vision C",
        scopeIn: ["Feature C"],
        scopeOut: ["Feature X"],
        successCriteria: ["Criterion C"],
      }),
      slug: "initiative-c",
      baseDir: testBaseDir,
    });

    await artifactService.createArtifact({
      id: "C.1",
      artifact: scaffoldMilestone({
        title: "Milestone C.1",
        createdBy: "Test User (test@example.com)",
        summary: "First milestone",
        deliverables: ["Deliverable 1"],
      }),
      slug: "milestone-c1",
      baseDir: testBaseDir,
    });

    await artifactService.createArtifact({
      id: "C.2",
      artifact: scaffoldMilestone({
        title: "Milestone C.2",
        createdBy: "Test User (test@example.com)",
        summary: "Second milestone",
        deliverables: ["Deliverable 2"],
      }),
      slug: "milestone-c2",
      baseDir: testBaseDir,
    });

    // C.1.1 - completed
    let issue = scaffoldIssue({
      title: "Issue C.1.1",
      createdBy: "Test User (test@example.com)",
      summary: "Issue 1",
      acceptanceCriteria: ["AC1"],
    });
    issue.metadata.events.push({
      event: "completed",
      timestamp: new Date().toISOString(),
      actor: "Test User (test@example.com)",
      trigger: "pr_merged",
    });
    await artifactService.createArtifact({
      id: "C.1.1",
      artifact: issue,
      slug: "issue-c11",
      baseDir: testBaseDir,
    });

    // C.1.2 - in progress
    issue = scaffoldIssue({
      title: "Issue C.1.2",
      createdBy: "Test User (test@example.com)",
      summary: "Issue 2",
      acceptanceCriteria: ["AC2"],
    });
    await artifactService.createArtifact({
      id: "C.1.2",
      artifact: issue,
      slug: "issue-c12",
      baseDir: testBaseDir,
    });
  }

  describe("Parent completion impact", () => {
    it("should identify parent that still has incomplete children", async () => {
      await createMilestoneWithMixedChildren();

      const report = await analyzer.analyzeCancellation("A.1.2");

      expect(report.artifactId).toBe("A.1.2");
      expect(report.parentCompletionAffected.length).toBe(1);

      const parent = report.parentCompletionAffected[0];
      expect(parent.id).toBe("A.1");
      expect(parent.remainingIncomplete).toBe(1); // A.1.3 is still incomplete
      expect(parent.canComplete).toBe(false);
      expect(parent.message).toContain("still has 1 incomplete child");
    });

    it("should identify parent that can now be completed", async () => {
      await createMilestoneNearCompletion();

      const report = await analyzer.analyzeCancellation("B.1.3");

      expect(report.parentCompletionAffected.length).toBe(1);

      const parent = report.parentCompletionAffected[0];
      expect(parent.id).toBe("B.1");
      expect(parent.remainingIncomplete).toBe(0);
      expect(parent.canComplete).toBe(true);
      expect(parent.message).toContain("can now be completed");
    });

    it("should handle top-level artifacts with no parent", async () => {
      await artifactService.createArtifact({
        id: "Z",
        artifact: scaffoldInitiative({
          title: "Initiative Z",
          createdBy: "Test User (test@example.com)",
          vision: "Vision Z",
          scopeIn: ["Feature Z"],
          scopeOut: ["Feature Y"],
          successCriteria: ["Criterion Z"],
        }),
        slug: "initiative-z",
        baseDir: testBaseDir,
      });

      const report = await analyzer.analyzeCancellation("Z");

      expect(report.parentCompletionAffected.length).toBe(0);
    });

    it("should count cancelled siblings as done", async () => {
      await createMilestoneNearCompletion();

      const report = await analyzer.analyzeCancellation("B.1.3");

      // B.1.1 is completed, B.1.2 is cancelled (counts as done)
      // So cancelling B.1.3 means all children are done/cancelled
      const parent = report.parentCompletionAffected[0];
      expect(parent.canComplete).toBe(true);
    });
  });

  describe("Dependent artifacts unblocking", () => {
    it("should identify artifacts that will be fully unblocked", async () => {
      await createMilestoneWithMixedChildren();

      const report = await analyzer.analyzeCancellation("A.1.2");

      expect(report.dependentsUnblocked.length).toBe(1);

      const dependent = report.dependentsUnblocked[0];
      expect(dependent.id).toBe("A.1.3");
      expect(dependent.remainingBlockers).toBe(0);
      expect(dependent.fullyUnblocked).toBe(true);
      expect(dependent.message).toContain("fully unblocked");
    });

    it("should identify artifacts with remaining blockers", async () => {
      // Create D.1.1 blocked by both D.1.2 and D.1.3
      await artifactService.createArtifact({
        id: "D",
        artifact: scaffoldInitiative({
          title: "Initiative D",
          createdBy: "Test User (test@example.com)",
          vision: "Vision D",
          scopeIn: ["Feature D"],
          scopeOut: ["Feature W"],
          successCriteria: ["Criterion D"],
        }),
        slug: "initiative-d",
        baseDir: testBaseDir,
      });

      await artifactService.createArtifact({
        id: "D.1",
        artifact: scaffoldMilestone({
          title: "Milestone D.1",
          createdBy: "Test User (test@example.com)",
          summary: "Milestone",
          deliverables: ["Deliverable"],
        }),
        slug: "milestone-d1",
        baseDir: testBaseDir,
      });

      let issue = scaffoldIssue({
        title: "Issue D.1.1",
        createdBy: "Test User (test@example.com)",
        summary: "Blocked by two artifacts",
        acceptanceCriteria: ["AC1"],
      });
      issue.metadata.relationships = {
        blocked_by: ["D.1.2", "D.1.3"],
        blocks: [],
      };
      await artifactService.createArtifact({
        id: "D.1.1",
        artifact: issue,
        slug: "issue-d11",
        baseDir: testBaseDir,
      });

      issue = scaffoldIssue({
        title: "Issue D.1.2",
        createdBy: "Test User (test@example.com)",
        summary: "First blocker",
        acceptanceCriteria: ["AC2"],
      });
      await artifactService.createArtifact({
        id: "D.1.2",
        artifact: issue,
        slug: "issue-d12",
        baseDir: testBaseDir,
      });

      issue = scaffoldIssue({
        title: "Issue D.1.3",
        createdBy: "Test User (test@example.com)",
        summary: "Second blocker",
        acceptanceCriteria: ["AC3"],
      });
      await artifactService.createArtifact({
        id: "D.1.3",
        artifact: issue,
        slug: "issue-d13",
        baseDir: testBaseDir,
      });

      const report = await analyzer.analyzeCancellation("D.1.2");

      expect(report.dependentsUnblocked.length).toBe(1);

      const dependent = report.dependentsUnblocked[0];
      expect(dependent.id).toBe("D.1.1");
      expect(dependent.remainingBlockers).toBe(1); // D.1.3 still blocks it
      expect(dependent.fullyUnblocked).toBe(false);
      expect(dependent.message).toContain("1 remaining blocker");
    });

    it("should handle artifact with no dependents", async () => {
      await createMilestoneWithMixedChildren();

      const report = await analyzer.analyzeCancellation("A.1.1");

      expect(report.dependentsUnblocked.length).toBe(0);
    });
  });

  describe("Children handling", () => {
    it("should identify children that will remain in current state", async () => {
      await createArtifactWithChildren();

      const report = await analyzer.analyzeCancellation("C.1");

      expect(report.children.length).toBe(2);

      const childIds = report.children.map((c) => c.id).sort();
      expect(childIds).toEqual(["C.1.1", "C.1.2"]);
    });

    it("should not affect children's state", async () => {
      await createArtifactWithChildren();

      const report = await analyzer.analyzeCancellation("C.1");

      // Verify children are listed but not marked as impacted
      expect(report.children.length).toBe(2);

      // The summary should mention children remain in current state
      expect(report.summary).toContain("will remain in current state");
    });

    it("should handle artifact with no children", async () => {
      await createMilestoneWithMixedChildren();

      const report = await analyzer.analyzeCancellation("A.1.1");

      expect(report.children.length).toBe(0);
    });
  });

  describe("Summary messaging", () => {
    it("should generate clear summary for unblocking dependents", async () => {
      await createMilestoneWithMixedChildren();

      const report = await analyzer.analyzeCancellation("A.1.2");

      expect(report.summary).toBe(
        "Cancelling A.1.2 will unblock 1 dependent artifact",
      );
    });

    it("should generate clear summary for parent completion", async () => {
      await createMilestoneNearCompletion();

      const report = await analyzer.analyzeCancellation("B.1.3");

      expect(report.summary).toContain("will allow 1 parent to be completed");
    });

    it("should generate clear summary with multiple impacts", async () => {
      await createArtifactWithChildren();

      const report = await analyzer.analyzeCancellation("C.1");

      expect(report.summary).toContain("Cancelling C.1");
      expect(report.summary).toContain("2 children");
      expect(report.summary).toContain("will remain in current state");
    });

    it("should handle no impact scenario (top-level artifact)", async () => {
      await artifactService.createArtifact({
        id: "E",
        artifact: scaffoldInitiative({
          title: "Initiative E",
          createdBy: "Test User (test@example.com)",
          vision: "Vision E",
          scopeIn: ["Feature E"],
          scopeOut: ["Feature V"],
          successCriteria: ["Criterion E"],
        }),
        slug: "initiative-e",
        baseDir: testBaseDir,
      });

      const report = await analyzer.analyzeCancellation("E");

      expect(report.hasImpact).toBe(false);
      expect(report.summary).toBe(
        "Cancelling E has no impact on other artifacts",
      );
    });

    it("should use plural forms correctly", async () => {
      // Create scenario with multiple dependents
      await artifactService.createArtifact({
        id: "F",
        artifact: scaffoldInitiative({
          title: "Initiative F",
          createdBy: "Test User (test@example.com)",
          vision: "Vision F",
          scopeIn: ["Feature F"],
          scopeOut: ["Feature U"],
          successCriteria: ["Criterion F"],
        }),
        slug: "initiative-f",
        baseDir: testBaseDir,
      });

      await artifactService.createArtifact({
        id: "F.1",
        artifact: scaffoldMilestone({
          title: "Milestone F.1",
          createdBy: "Test User (test@example.com)",
          summary: "Milestone",
          deliverables: ["Deliverable"],
        }),
        slug: "milestone-f1",
        baseDir: testBaseDir,
      });

      let issue = scaffoldIssue({
        title: "Issue F.1.1",
        createdBy: "Test User (test@example.com)",
        summary: "Blocker",
        acceptanceCriteria: ["AC1"],
      });
      await artifactService.createArtifact({
        id: "F.1.1",
        artifact: issue,
        slug: "issue-f11",
        baseDir: testBaseDir,
      });

      // Create multiple artifacts blocked by F.1.1
      for (let i = 2; i <= 4; i++) {
        issue = scaffoldIssue({
          title: `Issue F.1.${i}`,
          createdBy: "Test User (test@example.com)",
          summary: `Blocked issue ${i}`,
          acceptanceCriteria: [`AC${i}`],
        });
        issue.metadata.relationships = {
          blocked_by: ["F.1.1"],
          blocks: [],
        };
        await artifactService.createArtifact({
          id: `F.1.${i}`,
          artifact: issue,
          slug: `issue-f1${i}`,
          baseDir: testBaseDir,
        });
      }

      const report = await analyzer.analyzeCancellation("F.1.1");

      expect(report.summary).toContain("3 dependent artifacts"); // Plural
    });
  });

  describe("Edge cases and error handling", () => {
    it("should throw error for non-existent artifact", async () => {
      // Create at least one artifact so the directory exists
      await artifactService.createArtifact({
        id: "X",
        artifact: scaffoldInitiative({
          title: "Initiative X",
          createdBy: "Test User (test@example.com)",
          vision: "Vision X",
          scopeIn: ["Feature X"],
          scopeOut: ["Feature Y"],
          successCriteria: ["Criterion X"],
        }),
        slug: "initiative-x",
        baseDir: testBaseDir,
      });

      await expect(analyzer.analyzeCancellation("NONEXISTENT")).rejects.toThrow(
        "Artifact NONEXISTENT not found",
      );
    });

    it("should include timestamp in report", async () => {
      await createMilestoneWithMixedChildren();

      const before = new Date().toISOString();
      const report = await analyzer.analyzeCancellation("A.1.2");
      const after = new Date().toISOString();

      expect(typeof report.analyzedAt).toBe("string");
      expect(report.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(report.analyzedAt >= before).toBe(true);
      expect(report.analyzedAt <= after).toBe(true);
    });

    it("should have hasImpact false when no impacts detected", async () => {
      await artifactService.createArtifact({
        id: "G",
        artifact: scaffoldInitiative({
          title: "Initiative G",
          createdBy: "Test User (test@example.com)",
          vision: "Vision G",
          scopeIn: ["Feature G"],
          scopeOut: ["Feature T"],
          successCriteria: ["Criterion G"],
        }),
        slug: "initiative-g",
        baseDir: testBaseDir,
      });

      const report = await analyzer.analyzeCancellation("G");

      expect(report.hasImpact).toBe(false);
    });

    it("should have hasImpact true when impacts exist", async () => {
      await createMilestoneWithMixedChildren();

      const report = await analyzer.analyzeCancellation("A.1.2");

      expect(report.hasImpact).toBe(true);
    });
  });
});
