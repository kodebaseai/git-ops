/**
 * End-to-End Integration Tests for Impact Analysis
 *
 * Tests the complete impact analysis flow including:
 * - Complex artifact graph scenarios
 * - Cancellation and deletion impact analysis
 * - CLI output formatting with colors
 * - JSON output format
 */

import { ArtifactService } from "@kodebase/artifacts";
import {
  scaffoldInitiative,
  scaffoldIssue,
  scaffoldMilestone,
} from "@kodebase/core";
import { vol } from "memfs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImpactAnalyzer } from "./impact-analyzer.js";
import { ImpactReportFormatter } from "./impact-report-formatter.js";

// Mock node:fs/promises to use memfs
vi.mock("node:fs/promises", async () => {
  const { fs } = await import("memfs");
  return {
    default: fs.promises,
  };
});

describe("Impact Analysis E2E Integration Tests", () => {
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
   * Creates a complex artifact graph for E2E testing:
   *
   * Initiative A
   *   ├─ Milestone A.1
   *   │   ├─ Issue A.1.1 (completed, blocks A.1.2)
   *   │   ├─ Issue A.1.2 (blocked by A.1.1, blocks A.2.1)
   *   │   └─ Issue A.1.3 (in progress)
   *   └─ Milestone A.2
   *       ├─ Issue A.2.1 (blocked by A.1.2)
   *       └─ Issue A.2.2 (blocked by A.2.1)
   *
   * Initiative B
   *   └─ Milestone B.1
   *       ├─ Issue B.1.1 (blocks B.1.2, B.1.3)
   *       ├─ Issue B.1.2 (blocked by B.1.1)
   *       └─ Issue B.1.3 (blocked by B.1.1, cancelled)
   */
  async function createComplexArtifactGraph() {
    // Create Initiative A
    await artifactService.createArtifact({
      id: "A",
      artifact: scaffoldInitiative({
        title: "Initiative A",
        createdBy: "Test User (test@example.com)",
        vision: "Vision for Initiative A",
        scopeIn: ["Feature A", "Feature B"],
        scopeOut: ["Feature Z"],
        successCriteria: ["Criterion A"],
      }),
      slug: "initiative-a",
      baseDir: testBaseDir,
    });

    // Create Milestone A.1
    await artifactService.createArtifact({
      id: "A.1",
      artifact: scaffoldMilestone({
        title: "Milestone A.1",
        createdBy: "Test User (test@example.com)",
        summary: "First milestone for Initiative A",
        deliverables: ["Deliverable 1", "Deliverable 2"],
      }),
      slug: "milestone-a1",
      baseDir: testBaseDir,
    });

    // Create Issue A.1.1 (completed)
    let issue = scaffoldIssue({
      title: "Issue A.1.1",
      createdBy: "Test User (test@example.com)",
      summary: "First issue - completed",
      acceptanceCriteria: ["AC1"],
    });
    issue.metadata.events.push({
      event: "completed",
      timestamp: "2025-11-01T10:00:00Z",
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

    // Create Issue A.1.2 (blocked by A.1.1, blocks A.2.1)
    issue = scaffoldIssue({
      title: "Issue A.1.2",
      createdBy: "Test User (test@example.com)",
      summary: "Second issue - in progress",
      acceptanceCriteria: ["AC2"],
    });
    issue.metadata.relationships = {
      blocked_by: ["A.1.1"],
      blocks: ["A.2.1"],
    };
    await artifactService.createArtifact({
      id: "A.1.2",
      artifact: issue,
      slug: "issue-a12",
      baseDir: testBaseDir,
    });

    // Create Issue A.1.3 (in progress, no dependencies)
    issue = scaffoldIssue({
      title: "Issue A.1.3",
      createdBy: "Test User (test@example.com)",
      summary: "Third issue - in progress",
      acceptanceCriteria: ["AC3"],
    });
    await artifactService.createArtifact({
      id: "A.1.3",
      artifact: issue,
      slug: "issue-a13",
      baseDir: testBaseDir,
    });

    // Create Milestone A.2
    await artifactService.createArtifact({
      id: "A.2",
      artifact: scaffoldMilestone({
        title: "Milestone A.2",
        createdBy: "Test User (test@example.com)",
        summary: "Second milestone for Initiative A",
        deliverables: ["Deliverable 3"],
      }),
      slug: "milestone-a2",
      baseDir: testBaseDir,
    });

    // Create Issue A.2.1 (blocked by A.1.2)
    issue = scaffoldIssue({
      title: "Issue A.2.1",
      createdBy: "Test User (test@example.com)",
      summary: "First issue in A.2",
      acceptanceCriteria: ["AC4"],
    });
    issue.metadata.relationships = {
      blocked_by: ["A.1.2"],
      blocks: ["A.2.2"],
    };
    await artifactService.createArtifact({
      id: "A.2.1",
      artifact: issue,
      slug: "issue-a21",
      baseDir: testBaseDir,
    });

    // Create Issue A.2.2 (blocked by A.2.1)
    issue = scaffoldIssue({
      title: "Issue A.2.2",
      createdBy: "Test User (test@example.com)",
      summary: "Second issue in A.2",
      acceptanceCriteria: ["AC5"],
    });
    issue.metadata.relationships = {
      blocked_by: ["A.2.1"],
      blocks: [],
    };
    await artifactService.createArtifact({
      id: "A.2.2",
      artifact: issue,
      slug: "issue-a22",
      baseDir: testBaseDir,
    });

    // Create Initiative B
    await artifactService.createArtifact({
      id: "B",
      artifact: scaffoldInitiative({
        title: "Initiative B",
        createdBy: "Test User (test@example.com)",
        vision: "Vision for Initiative B",
        scopeIn: ["Feature C"],
        scopeOut: ["Feature Y"],
        successCriteria: ["Criterion B"],
      }),
      slug: "initiative-b",
      baseDir: testBaseDir,
    });

    // Create Milestone B.1
    await artifactService.createArtifact({
      id: "B.1",
      artifact: scaffoldMilestone({
        title: "Milestone B.1",
        createdBy: "Test User (test@example.com)",
        summary: "First milestone for Initiative B",
        deliverables: ["Deliverable B1"],
      }),
      slug: "milestone-b1",
      baseDir: testBaseDir,
    });

    // Create Issue B.1.1 (blocks B.1.2 and B.1.3)
    issue = scaffoldIssue({
      title: "Issue B.1.1",
      createdBy: "Test User (test@example.com)",
      summary: "First issue in B.1",
      acceptanceCriteria: ["ACB1"],
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

    // Create Issue B.1.2 (blocked by B.1.1)
    issue = scaffoldIssue({
      title: "Issue B.1.2",
      createdBy: "Test User (test@example.com)",
      summary: "Second issue in B.1",
      acceptanceCriteria: ["ACB2"],
    });
    issue.metadata.relationships = {
      blocked_by: ["B.1.1"],
      blocks: [],
    };
    await artifactService.createArtifact({
      id: "B.1.2",
      artifact: issue,
      slug: "issue-b12",
      baseDir: testBaseDir,
    });

    // Create Issue B.1.3 (blocked by B.1.1, cancelled)
    issue = scaffoldIssue({
      title: "Issue B.1.3",
      createdBy: "Test User (test@example.com)",
      summary: "Third issue in B.1 - cancelled",
      acceptanceCriteria: ["ACB3"],
    });
    issue.metadata.events.push({
      event: "cancelled",
      timestamp: "2025-11-02T10:00:00Z",
      actor: "Test User (test@example.com)",
      trigger: "manual_cancel",
    });
    issue.metadata.relationships = {
      blocked_by: ["B.1.1"],
      blocks: [],
    };
    await artifactService.createArtifact({
      id: "B.1.3",
      artifact: issue,
      slug: "issue-b13",
      baseDir: testBaseDir,
    });
  }

  describe("E2E: Cancel artifact with dependents", () => {
    it("should analyze cancellation of A.1.2 and format CLI output with dependents unblocked", async () => {
      await createComplexArtifactGraph();

      // Analyze cancellation of A.1.2 which blocks A.2.1
      const report = await analyzer.analyzeCancellation("A.1.2");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      // Verify analysis results
      expect(report.dependentsUnblocked.length).toBe(1);
      expect(report.dependentsUnblocked[0].id).toBe("A.2.1");
      expect(report.hasImpact).toBe(true);

      // Verify CLI output formatting
      expect(output).toContain("Impact Analysis: Cancel A.1.2");
      expect(output).toContain("Dependents Unblocked (1)");
      expect(output).toContain("A.2.1 - Issue A.2.1");
      expect(output).toContain(report.summary);
    });

    it("should analyze cancellation of B.1.1 with multiple dependents", async () => {
      await createComplexArtifactGraph();

      // Analyze cancellation of B.1.1 which blocks B.1.2 and B.1.3
      const report = await analyzer.analyzeCancellation("B.1.1");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      // Verify analysis results - both B.1.2 and B.1.3 show as dependents
      // (B.1.3 is cancelled but still tracked as a dependent)
      expect(report.dependentsUnblocked.length).toBe(2);
      expect(report.dependentsUnblocked.some((d) => d.id === "B.1.2")).toBe(
        true,
      );
      expect(report.dependentsUnblocked.some((d) => d.id === "B.1.3")).toBe(
        true,
      );
      expect(report.hasImpact).toBe(true);

      // Verify CLI output
      expect(output).toContain("Impact Analysis: Cancel B.1.1");
      expect(output).toContain("Dependents Unblocked (2)");
      expect(output).toContain("B.1.2 - Issue B.1.2");
      expect(output).toContain("B.1.3 - Issue B.1.3");
    });
  });

  describe("E2E: Cancel artifact affecting parent completion", () => {
    it("should analyze cancellation affecting parent milestone completion", async () => {
      await createComplexArtifactGraph();

      // Cancel A.1.3 which should affect parent A.1 completion check
      const report = await analyzer.analyzeCancellation("A.1.3");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      // Verify parent completion impact
      expect(report.parentCompletionAffected.length).toBeGreaterThan(0);
      expect(report.parentCompletionAffected[0].id).toBe("A.1");

      // Verify CLI output
      expect(output).toContain("Parent Completion");
      expect(output).toContain("A.1 - Milestone A.1");
    });

    it("should show verbose output with detailed messages", async () => {
      await createComplexArtifactGraph();

      const report = await analyzer.analyzeCancellation("A.1.3");
      const formatter = new ImpactReportFormatter({
        noColor: true,
        verbose: true,
      });
      const output = formatter.format(report);

      // Verbose mode should include detailed messages from the report
      // In this case, it shows the parent completion message
      expect(output).toContain("Parent A.1 still has");
    });
  });

  describe("E2E: Delete artifact with broken references", () => {
    it("should analyze deletion of A.1.1 with orphaned dependents", async () => {
      await createComplexArtifactGraph();

      // Delete A.1.1 which A.1.2 depends on
      const report = await analyzer.analyzeDeletion("A.1.1");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      // Verify orphaned dependents
      expect(report.orphanedDependents.length).toBe(1);
      expect(report.orphanedDependents[0].id).toBe("A.1.2");
      expect(report.orphanedDependents[0].fullyOrphaned).toBe(true);

      // Verify CLI output
      expect(output).toContain("Impact Analysis: Delete A.1.1");
      expect(output).toContain("Orphaned Dependents (1)");
      expect(output).toContain("A.1.2 - Issue A.1.2");
      expect(output).toContain("[FULLY ORPHANED]");
    });

    it("should analyze deletion with broken parent reference", async () => {
      await createComplexArtifactGraph();

      // Delete A.1.1 which is a child of A.1
      const report = await analyzer.analyzeDeletion("A.1.1");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      // Verify broken parent
      expect(report.brokenParent).not.toBeNull();
      expect(report.brokenParent?.id).toBe("A.1");

      // Verify CLI output
      expect(output).toContain("Broken Parent");
      expect(output).toContain("A.1 - Milestone A.1");
    });

    it("should analyze deletion with affected siblings", async () => {
      await createComplexArtifactGraph();

      // Delete A.1.1 which has siblings A.1.2 and A.1.3
      const report = await analyzer.analyzeDeletion("A.1.1");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      // Verify affected siblings
      expect(report.affectedSiblings.length).toBe(2);

      // Verify CLI output
      expect(output).toContain("Affected Siblings (2)");
    });
  });

  describe("E2E: Delete artifact requiring --force flag", () => {
    it("should require --force flag when deleting artifact with dependents", async () => {
      await createComplexArtifactGraph();

      // Delete A.1.2 which A.2.1 depends on
      const report = await analyzer.analyzeDeletion("A.1.2");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      // Verify force flag requirement
      expect(report.requiresForce).toBe(true);
      expect(report.orphanedDependents.length).toBeGreaterThan(0);

      // Verify CLI output shows force requirement
      expect(output).toContain("--force flag required");
    });

    it("should not require --force flag when deleting artifact without dependents", async () => {
      await createComplexArtifactGraph();

      // Delete A.2.2 which has no dependents
      const report = await analyzer.analyzeDeletion("A.2.2");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      // Verify no force flag required
      expect(report.requiresForce).toBe(false);

      // Note: May still have impact due to parent/siblings
      if (!report.hasImpact) {
        expect(output).toContain("Safe to proceed without --force flag");
      }
    });
  });

  describe("E2E: CLI output formatting", () => {
    it("should format CLI output with proper indentation and symbols", async () => {
      await createComplexArtifactGraph();

      const report = await analyzer.analyzeDeletion("A.1.1");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      // Verify structure with symbols (without colors)
      expect(output).toContain("Impact Analysis: Delete A.1.1");
      expect(output).toContain("Orphaned Dependents");
      expect(output).toContain("Broken Parent");
      expect(output).toContain("Summary:");

      // Verify indentation (2 spaces for items)
      expect(output).toMatch(/ {2}• A\.1\.2/);
      expect(output).toMatch(/ {2}• A\.1/);
    });

    it("should include ANSI color codes when colors enabled", async () => {
      await createComplexArtifactGraph();

      const report = await analyzer.analyzeDeletion("A.1.1");
      const formatter = new ImpactReportFormatter({ noColor: false });
      const output = formatter.format(report);

      // Should contain ANSI escape codes
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Testing ANSI escape codes
      expect(output).toMatch(/\x1b\[\d+m/);
    });

    it("should disable colors when noColor option is true", async () => {
      await createComplexArtifactGraph();

      const report = await analyzer.analyzeDeletion("A.1.1");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      // Should not contain ANSI escape codes
      // biome-ignore lint/suspicious/noControlCharactersInRegex: Testing ANSI escape codes
      expect(output).not.toMatch(/\x1b\[\d+m/);
    });
  });

  describe("E2E: JSON output format", () => {
    it("should format cancellation report as JSON", async () => {
      await createComplexArtifactGraph();

      const report = await analyzer.analyzeCancellation("A.1.2");
      const formatter = new ImpactReportFormatter({ format: "json" });
      const output = formatter.format(report);

      // Should be valid JSON
      const parsed = JSON.parse(output);
      expect(parsed.artifactId).toBe("A.1.2");
      expect(parsed.dependentsUnblocked).toBeDefined();
      expect(parsed.parentCompletionAffected).toBeDefined();
      expect(parsed.hasImpact).toBe(true);
      expect(parsed.summary).toBeDefined();
    });

    it("should format deletion report as JSON", async () => {
      await createComplexArtifactGraph();

      const report = await analyzer.analyzeDeletion("A.1.1");
      const formatter = new ImpactReportFormatter({ format: "json" });
      const output = formatter.format(report);

      // Should be valid JSON
      const parsed = JSON.parse(output);
      expect(parsed.artifactId).toBe("A.1.1");
      expect(parsed.orphanedDependents).toBeDefined();
      expect(parsed.brokenParent).toBeDefined();
      expect(parsed.affectedSiblings).toBeDefined();
      expect(parsed.requiresForce).toBe(true);
      expect(parsed.hasImpact).toBe(true);
    });

    it("should format JSON with proper indentation", async () => {
      await createComplexArtifactGraph();

      const report = await analyzer.analyzeCancellation("A.1.2");
      const formatter = new ImpactReportFormatter({ format: "json" });
      const output = formatter.format(report);

      // JSON should be pretty-printed (2-space indentation)
      expect(output).toContain('  "artifactId"');
      expect(output).toContain('  "hasImpact"');
    });
  });

  describe("E2E: Remove dependency impact analysis", () => {
    it("should analyze removing a dependency from an artifact", async () => {
      await createComplexArtifactGraph();

      // Analyze removing A.1.1 from A.1.2's dependencies
      const report = await analyzer.analyze("A.1.2", "remove_dependency");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report, "remove_dependency");

      // Verify analysis identifies the artifact itself
      expect(report.impactedArtifacts.length).toBeGreaterThan(0);
      expect(report.impactedArtifacts.some((a) => a.id === "A.1.2")).toBe(true);

      // Verify CLI output
      expect(output).toContain("Impact Analysis: Remove Dependency A.1.2");
      expect(output).toContain("artifact affected");
    });

    it("should identify shared dependencies when removing a dependency", async () => {
      await createComplexArtifactGraph();

      // A.1.2 depends on A.1.1, and if we had another artifact depending on A.1.1,
      // they would share the dependency
      const report = await analyzer.analyze("A.1.2", "remove_dependency");

      // The artifact itself should be in the impact report
      expect(report.impactedArtifacts.some((a) => a.id === "A.1.2")).toBe(true);
      expect(report.hasImpact).toBe(true);
    });

    it("should format remove_dependency report with proper CLI output", async () => {
      await createComplexArtifactGraph();

      const report = await analyzer.analyze("A.1.2", "remove_dependency");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report, "remove_dependency");

      // Verify proper operation name formatting
      expect(output).toContain("Remove Dependency");
      expect(output).toContain("Summary:");
      expect(output).toMatch(/\d+ artifact/);
    });
  });

  describe("E2E: Complex multi-level scenarios", () => {
    it("should handle cascade impact through dependency chain", async () => {
      await createComplexArtifactGraph();

      // Deleting A.1.2 should:
      // 1. Orphan A.2.1 (which blocks A.2.2)
      // 2. Break parent A.1
      // 3. Affect sibling A.1.3
      const report = await analyzer.analyzeDeletion("A.1.2");

      expect(report.orphanedDependents.length).toBe(1);
      expect(report.orphanedDependents[0].id).toBe("A.2.1");
      expect(report.brokenParent?.id).toBe("A.1");
      expect(report.affectedSiblings.length).toBeGreaterThan(0);
      expect(report.requiresForce).toBe(true);
    });

    it("should analyze complete milestone with all children", async () => {
      await createComplexArtifactGraph();

      // Deleting A.1 milestone should orphan all its children
      const report = await analyzer.analyzeDeletion("A.1");

      expect(report.orphanedChildren.length).toBe(3); // A.1.1, A.1.2, A.1.3
      expect(report.brokenParent?.id).toBe("A");
    });

    it("should format complex report with multiple impact types", async () => {
      await createComplexArtifactGraph();

      const report = await analyzer.analyzeDeletion("A.1.1");
      const formatter = new ImpactReportFormatter({ noColor: true });
      const output = formatter.format(report);

      // Should contain all impact sections
      expect(output).toContain("Orphaned Dependents");
      expect(output).toContain("Broken Parent");
      expect(output).toContain("Affected Siblings");
      expect(output).toContain("Summary:");

      // Verify summary aggregates all impacts
      const summaryMatch = report.summary.match(/\d+ artifact/);
      expect(summaryMatch).toBeTruthy();
    });
  });
});
