import { scaffoldIssue, scaffoldMilestone } from "@kodebase/core";
import { describe, expect, it } from "vitest";
import type {
  CancellationImpactReport,
  DeletionImpactReport,
  ImpactReport,
} from "./impact-analyzer.js";
import { ImpactReportFormatter } from "./impact-report-formatter.js";

describe("ImpactReportFormatter", () => {
  describe("CLI output format", () => {
    it("should format cancellation report with parent completion impact", () => {
      const report: CancellationImpactReport = {
        artifactId: "C.1.2",
        parentCompletionAffected: [
          {
            id: "C.1",
            artifact: scaffoldMilestone({
              title: "GitHub Integration",
              createdBy: "Test User (test@example.com)",
              summary: "GitHub integration milestone",
              deliverables: ["API", "UI"],
            }),
            message: "Cancelled sibling counts as done",
          },
        ],
        dependentsUnblocked: [
          {
            id: "C.3.2",
            artifact: scaffoldIssue({
              title: "GitHub Authentication",
              createdBy: "Test User (test@example.com)",
              summary: "Auth implementation",
              acceptanceCriteria: ["AC1"],
            }),
            message: "Will be unblocked",
          },
          {
            id: "C.3.3",
            artifact: scaffoldIssue({
              title: "PR Operations",
              createdBy: "Test User (test@example.com)",
              summary: "PR operations",
              acceptanceCriteria: ["AC1"],
            }),
            message: "Will be unblocked",
          },
        ],
        children: [],
        hasImpact: true,
        summary: "Cancelling C.1.2 will unblock 2 dependent artifacts",
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      expect(output).toContain("Impact Analysis: Cancel C.1.2");
      expect(output).toContain("Parent Completion");
      expect(output).toContain("C.1 - GitHub Integration");
      expect(output).toContain("Dependents Unblocked (2)");
      expect(output).toContain("C.3.2 - GitHub Authentication");
      expect(output).toContain("C.3.3 - PR Operations");
      expect(output).toContain(
        "Cancelling C.1.2 will unblock 2 dependent artifacts",
      );
    });

    it("should format deletion report with orphaned dependents", () => {
      const report: DeletionImpactReport = {
        artifactId: "A.1.1",
        orphanedDependents: [
          {
            id: "A.1.2",
            artifact: scaffoldIssue({
              title: "Issue A.1.2",
              createdBy: "Test User (test@example.com)",
              summary: "Second issue",
              acceptanceCriteria: ["AC1"],
            }),
            remainingDependencies: 0,
            fullyOrphaned: true,
            message: "Will be fully orphaned",
          },
          {
            id: "A.1.3",
            artifact: scaffoldIssue({
              title: "Issue A.1.3",
              createdBy: "Test User (test@example.com)",
              summary: "Third issue",
              acceptanceCriteria: ["AC1"],
            }),
            remainingDependencies: 1,
            fullyOrphaned: false,
            message: "Will have 1 remaining dependency",
          },
        ],
        brokenParent: {
          id: "A.1",
          artifact: scaffoldMilestone({
            title: "Milestone A.1",
            createdBy: "Test User (test@example.com)",
            summary: "Milestone",
            deliverables: ["D1"],
          }),
          remainingChildren: 2,
          message: "Parent will have broken reference",
        },
        affectedSiblings: [],
        orphanedChildren: [],
        hasImpact: true,
        requiresForce: true,
        summary: "Deleting A.1.1 will orphan 2 artifacts and break parent A.1",
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      expect(output).toContain("Impact Analysis: Delete A.1.1");
      expect(output).toContain("Orphaned Dependents (2)");
      expect(output).toContain("A.1.2 - Issue A.1.2");
      expect(output).toContain("[FULLY ORPHANED]");
      expect(output).toContain("A.1.3 - Issue A.1.3");
      expect(output).toContain("[PARTIAL]");
      expect(output).toContain("Broken Parent");
      expect(output).toContain("A.1 - Milestone A.1");
      expect(output).toContain("--force flag required");
    });

    it("should format generic impact report", () => {
      const report: ImpactReport = {
        artifactId: "B.2",
        operation: "remove_dependency",
        impactedArtifacts: [
          {
            id: "B.1",
            artifact: scaffoldMilestone({
              title: "Milestone B.1",
              createdBy: "Test User (test@example.com)",
              summary: "Milestone",
              deliverables: ["D1"],
            }),
            impactType: "blocks_parent_completion",
            reason: "Parent can't complete",
          },
          {
            id: "B.3",
            artifact: scaffoldIssue({
              title: "Issue B.3",
              createdBy: "Test User (test@example.com)",
              summary: "Issue",
              acceptanceCriteria: ["AC1"],
            }),
            impactType: "breaks_dependency",
            reason: "Dependency will be broken",
          },
        ],
        hasImpact: true,
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report, "remove_dependency");

      expect(output).toContain("Impact Analysis: Remove Dependency B.2");
      expect(output).toContain("Blocks Parent Completion (1)");
      expect(output).toContain("B.1 - Milestone B.1");
      expect(output).toContain("Breaks Dependencies (1)");
      expect(output).toContain("B.3 - Issue B.3");
      expect(output).toContain("2 artifacts affected");
    });

    it("should format report with no impact", () => {
      const report: CancellationImpactReport = {
        artifactId: "E.1",
        parentCompletionAffected: [],
        dependentsUnblocked: [],
        children: [],
        hasImpact: false,
        summary: "Cancelling E.1 has no impact on other artifacts",
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      expect(output).toContain("Impact Analysis: Cancel E.1");
      expect(output).toContain(
        "Cancelling E.1 has no impact on other artifacts",
      );
      expect(output).toContain("Safe to proceed without --force flag");
    });

    it("should format deletion report with affected siblings", () => {
      const report: DeletionImpactReport = {
        artifactId: "A.1.1",
        orphanedDependents: [],
        brokenParent: null,
        affectedSiblings: [
          {
            id: "A.1.2",
            artifact: scaffoldIssue({
              title: "Issue A.1.2 (Completed)",
              createdBy: "Test User (test@example.com)",
              summary: "Completed issue",
              acceptanceCriteria: ["AC1"],
            }),
            canHelpComplete: true,
            message: "Completed sibling can help complete parent",
          },
          {
            id: "A.1.3",
            artifact: scaffoldIssue({
              title: "Issue A.1.3 (In Progress)",
              createdBy: "Test User (test@example.com)",
              summary: "In progress issue",
              acceptanceCriteria: ["AC1"],
            }),
            canHelpComplete: false,
            message: "Incomplete sibling blocks parent",
          },
        ],
        orphanedChildren: [],
        hasImpact: true,
        requiresForce: false,
        summary: "Deleting A.1.1 affects 2 siblings",
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      expect(output).toContain("Affected Siblings (2)");
      expect(output).toContain("A.1.2 - Issue A.1.2 (Completed)");
      expect(output).toContain("[CAN HELP COMPLETE]");
      expect(output).toContain("A.1.3 - Issue A.1.3 (In Progress)");
      expect(output).toContain("[BLOCKING]");
    });
  });

  describe("JSON output format", () => {
    it("should format cancellation report as JSON", () => {
      const report: CancellationImpactReport = {
        artifactId: "C.1.2",
        parentCompletionAffected: [],
        dependentsUnblocked: [],
        children: [],
        hasImpact: false,
        summary: "No impact",
        analyzedAt: "2025-11-07T00:00:00Z",
      };

      const formatter = new ImpactReportFormatter({ format: "json" });
      const output = formatter.format(report);

      const parsed = JSON.parse(output);
      expect(parsed.artifactId).toBe("C.1.2");
      expect(parsed.hasImpact).toBe(false);
      expect(parsed.summary).toBe("No impact");
    });

    it("should format deletion report as JSON", () => {
      const report: DeletionImpactReport = {
        artifactId: "A.1.1",
        orphanedDependents: [],
        brokenParent: null,
        affectedSiblings: [],
        orphanedChildren: [],
        hasImpact: false,
        requiresForce: false,
        summary: "No impact",
        analyzedAt: "2025-11-07T00:00:00Z",
      };

      const formatter = new ImpactReportFormatter({ format: "json" });
      const output = formatter.format(report);

      const parsed = JSON.parse(output);
      expect(parsed.artifactId).toBe("A.1.1");
      expect(parsed.requiresForce).toBe(false);
    });
  });

  describe("Color options", () => {
    it("should disable colors when noColor is true", () => {
      const report: CancellationImpactReport = {
        artifactId: "C.1.2",
        parentCompletionAffected: [],
        dependentsUnblocked: [],
        children: [],
        hasImpact: false,
        summary: "No impact",
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      // Should not contain ANSI color codes
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Testing ANSI escape codes
      expect(output).not.toMatch(/\x1b\[\d+m/);
      expect(output).toContain("Impact Analysis: Cancel C.1.2");
    });

    it("should include colors by default", () => {
      const report: CancellationImpactReport = {
        artifactId: "C.1.2",
        parentCompletionAffected: [],
        dependentsUnblocked: [],
        children: [],
        hasImpact: false,
        summary: "No impact",
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter();
      const output = formatter.format(report);

      // Should contain ANSI color codes
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Testing ANSI escape codes
      expect(output).toMatch(/\x1b\[\d+m/);
    });
  });

  describe("Verbose mode", () => {
    it("should show detailed messages in verbose mode", () => {
      const report: CancellationImpactReport = {
        artifactId: "C.1.2",
        parentCompletionAffected: [
          {
            id: "C.1",
            artifact: scaffoldMilestone({
              title: "GitHub Integration",
              createdBy: "Test User (test@example.com)",
              summary: "GitHub integration milestone",
              deliverables: ["API"],
            }),
            message: "Cancelled sibling counts as done",
          },
        ],
        dependentsUnblocked: [],
        children: [],
        hasImpact: true,
        summary: "Impact on parent",
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter({ verbose: true });
      const output = formatter.format(report);

      expect(output).toContain("Cancelled sibling counts as done");
    });

    it("should not show detailed messages in non-verbose mode", () => {
      const report: CancellationImpactReport = {
        artifactId: "C.1.2",
        parentCompletionAffected: [
          {
            id: "C.1",
            artifact: scaffoldMilestone({
              title: "GitHub Integration",
              createdBy: "Test User (test@example.com)",
              summary: "GitHub integration milestone",
              deliverables: ["API"],
            }),
            message: "Cancelled sibling counts as done",
          },
        ],
        dependentsUnblocked: [],
        children: [],
        hasImpact: true,
        summary: "Impact on parent",
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter({ verbose: false });
      const output = formatter.format(report);

      expect(output).not.toContain("Cancelled sibling counts as done");
    });
  });

  describe("Edge cases", () => {
    it("should handle artifacts without titles", () => {
      const report: CancellationImpactReport = {
        artifactId: "C.1.2",
        parentCompletionAffected: [
          {
            id: "C.1",
            artifact: {
              metadata: {
                schema_version: "0.0.1",
                created_by: "Test",
                assignee: "Test",
                relationships: {},
                events: [],
              },
              content: {},
            },
            message: "Test message",
          },
        ],
        dependentsUnblocked: [],
        children: [],
        hasImpact: true,
        summary: "Impact on parent",
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter();
      const output = formatter.format(report);

      expect(output).toContain("C.1 - Untitled");
    });

    it("should handle report with children", () => {
      const report: CancellationImpactReport = {
        artifactId: "C.1",
        parentCompletionAffected: [],
        dependentsUnblocked: [],
        children: [
          {
            id: "C.1.1",
            artifact: scaffoldIssue({
              title: "Child Issue",
              createdBy: "Test User (test@example.com)",
              summary: "Child",
              acceptanceCriteria: ["AC1"],
            }),
          },
        ],
        hasImpact: true,
        summary: "Has children",
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      expect(output).toContain("Children (1)");
      expect(output).toContain("C.1.1 - Child Issue");
    });

    it("should handle deletion report with orphaned children", () => {
      const report: DeletionImpactReport = {
        artifactId: "A.1",
        orphanedDependents: [],
        brokenParent: null,
        affectedSiblings: [],
        orphanedChildren: [
          {
            id: "A.1.1",
            artifact: scaffoldIssue({
              title: "Orphaned Child",
              createdBy: "Test User (test@example.com)",
              summary: "Child",
              acceptanceCriteria: ["AC1"],
            }),
          },
        ],
        hasImpact: true,
        requiresForce: false,
        summary: "Will orphan children",
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      expect(output).toContain("Orphaned Children (1)");
      expect(output).toContain("A.1.1 - Orphaned Child");
    });
  });

  describe("Summary messages", () => {
    it("should use singular form for single artifact", () => {
      const report: ImpactReport = {
        artifactId: "B.2",
        operation: "cancel",
        impactedArtifacts: [
          {
            id: "B.1",
            artifact: scaffoldMilestone({
              title: "Milestone B.1",
              createdBy: "Test User (test@example.com)",
              summary: "Milestone",
              deliverables: ["D1"],
            }),
            impactType: "blocks_parent_completion",
            reason: "Parent can't complete",
          },
        ],
        hasImpact: true,
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter();
      const output = formatter.format(report);

      expect(output).toContain("1 artifact affected");
    });

    it("should use plural form for multiple artifacts", () => {
      const report: ImpactReport = {
        artifactId: "B.2",
        operation: "cancel",
        impactedArtifacts: [
          {
            id: "B.1",
            artifact: scaffoldMilestone({
              title: "Milestone B.1",
              createdBy: "Test User (test@example.com)",
              summary: "Milestone",
              deliverables: ["D1"],
            }),
            impactType: "blocks_parent_completion",
            reason: "Parent can't complete",
          },
          {
            id: "B.3",
            artifact: scaffoldIssue({
              title: "Issue B.3",
              createdBy: "Test User (test@example.com)",
              summary: "Issue",
              acceptanceCriteria: ["AC1"],
            }),
            impactType: "breaks_dependency",
            reason: "Dependency broken",
          },
        ],
        hasImpact: true,
        analyzedAt: new Date().toISOString(),
      };

      const formatter = new ImpactReportFormatter();
      const output = formatter.format(report);

      expect(output).toContain("2 artifacts affected");
    });
  });
});
