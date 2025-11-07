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

describe("ImpactAnalyzer - analyzeDeletion()", () => {
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
   * Helper: Creates a milestone with multiple issues, some with dependencies
   */
  async function createMilestoneWithIssues() {
    // Create initiative
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

    // Create milestone
    await artifactService.createArtifact({
      id: "A.1",
      artifact: scaffoldMilestone({
        title: "Milestone A.1",
        createdBy: "Test User (test@example.com)",
        summary: "Milestone A.1",
        deliverables: ["Deliverable 1"],
      }),
      slug: "milestone-a1",
      baseDir: testBaseDir,
    });

    // Create issue A.1.1
    await artifactService.createArtifact({
      id: "A.1.1",
      artifact: scaffoldIssue({
        title: "Issue A.1.1",
        createdBy: "Test User (test@example.com)",
        summary: "First issue",
        acceptanceCriteria: ["AC1"],
      }),
      slug: "issue-a11",
      baseDir: testBaseDir,
    });

    // Create issue A.1.2 that depends on A.1.1
    const issueA12 = scaffoldIssue({
      title: "Issue A.1.2",
      createdBy: "Test User (test@example.com)",
      summary: "Second issue",
      acceptanceCriteria: ["AC2"],
    });
    issueA12.metadata.relationships = {
      blocked_by: ["A.1.1"],
      blocks: [],
    };

    await artifactService.createArtifact({
      id: "A.1.2",
      artifact: issueA12,
      slug: "issue-a12",
      baseDir: testBaseDir,
    });

    // Create issue A.1.3 that also depends on A.1.1
    const issueA13 = scaffoldIssue({
      title: "Issue A.1.3",
      createdBy: "Test User (test@example.com)",
      summary: "Third issue",
      acceptanceCriteria: ["AC3"],
    });
    issueA13.metadata.relationships = {
      blocked_by: ["A.1.1"],
      blocks: [],
    };

    await artifactService.createArtifact({
      id: "A.1.3",
      artifact: issueA13,
      slug: "issue-a13",
      baseDir: testBaseDir,
    });
  }

  describe("Orphaned dependents", () => {
    it("should identify artifacts with broken blocked_by references", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1.1");

      expect(report.orphanedDependents.length).toBe(2);
      expect(report.orphanedDependents[0].id).toBe("A.1.2");
      expect(report.orphanedDependents[1].id).toBe("A.1.3");
      expect(report.orphanedDependents[0].fullyOrphaned).toBe(true);
      expect(report.orphanedDependents[0].remainingDependencies).toBe(0);
    });

    it("should show partially orphaned artifacts", async () => {
      // Create initiative
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

      // Create milestone
      await artifactService.createArtifact({
        id: "A.1",
        artifact: scaffoldMilestone({
          title: "Milestone A.1",
          createdBy: "Test User (test@example.com)",
          summary: "Milestone A.1",
          deliverables: ["Deliverable 1"],
        }),
        slug: "milestone-a1",
        baseDir: testBaseDir,
      });

      // Create issue A.1.1
      await artifactService.createArtifact({
        id: "A.1.1",
        artifact: scaffoldIssue({
          title: "Issue A.1.1",
          createdBy: "Test User (test@example.com)",
          summary: "First issue",
          acceptanceCriteria: ["AC1"],
        }),
        slug: "issue-a11",
        baseDir: testBaseDir,
      });

      // Create another issue that A.1.2 depends on
      await artifactService.createArtifact({
        id: "A.1.4",
        artifact: scaffoldIssue({
          title: "Issue A.1.4",
          createdBy: "Test User (test@example.com)",
          summary: "Fourth issue",
          acceptanceCriteria: ["AC4"],
        }),
        slug: "issue-a14",
        baseDir: testBaseDir,
      });

      // Create A.1.2 that depends on both A.1.1 and A.1.4
      const issueA12 = scaffoldIssue({
        title: "Issue A.1.2",
        createdBy: "Test User (test@example.com)",
        summary: "Second issue",
        acceptanceCriteria: ["AC2"],
      });
      issueA12.metadata.relationships = {
        blocked_by: ["A.1.1", "A.1.4"],
        blocks: [],
      };
      await artifactService.createArtifact({
        id: "A.1.2",
        artifact: issueA12,
        slug: "issue-a12",
        baseDir: testBaseDir,
      });

      const report = await analyzer.analyzeDeletion("A.1.1");

      const a12 = report.orphanedDependents.find((d) => d.id === "A.1.2");
      expect(a12).toBeDefined();
      expect(a12?.fullyOrphaned).toBe(false);
      expect(a12?.remainingDependencies).toBe(1);
      expect(a12?.message).toContain("1 remaining dependency");
    });

    it("should handle artifact with no dependents", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1.2");

      expect(report.orphanedDependents.length).toBe(0);
    });
  });

  describe("Broken parent", () => {
    it("should identify parent with broken children reference", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1.1");

      expect(report.brokenParent).not.toBeNull();
      expect(report.brokenParent?.id).toBe("A.1");
      expect(report.brokenParent?.remainingChildren).toBe(2); // A.1.2 and A.1.3 remain
    });

    it("should show parent with no remaining children", async () => {
      await createMilestoneWithIssues();

      // Delete all siblings first (conceptually)
      const report = await analyzer.analyzeDeletion("A.1");

      expect(report.brokenParent).not.toBeNull();
      expect(report.brokenParent?.id).toBe("A");
      expect(report.brokenParent?.remainingChildren).toBe(0);
      expect(report.brokenParent?.message).toContain("no remaining children");
    });

    it("should handle top-level artifact with no parent", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A");

      expect(report.brokenParent).toBeNull();
    });
  });

  describe("Affected siblings", () => {
    it("should identify siblings affected by parent completion check", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1.1");

      expect(report.affectedSiblings.length).toBe(2);
      expect(report.affectedSiblings.some((s) => s.id === "A.1.2")).toBe(true);
      expect(report.affectedSiblings.some((s) => s.id === "A.1.3")).toBe(true);
    });

    it("should mark completed siblings as can help complete", async () => {
      // Create initiative and milestone
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
          summary: "Milestone A.1",
          deliverables: ["Deliverable 1"],
        }),
        slug: "milestone-a1",
        baseDir: testBaseDir,
      });

      await artifactService.createArtifact({
        id: "A.1.1",
        artifact: scaffoldIssue({
          title: "Issue A.1.1",
          createdBy: "Test User (test@example.com)",
          summary: "First issue",
          acceptanceCriteria: ["AC1"],
        }),
        slug: "issue-a11",
        baseDir: testBaseDir,
      });

      // Create A.1.2 as completed sibling
      const issueA12 = scaffoldIssue({
        title: "Issue A.1.2",
        createdBy: "Test User (test@example.com)",
        summary: "Second issue",
        acceptanceCriteria: ["AC2"],
      });
      issueA12.metadata.events.push({
        event: "completed",
        timestamp: new Date().toISOString(),
        actor: "Test User (test@example.com)",
        trigger: "pr_merged",
      });
      await artifactService.createArtifact({
        id: "A.1.2",
        artifact: issueA12,
        slug: "issue-a12",
        baseDir: testBaseDir,
      });

      await artifactService.createArtifact({
        id: "A.1.3",
        artifact: scaffoldIssue({
          title: "Issue A.1.3",
          createdBy: "Test User (test@example.com)",
          summary: "Third issue",
          acceptanceCriteria: ["AC3"],
        }),
        slug: "issue-a13",
        baseDir: testBaseDir,
      });

      const report = await analyzer.analyzeDeletion("A.1.1");

      const a12 = report.affectedSiblings.find((s) => s.id === "A.1.2");
      expect(a12?.canHelpComplete).toBe(true);
      expect(a12?.message).toContain("can help complete parent");
    });

    it("should mark cancelled siblings as can help complete", async () => {
      // Create initiative and milestone
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
          summary: "Milestone A.1",
          deliverables: ["Deliverable 1"],
        }),
        slug: "milestone-a1",
        baseDir: testBaseDir,
      });

      await artifactService.createArtifact({
        id: "A.1.1",
        artifact: scaffoldIssue({
          title: "Issue A.1.1",
          createdBy: "Test User (test@example.com)",
          summary: "First issue",
          acceptanceCriteria: ["AC1"],
        }),
        slug: "issue-a11",
        baseDir: testBaseDir,
      });

      await artifactService.createArtifact({
        id: "A.1.2",
        artifact: scaffoldIssue({
          title: "Issue A.1.2",
          createdBy: "Test User (test@example.com)",
          summary: "Second issue",
          acceptanceCriteria: ["AC2"],
        }),
        slug: "issue-a12",
        baseDir: testBaseDir,
      });

      // Create A.1.3 as cancelled sibling
      const issueA13 = scaffoldIssue({
        title: "Issue A.1.3",
        createdBy: "Test User (test@example.com)",
        summary: "Third issue",
        acceptanceCriteria: ["AC3"],
      });
      issueA13.metadata.events.push({
        event: "cancelled",
        timestamp: new Date().toISOString(),
        actor: "Test User (test@example.com)",
        trigger: "manual_cancel",
      });
      await artifactService.createArtifact({
        id: "A.1.3",
        artifact: issueA13,
        slug: "issue-a13",
        baseDir: testBaseDir,
      });

      const report = await analyzer.analyzeDeletion("A.1.1");

      const a13 = report.affectedSiblings.find((s) => s.id === "A.1.3");
      expect(a13?.canHelpComplete).toBe(true);
    });

    it("should mark incomplete siblings as blocking parent", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1.1");

      const a12 = report.affectedSiblings.find((s) => s.id === "A.1.2");
      expect(a12?.canHelpComplete).toBe(false);
      expect(a12?.message).toContain("parent completion still blocked");
    });
  });

  describe("Orphaned children", () => {
    it("should identify orphaned children", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1");

      expect(report.orphanedChildren.length).toBe(3);
      expect(report.orphanedChildren.some((c) => c.id === "A.1.1")).toBe(true);
      expect(report.orphanedChildren.some((c) => c.id === "A.1.2")).toBe(true);
      expect(report.orphanedChildren.some((c) => c.id === "A.1.3")).toBe(true);
    });

    it("should handle artifact with no children", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1.1");

      expect(report.orphanedChildren.length).toBe(0);
    });
  });

  describe("Summary messages", () => {
    it("should generate comprehensive summary", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1.1");

      expect(report.summary).toContain("Deleting A.1.1");
      expect(report.summary).toContain("2 artifacts"); // A.1.2 and A.1.3
      expect(report.summary).toContain("parent A.1");
    });

    it("should handle no impact scenario", async () => {
      await artifactService.createArtifact({
        id: "B",
        artifact: scaffoldInitiative({
          title: "Initiative B",
          createdBy: "Test User (test@example.com)",
          vision: "Vision B",
          scopeIn: ["Feature B"],
          scopeOut: ["Feature Z"],
          successCriteria: ["Criterion B"],
        }),
        slug: "initiative-b",
        baseDir: testBaseDir,
      });

      const report = await analyzer.analyzeDeletion("B");

      expect(report.hasImpact).toBe(false);
      expect(report.summary).toBe(
        "Deleting B has no impact on other artifacts",
      );
    });

    it("should use singular forms correctly", async () => {
      await createMilestoneWithIssues();

      // Create a single-dependent scenario
      await artifactService.createArtifact({
        id: "C",
        artifact: scaffoldInitiative({
          title: "Initiative C",
          createdBy: "Test User (test@example.com)",
          vision: "Vision C",
          scopeIn: ["Feature C"],
          scopeOut: ["Feature Z"],
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
          summary: "Milestone C.1",
          deliverables: ["Deliverable 1"],
        }),
        slug: "milestone-c1",
        baseDir: testBaseDir,
      });

      const issueC11 = scaffoldIssue({
        title: "Issue C.1.1",
        createdBy: "Test User (test@example.com)",
        summary: "Issue",
        acceptanceCriteria: ["AC1"],
      });

      await artifactService.createArtifact({
        id: "C.1.1",
        artifact: issueC11,
        slug: "issue-c11",
        baseDir: testBaseDir,
      });

      const issueC12 = scaffoldIssue({
        title: "Issue C.1.2",
        createdBy: "Test User (test@example.com)",
        summary: "Issue",
        acceptanceCriteria: ["AC2"],
      });
      issueC12.metadata.relationships = {
        blocked_by: ["C.1.1"],
        blocks: [],
      };

      await artifactService.createArtifact({
        id: "C.1.2",
        artifact: issueC12,
        slug: "issue-c12",
        baseDir: testBaseDir,
      });

      const report = await analyzer.analyzeDeletion("C.1.1");

      expect(report.summary).toContain("1 artifact"); // Singular
    });

    it("should mention orphaned children in summary", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1");

      expect(report.summary).toContain("3 children");
    });
  });

  describe("Requires force flag", () => {
    it("should require --force when dependents exist", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1.1");

      expect(report.requiresForce).toBe(true);
    });

    it("should not require --force when no dependents exist", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1.2");

      expect(report.requiresForce).toBe(false);
    });
  });

  describe("Edge cases and error handling", () => {
    it("should throw error for non-existent artifact", async () => {
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

      await expect(analyzer.analyzeDeletion("NONEXISTENT")).rejects.toThrow(
        "Artifact NONEXISTENT not found",
      );
    });

    it("should include timestamp in report", async () => {
      await createMilestoneWithIssues();

      const before = new Date().toISOString();
      const report = await analyzer.analyzeDeletion("A.1.1");
      const after = new Date().toISOString();

      expect(report.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(report.analyzedAt >= before).toBe(true);
      expect(report.analyzedAt <= after).toBe(true);
    });

    it("should include artifactId in report", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1.1");

      expect(report.artifactId).toBe("A.1.1");
    });

    it("should set hasImpact correctly", async () => {
      await createMilestoneWithIssues();

      const reportWithImpact = await analyzer.analyzeDeletion("A.1.1");
      expect(reportWithImpact.hasImpact).toBe(true);

      await artifactService.createArtifact({
        id: "D",
        artifact: scaffoldInitiative({
          title: "Initiative D",
          createdBy: "Test User (test@example.com)",
          vision: "Vision D",
          scopeIn: ["Feature D"],
          scopeOut: ["Feature Z"],
          successCriteria: ["Criterion D"],
        }),
        slug: "initiative-d",
        baseDir: testBaseDir,
      });

      // Recreate analyzer to pick up newly created artifacts
      analyzer = new ImpactAnalyzer({ baseDir: testBaseDir });

      const reportNoImpact = await analyzer.analyzeDeletion("D");
      expect(reportNoImpact.hasImpact).toBe(false);
    });
  });

  describe("Complex scenarios", () => {
    it("should handle deletion of artifact with multiple impact types", async () => {
      await createMilestoneWithIssues();

      const report = await analyzer.analyzeDeletion("A.1.1");

      expect(report.orphanedDependents.length).toBeGreaterThan(0);
      expect(report.brokenParent).not.toBeNull();
      expect(report.affectedSiblings.length).toBeGreaterThan(0);
      expect(report.hasImpact).toBe(true);
      expect(report.requiresForce).toBe(true);
    });

    it("should handle deletion of milestone with children and dependents", async () => {
      // Create initiative
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

      // Create milestone
      await artifactService.createArtifact({
        id: "A.1",
        artifact: scaffoldMilestone({
          title: "Milestone A.1",
          createdBy: "Test User (test@example.com)",
          summary: "Milestone A.1",
          deliverables: ["Deliverable 1"],
        }),
        slug: "milestone-a1",
        baseDir: testBaseDir,
      });

      // Create issue A.1.1
      await artifactService.createArtifact({
        id: "A.1.1",
        artifact: scaffoldIssue({
          title: "Issue A.1.1",
          createdBy: "Test User (test@example.com)",
          summary: "First issue",
          acceptanceCriteria: ["AC1"],
        }),
        slug: "issue-a11",
        baseDir: testBaseDir,
      });

      // Create A.1.2 that depends on the milestone A.1 (unusual but valid)
      const issueA12 = scaffoldIssue({
        title: "Issue A.1.2",
        createdBy: "Test User (test@example.com)",
        summary: "Second issue",
        acceptanceCriteria: ["AC2"],
      });
      issueA12.metadata.relationships = {
        blocked_by: ["A.1"],
        blocks: [],
      };
      await artifactService.createArtifact({
        id: "A.1.2",
        artifact: issueA12,
        slug: "issue-a12",
        baseDir: testBaseDir,
      });

      // Create issue A.1.3
      await artifactService.createArtifact({
        id: "A.1.3",
        artifact: scaffoldIssue({
          title: "Issue A.1.3",
          createdBy: "Test User (test@example.com)",
          summary: "Third issue",
          acceptanceCriteria: ["AC3"],
        }),
        slug: "issue-a13",
        baseDir: testBaseDir,
      });

      const report = await analyzer.analyzeDeletion("A.1");

      expect(report.orphanedDependents.length).toBe(1);
      expect(report.orphanedChildren.length).toBe(3);
      expect(report.brokenParent?.id).toBe("A");
      expect(report.requiresForce).toBe(true);
    });
  });
});
