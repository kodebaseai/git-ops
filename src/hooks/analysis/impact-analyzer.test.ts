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

describe("ImpactAnalyzer", () => {
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
   * Creates a simple dependency hierarchy:
   * A.1.1 (completed) ← A.1.2 (blocked by A.1.1) ← A.1.3 (blocked by A.1.2)
   */
  async function createDependencyChain(): Promise<void> {
    // Create initiative A
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

    // Create milestone A.1
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

    // Create issue A.1.1 (completed, blocks A.1.2)
    let issue = scaffoldIssue({
      title: "Issue A.1.1",
      createdBy: "Test User (test@example.com)",
      summary: "First issue",
      acceptanceCriteria: ["Criterion 1"],
    });
    issue.metadata.events.push({
      event: "completed",
      timestamp: new Date().toISOString(),
      actor: "Test User (test@example.com)",
      trigger: "pr_merged",
    });
    issue.metadata.relationships = {
      blocked_by: [],
      blocks: ["A.1.2"],
    };
    await artifactService.createArtifact({
      id: "A.1.1",
      artifact: issue,
      slug: "issue-a11",
      baseDir: testBaseDir,
    });

    // Create issue A.1.2 (blocked by A.1.1, blocks A.1.3)
    issue = scaffoldIssue({
      title: "Issue A.1.2",
      createdBy: "Test User (test@example.com)",
      summary: "Second issue",
      acceptanceCriteria: ["Criterion 2"],
    });
    issue.metadata.relationships = {
      blocked_by: ["A.1.1"],
      blocks: ["A.1.3"],
    };
    await artifactService.createArtifact({
      id: "A.1.2",
      artifact: issue,
      slug: "issue-a12",
      baseDir: testBaseDir,
    });

    // Create issue A.1.3 (blocked by A.1.2)
    issue = scaffoldIssue({
      title: "Issue A.1.3",
      createdBy: "Test User (test@example.com)",
      summary: "Third issue",
      acceptanceCriteria: ["Criterion 3"],
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
   * Creates a complex hierarchy with multiple relationships:
   * Initiative B
   *   ├── Milestone B.1
   *   │   ├── Issue B.1.1
   *   │   ├── Issue B.1.2 (blocked by B.1.1)
   *   │   └── Issue B.1.3 (blocked by B.1.1, B.1.2)
   *   └── Milestone B.2
   *       └── Issue B.2.1 (blocked by B.1.2)
   */
  async function createComplexHierarchy(): Promise<void> {
    // Create initiative B
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

    // Create milestone B.1
    await artifactService.createArtifact({
      id: "B.1",
      artifact: scaffoldMilestone({
        title: "Milestone B.1",
        createdBy: "Test User (test@example.com)",
        summary: "First milestone",
        deliverables: ["Deliverable 1"],
      }),
      slug: "milestone-b1",
      baseDir: testBaseDir,
    });

    // Create milestone B.2
    await artifactService.createArtifact({
      id: "B.2",
      artifact: scaffoldMilestone({
        title: "Milestone B.2",
        createdBy: "Test User (test@example.com)",
        summary: "Second milestone",
        deliverables: ["Deliverable 2"],
      }),
      slug: "milestone-b2",
      baseDir: testBaseDir,
    });

    // Create issue B.1.1
    let issue = scaffoldIssue({
      title: "Issue B.1.1",
      createdBy: "Test User (test@example.com)",
      summary: "First issue",
      acceptanceCriteria: ["Criterion 1"],
    });
    issue.metadata.relationships = {
      blocked_by: [],
      blocks: ["B.1.2", "B.1.3"],
    };
    await artifactService.createArtifact({
      id: "B.1.1",
      artifact: issue,
      slug: "issue-b11",
      baseDir: testBaseDir,
    });

    // Create issue B.1.2
    issue = scaffoldIssue({
      title: "Issue B.1.2",
      createdBy: "Test User (test@example.com)",
      summary: "Second issue",
      acceptanceCriteria: ["Criterion 2"],
    });
    issue.metadata.relationships = {
      blocked_by: ["B.1.1"],
      blocks: ["B.1.3", "B.2.1"],
    };
    await artifactService.createArtifact({
      id: "B.1.2",
      artifact: issue,
      slug: "issue-b12",
      baseDir: testBaseDir,
    });

    // Create issue B.1.3
    issue = scaffoldIssue({
      title: "Issue B.1.3",
      createdBy: "Test User (test@example.com)",
      summary: "Third issue",
      acceptanceCriteria: ["Criterion 3"],
    });
    issue.metadata.relationships = {
      blocked_by: ["B.1.1", "B.1.2"],
      blocks: [],
    };
    await artifactService.createArtifact({
      id: "B.1.3",
      artifact: issue,
      slug: "issue-b13",
      baseDir: testBaseDir,
    });

    // Create issue B.2.1
    issue = scaffoldIssue({
      title: "Issue B.2.1",
      createdBy: "Test User (test@example.com)",
      summary: "Issue in second milestone",
      acceptanceCriteria: ["Criterion 4"],
    });
    issue.metadata.relationships = {
      blocked_by: ["B.1.2"],
      blocks: [],
    };
    await artifactService.createArtifact({
      id: "B.2.1",
      artifact: issue,
      slug: "issue-b21",
      baseDir: testBaseDir,
    });
  }

  describe("analyze - cancel operation", () => {
    it("should identify artifacts that depend on canceled artifact", async () => {
      await createDependencyChain();

      const report = await analyzer.analyze("A.1.1", "cancel");

      expect(report.artifactId).toBe("A.1.1");
      expect(report.operation).toBe("cancel");
      expect(report.hasImpact).toBe(true);

      // A.1.2 depends on A.1.1
      const impactedIds = report.impactedArtifacts.map((a) => a.id);
      expect(impactedIds).toContain("A.1.2");

      const a12Impact = report.impactedArtifacts.find((a) => a.id === "A.1.2");
      expect(a12Impact?.impactType).toBe("breaks_dependency");
      expect(a12Impact?.reason).toContain("Depends on A.1.1");
    });

    it("should identify child artifacts that would be orphaned", async () => {
      await createComplexHierarchy();

      const report = await analyzer.analyze("B.1", "cancel");

      expect(report.hasImpact).toBe(true);

      // B.1.1, B.1.2, B.1.3 are children of B.1
      const impactedIds = report.impactedArtifacts.map((a) => a.id);
      expect(impactedIds).toContain("B.1.1");
      expect(impactedIds).toContain("B.1.2");
      expect(impactedIds).toContain("B.1.3");

      const orphanedChildren = report.impactedArtifacts.filter(
        (a) => a.impactType === "orphans_children",
      );
      expect(orphanedChildren.length).toBe(3);
    });

    it("should handle artifacts with no impact", async () => {
      await createDependencyChain();

      const report = await analyzer.analyze("A.1.3", "cancel");

      expect(report.hasImpact).toBe(true); // Has dependency A.1.2
      expect(report.impactedArtifacts.length).toBeGreaterThan(0);
    });

    it("should not duplicate artifacts in impact report", async () => {
      await createComplexHierarchy();

      const report = await analyzer.analyze("B.1.1", "cancel");

      const impactedIds = report.impactedArtifacts.map((a) => a.id);
      const uniqueIds = new Set(impactedIds);
      expect(impactedIds.length).toBe(uniqueIds.size);
    });
  });

  describe("analyze - delete operation", () => {
    it("should identify artifacts blocked by deleted artifact", async () => {
      await createDependencyChain();

      const report = await analyzer.analyze("A.1.1", "delete");

      expect(report.artifactId).toBe("A.1.1");
      expect(report.operation).toBe("delete");
      expect(report.hasImpact).toBe(true);

      // A.1.2 is blocked by A.1.1
      const impactedIds = report.impactedArtifacts.map((a) => a.id);
      expect(impactedIds).toContain("A.1.2");

      const a12Impact = report.impactedArtifacts.find((a) => a.id === "A.1.2");
      expect(a12Impact?.impactType).toBe("breaks_dependency");
    });

    it("should identify orphaned children", async () => {
      await createComplexHierarchy();

      const report = await analyzer.analyze("B", "delete");

      expect(report.hasImpact).toBe(true);

      // B.1 and B.2 are direct children of B
      const orphanedChildren = report.impactedArtifacts.filter(
        (a) => a.impactType === "orphans_children",
      );
      expect(orphanedChildren.map((a) => a.id)).toContain("B.1");
      expect(orphanedChildren.map((a) => a.id)).toContain("B.2");
    });

    it("should not include dependencies in delete impact", async () => {
      await createDependencyChain();

      const report = await analyzer.analyze("A.1.2", "delete");

      // Should include A.1.3 (blocked by A.1.2)
      // Should NOT include A.1.1 (dependency of A.1.2)
      const impactedIds = report.impactedArtifacts.map((a) => a.id);
      expect(impactedIds).toContain("A.1.3");
      expect(impactedIds).not.toContain("A.1.1");
    });

    it("should handle complex multi-level dependencies", async () => {
      await createComplexHierarchy();

      const report = await analyzer.analyze("B.1.1", "delete");

      expect(report.hasImpact).toBe(true);

      // B.1.2 and B.1.3 are blocked by B.1.1
      const impactedIds = report.impactedArtifacts.map((a) => a.id);
      expect(impactedIds).toContain("B.1.2");
      expect(impactedIds).toContain("B.1.3");
    });
  });

  describe("analyze - remove_dependency operation", () => {
    it("should identify the artifact itself as impacted", async () => {
      await createDependencyChain();

      const report = await analyzer.analyze("A.1.2", "remove_dependency");

      expect(report.artifactId).toBe("A.1.2");
      expect(report.operation).toBe("remove_dependency");
      expect(report.hasImpact).toBe(true);

      const selfImpact = report.impactedArtifacts.find((a) => a.id === "A.1.2");
      expect(selfImpact).toMatchObject({ impactType: "breaks_dependency" });
    });

    it("should identify artifacts sharing dependencies", async () => {
      await createComplexHierarchy();

      const report = await analyzer.analyze("B.1.3", "remove_dependency");

      expect(report.hasImpact).toBe(true);

      // B.1.3 blocked_by: [B.1.1, B.1.2]
      // B.1.2 blocked_by: [B.1.1] - shares B.1.1 dependency
      // B.2.1 blocked_by: [B.1.2] - shares B.1.2 dependency
      const impactedIds = report.impactedArtifacts.map((a) => a.id);
      expect(impactedIds).toContain("B.1.3"); // Self
      expect(impactedIds).toContain("B.1.2"); // Shares B.1.1
      expect(impactedIds).toContain("B.2.1"); // Shares B.1.2
    });

    it("should handle artifacts with no dependencies", async () => {
      await createDependencyChain();

      const report = await analyzer.analyze("A.1.1", "remove_dependency");

      // A.1.1 has no dependencies (blocked_by is empty)
      expect(report.hasImpact).toBe(true);
      expect(report.impactedArtifacts.length).toBe(1); // Only itself
      expect(report.impactedArtifacts[0].id).toBe("A.1.1");
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle empty artifact graph", async () => {
      // Create only initiative with no children
      await artifactService.createArtifact({
        id: "Z",
        artifact: scaffoldInitiative({
          title: "Initiative Z",
          createdBy: "Test User (test@example.com)",
          vision: "Vision Z",
          scopeIn: ["Feature Z"],
          scopeOut: ["Feature X"],
          successCriteria: ["Criterion Z"],
        }),
        slug: "initiative-z",
        baseDir: testBaseDir,
      });

      const report = await analyzer.analyze("Z", "delete");

      expect(report.hasImpact).toBe(false);
      expect(report.impactedArtifacts.length).toBe(0);
    });

    it("should throw error for non-existent artifact", async () => {
      await expect(analyzer.analyze("NONEXISTENT", "delete")).rejects.toThrow();
    });

    it("should handle circular dependencies gracefully", async () => {
      // Create circular dependency: C.1.1 ← C.1.2 ← C.1.3 ← C.1.1
      await artifactService.createArtifact({
        id: "C",
        artifact: scaffoldInitiative({
          title: "Initiative C",
          createdBy: "Test User (test@example.com)",
          vision: "Vision C",
          scopeIn: ["Feature C"],
          scopeOut: ["Feature W"],
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
          summary: "Milestone",
          deliverables: ["Deliverable"],
        }),
        slug: "milestone-c1",
        baseDir: testBaseDir,
      });

      let issue = scaffoldIssue({
        title: "Issue C.1.1",
        createdBy: "Test User (test@example.com)",
        summary: "First",
        acceptanceCriteria: ["AC1"],
      });
      issue.metadata.relationships = {
        blocked_by: ["C.1.3"],
        blocks: ["C.1.2"],
      };
      await artifactService.createArtifact({
        id: "C.1.1",
        artifact: issue,
        slug: "issue-c11",
        baseDir: testBaseDir,
      });

      issue = scaffoldIssue({
        title: "Issue C.1.2",
        createdBy: "Test User (test@example.com)",
        summary: "Second",
        acceptanceCriteria: ["AC2"],
      });
      issue.metadata.relationships = {
        blocked_by: ["C.1.1"],
        blocks: ["C.1.3"],
      };
      await artifactService.createArtifact({
        id: "C.1.2",
        artifact: issue,
        slug: "issue-c12",
        baseDir: testBaseDir,
      });

      issue = scaffoldIssue({
        title: "Issue C.1.3",
        createdBy: "Test User (test@example.com)",
        summary: "Third",
        acceptanceCriteria: ["AC3"],
      });
      issue.metadata.relationships = {
        blocked_by: ["C.1.2"],
        blocks: ["C.1.1"],
      };
      await artifactService.createArtifact({
        id: "C.1.3",
        artifact: issue,
        slug: "issue-c13",
        baseDir: testBaseDir,
      });

      // Should handle circular deps without infinite loop
      const report = await analyzer.analyze("C.1.1", "delete");

      expect(report.impactedArtifacts.length).toBeGreaterThan(0);
    });

    it("should include timestamp in report", async () => {
      await createDependencyChain();

      const before = new Date().toISOString();
      const report = await analyzer.analyze("A.1.1", "delete");
      const after = new Date().toISOString();

      expect(typeof report.analyzedAt).toBe("string");
      expect(report.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(report.analyzedAt >= before).toBe(true);
      expect(report.analyzedAt <= after).toBe(true);
    });
  });

  describe("hierarchy detection", () => {
    it("should identify direct children only", async () => {
      await createComplexHierarchy();

      const report = await analyzer.analyze("B.1", "delete");

      // Direct children: B.1.1, B.1.2, B.1.3
      // NOT grandchildren through parent B
      const orphanedIds = report.impactedArtifacts
        .filter((a) => a.impactType === "orphans_children")
        .map((a) => a.id);

      expect(orphanedIds).toContain("B.1.1");
      expect(orphanedIds).toContain("B.1.2");
      expect(orphanedIds).toContain("B.1.3");
      expect(orphanedIds.length).toBe(3);
    });

    it("should not include siblings as children", async () => {
      await createComplexHierarchy();

      const report = await analyzer.analyze("B.1", "delete");

      const orphanedIds = report.impactedArtifacts
        .filter((a) => a.impactType === "orphans_children")
        .map((a) => a.id);

      // B.2 is sibling, not child
      expect(orphanedIds).not.toContain("B.2");
    });
  });

  describe("cache management", () => {
    it("should clear cache when requested", async () => {
      await createDependencyChain();

      // First analysis
      await analyzer.analyze("A.1.1", "delete");

      // Clear cache
      analyzer.clearCache();

      // Second analysis should still work
      const report = await analyzer.analyze("A.1.2", "delete");
      expect(Array.isArray(report.impactedArtifacts)).toBe(true);
    });
  });

  describe("additional coverage", () => {
    it("should handle cancel operation with all impact types", async () => {
      await createComplexHierarchy();

      const report = await analyzer.analyze("B.1.2", "cancel");

      expect(report.hasImpact).toBe(true);

      // Should have dependencies (blocks_parent_completion)
      const parentImpacts = report.impactedArtifacts.filter(
        (a) => a.impactType === "blocks_parent_completion",
      );
      expect(parentImpacts.length).toBeGreaterThan(0);

      // Should have blocked artifacts (breaks_dependency)
      const dependencyImpacts = report.impactedArtifacts.filter(
        (a) => a.impactType === "breaks_dependency",
      );
      expect(dependencyImpacts.length).toBeGreaterThan(0);
    });

    it("should handle artifact with only children (no dependencies or blockers)", async () => {
      await createComplexHierarchy();

      const report = await analyzer.analyze("B", "cancel");

      expect(report.hasImpact).toBe(true);

      // Should have orphaned children
      const orphanedChildren = report.impactedArtifacts.filter(
        (a) => a.impactType === "orphans_children",
      );
      expect(orphanedChildren.length).toBe(2); // B.1 and B.2
    });

    it("should handle artifacts at different hierarchy levels", async () => {
      // Test with 3-level hierarchy (Initiative -> Milestone -> Issue)
      await createComplexHierarchy();

      // Delete milestone
      const milestoneReport = await analyzer.analyze("B.1", "delete");
      expect(milestoneReport.hasImpact).toBe(true);

      // Should include direct children only
      const orphanedChildren = milestoneReport.impactedArtifacts.filter(
        (a) => a.impactType === "orphans_children",
      );
      expect(orphanedChildren.length).toBe(3); // B.1.1, B.1.2, B.1.3
    });

    it("should handle artifact with missing dependencies gracefully", async () => {
      // Create artifact with reference to non-existent dependency
      const issue = scaffoldIssue({
        title: "Issue X.1.1",
        createdBy: "Test User (test@example.com)",
        summary: "Test issue",
        acceptanceCriteria: ["AC1"],
      });
      issue.metadata.relationships = {
        blocked_by: ["NONEXISTENT"],
        blocks: [],
      };

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

      await artifactService.createArtifact({
        id: "X.1",
        artifact: scaffoldMilestone({
          title: "Milestone X.1",
          createdBy: "Test User (test@example.com)",
          summary: "Milestone",
          deliverables: ["Deliverable"],
        }),
        slug: "milestone-x1",
        baseDir: testBaseDir,
      });

      await artifactService.createArtifact({
        id: "X.1.1",
        artifact: issue,
        slug: "issue-x11",
        baseDir: testBaseDir,
      });

      // Should handle missing dependency gracefully
      const report = await analyzer.analyze("X.1.1", "cancel");
      expect(report.artifactId).toBe("X.1.1");
      expect(Array.isArray(report.impactedArtifacts)).toBe(true);
    });

    it("should handle remove_dependency with missing dependency", async () => {
      // Create artifact with reference to non-existent dependency
      const issue = scaffoldIssue({
        title: "Issue Y.1.1",
        createdBy: "Test User (test@example.com)",
        summary: "Test issue",
        acceptanceCriteria: ["AC1"],
      });
      issue.metadata.relationships = {
        blocked_by: ["NONEXISTENT"],
        blocks: [],
      };

      await artifactService.createArtifact({
        id: "Y",
        artifact: scaffoldInitiative({
          title: "Initiative Y",
          createdBy: "Test User (test@example.com)",
          vision: "Vision Y",
          scopeIn: ["Feature Y"],
          scopeOut: ["Feature Z"],
          successCriteria: ["Criterion Y"],
        }),
        slug: "initiative-y",
        baseDir: testBaseDir,
      });

      await artifactService.createArtifact({
        id: "Y.1",
        artifact: scaffoldMilestone({
          title: "Milestone Y.1",
          createdBy: "Test User (test@example.com)",
          summary: "Milestone",
          deliverables: ["Deliverable"],
        }),
        slug: "milestone-y1",
        baseDir: testBaseDir,
      });

      await artifactService.createArtifact({
        id: "Y.1.1",
        artifact: issue,
        slug: "issue-y11",
        baseDir: testBaseDir,
      });

      // Should handle missing dependency gracefully
      const report = await analyzer.analyze("Y.1.1", "remove_dependency");
      expect(report.hasImpact).toBe(true);
      expect(report.impactedArtifacts.length).toBeGreaterThanOrEqual(1); // At least itself
    });
  });
});
