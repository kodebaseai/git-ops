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

describe("ImpactAnalyzer - Performance Tests", () => {
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
   * Creates a large artifact graph with 1000+ artifacts
   * Structure:
   * - 10 Initiatives (A, B, C, D, E, F, G, H, I, J)
   * - 10 Milestones per initiative (X.1-X.10)
   * - 10 Issues per milestone (X.Y.1-X.Y.10)
   * Total: 10 + 100 + 1000 = 1110 artifacts
   */
  async function createLargeGraph(): Promise<void> {
    const initiatives = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

    for (const initiativeId of initiatives) {
      // Create initiative
      await artifactService.createArtifact({
        id: initiativeId,
        artifact: scaffoldInitiative({
          title: `Initiative ${initiativeId}`,
          createdBy: "Test User (test@example.com)",
          vision: `Vision ${initiativeId}`,
          scopeIn: [`Feature ${initiativeId}`],
          scopeOut: ["Feature Z"],
          successCriteria: [`Criterion ${initiativeId}`],
        }),
        slug: `initiative-${initiativeId.toLowerCase()}`,
        baseDir: testBaseDir,
      });

      // Create 10 milestones per initiative
      for (let m = 1; m <= 10; m++) {
        const milestoneId = `${initiativeId}.${m}`;

        await artifactService.createArtifact({
          id: milestoneId,
          artifact: scaffoldMilestone({
            title: `Milestone ${milestoneId}`,
            createdBy: "Test User (test@example.com)",
            summary: `Milestone ${m}`,
            deliverables: [`Deliverable ${m}`],
          }),
          slug: `milestone-${initiativeId.toLowerCase()}-${m}`,
          baseDir: testBaseDir,
        });

        // Create 10 issues per milestone
        for (let i = 1; i <= 10; i++) {
          const issueId = `${milestoneId}.${i}`;
          const prevIssueId = i > 1 ? `${milestoneId}.${i - 1}` : null;

          const issue = scaffoldIssue({
            title: `Issue ${issueId}`,
            createdBy: "Test User (test@example.com)",
            summary: `Issue ${i}`,
            acceptanceCriteria: [`Criterion ${i}`],
          });

          // Create dependency chain: each issue depends on the previous one
          if (prevIssueId) {
            issue.metadata.relationships = {
              blocked_by: [prevIssueId],
              blocks: [],
            };
          }

          await artifactService.createArtifact({
            id: issueId,
            artifact: issue,
            slug: `issue-${initiativeId.toLowerCase()}-${m}-${i}`,
            baseDir: testBaseDir,
          });
        }
      }
    }
  }

  it("should analyze 1000+ artifact graph in less than 1 second", async () => {
    // Create large graph
    await createLargeGraph();

    // Start timing
    const startTime = performance.now();

    // Analyze impact of deleting a mid-level artifact
    const report = await analyzer.analyze("A.5", "delete");

    // End timing
    const endTime = performance.now();
    const duration = endTime - startTime;

    // Verify analysis completed
    expect(report).toBeDefined();
    expect(report.artifactId).toBe("A.5");

    // Verify performance requirement: <1s
    expect(duration).toBeLessThan(1000);

    // Log performance metrics
    console.log(`Performance: Analyzed graph in ${duration.toFixed(2)}ms`);
    console.log(`Impacted artifacts: ${report.impactedArtifacts.length}`);
  }, 30000); // 30 second timeout for test setup

  it("should cache loaded artifacts for performance", async () => {
    await createLargeGraph();

    // First analysis
    const start1 = performance.now();
    await analyzer.analyze("A.1", "delete");
    const duration1 = performance.now() - start1;

    // Second analysis (should be faster due to caching)
    const start2 = performance.now();
    await analyzer.analyze("A.2", "delete");
    const duration2 = performance.now() - start2;

    // Second analysis should be faster or similar
    // (may not always be faster due to different artifacts, but should be comparable)
    expect(duration2).toBeLessThan(duration1 * 2); // At most 2x the first time

    console.log(`First analysis: ${duration1.toFixed(2)}ms`);
    console.log(`Second analysis: ${duration2.toFixed(2)}ms`);
  }, 30000);

  it("should handle deep dependency chains efficiently", async () => {
    // Create a deep chain: A.1.1 -> A.1.2 -> ... -> A.1.100
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
        summary: "Milestone",
        deliverables: ["Deliverable"],
      }),
      slug: "milestone-a1",
      baseDir: testBaseDir,
    });

    // Create 100 issues in a chain
    for (let i = 1; i <= 100; i++) {
      const issueId = `A.1.${i}`;
      const prevIssueId = i > 1 ? `A.1.${i - 1}` : null;

      const issue = scaffoldIssue({
        title: `Issue ${issueId}`,
        createdBy: "Test User (test@example.com)",
        summary: `Issue ${i}`,
        acceptanceCriteria: [`Criterion ${i}`],
      });

      if (prevIssueId) {
        issue.metadata.relationships = {
          blocked_by: [prevIssueId],
          blocks: [],
        };
      }

      await artifactService.createArtifact({
        id: issueId,
        artifact: issue,
        slug: `issue-a1-${i}`,
        baseDir: testBaseDir,
      });
    }

    // Analyze impact at the beginning of the chain
    const startTime = performance.now();
    const report = await analyzer.analyze("A.1.1", "delete");
    const duration = performance.now() - startTime;

    // Should complete quickly even with 100-deep chain
    expect(duration).toBeLessThan(500);
    expect(report.hasImpact).toBe(true);

    console.log(`Deep chain analysis (100 levels): ${duration.toFixed(2)}ms`);
  }, 15000);

  it("should analyze multiple operations efficiently", async () => {
    // Create moderate-sized graph
    await createLargeGraph();

    const operations = ["cancel", "delete", "remove_dependency"] as const;
    const artifactIds = ["A.1.5", "B.2.3", "C.3.7"];

    const startTime = performance.now();

    // Analyze all combinations
    const reports = [];
    for (const artifactId of artifactIds) {
      for (const operation of operations) {
        const report = await analyzer.analyze(artifactId, operation);
        reports.push(report);
      }
    }

    const duration = performance.now() - startTime;

    // 9 analyses should complete in reasonable time
    expect(duration).toBeLessThan(3000);
    expect(reports.length).toBe(9);

    console.log(`Multiple operations (9 analyses): ${duration.toFixed(2)}ms`);
    console.log(`Average per analysis: ${(duration / 9).toFixed(2)}ms`);
  }, 30000);
});
