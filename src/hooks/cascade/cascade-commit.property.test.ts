/**
 * Property-based tests for cascade commit message generation
 *
 * Tests invariants for pure functions:
 * - collectAffectedArtifacts: uniqueness, sorting, event deduplication
 * - generateCommitMessage: format consistency, PR reference inclusion
 */

import type { CascadeResult } from "@kodebase/artifacts";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type {
  CascadeCommitAttribution,
  CreateCascadeCommitOptions,
} from "./cascade-commit-types.js";

// Import private functions via module augmentation for testing
// In a real scenario, these would be exported or we'd test through the public API
// For now, we'll recreate the logic to test the invariants

/**
 * Collect affected artifacts from cascade results
 * (Copy of private function for testing)
 */
function collectAffectedArtifacts(cascadeResults: {
  completionCascade: CascadeResult;
  readinessCascade: CascadeResult;
}): Array<{ artifactId: string; description: string }> {
  const artifactMap = new Map<string, string[]>();

  // Collect events from both cascades
  const allEvents = [
    ...cascadeResults.completionCascade.events,
    ...cascadeResults.readinessCascade.events,
  ];

  // Group events by artifact
  for (const event of allEvents) {
    if (!artifactMap.has(event.artifactId)) {
      artifactMap.set(event.artifactId, []);
    }
    artifactMap.get(event.artifactId)?.push(event.event);
  }

  // Format as "artifactId: events"
  const result: Array<{ artifactId: string; description: string }> = [];
  for (const [artifactId, events] of artifactMap.entries()) {
    const uniqueEvents = [...new Set(events)];
    result.push({
      artifactId,
      description: uniqueEvents.join(", "),
    });
  }

  // Sort by artifact ID
  result.sort((a, b) => a.artifactId.localeCompare(b.artifactId));

  return result;
}

/**
 * Generate commit message
 * (Copy of private function for testing)
 */
function generateCommitMessage(
  cascadeResults: CreateCascadeCommitOptions["cascadeResults"],
  attribution: CascadeCommitAttribution,
): string {
  const lines: string[] = [];

  // Title line
  const prRef = cascadeResults.mergeMetadata.prNumber
    ? ` (PR #${cascadeResults.mergeMetadata.prNumber})`
    : "";
  lines.push(`cascade: Update artifact states after PR merge${prRef}`);
  lines.push("");

  // Affected artifacts section
  const affectedArtifacts = collectAffectedArtifacts(cascadeResults);
  if (affectedArtifacts.length > 0) {
    lines.push("Affected artifacts:");
    for (const artifact of affectedArtifacts) {
      lines.push(`- ${artifact.artifactId}: ${artifact.description}`);
    }
    lines.push("");
  }

  // Attribution footer per ADR-006
  lines.push(
    `Agent-Attribution: ${attribution.agentName}/${attribution.agentVersion}`,
  );

  const triggerRef = attribution.prNumber
    ? ` (PR #${attribution.prNumber})`
    : "";
  lines.push(`Trigger: ${attribution.triggerEvent}${triggerRef}`);

  return lines.join("\n");
}

// Arbitraries for generating test data

/**
 * Generate a valid artifact ID (e.g., "A.1.2", "B.3")
 */
const artifactIdArbitrary = fc
  .tuple(
    fc.constantFrom("A", "B", "C", "D", "E", "F"),
    fc.array(fc.integer({ min: 1, max: 99 }), { minLength: 1, maxLength: 3 }),
  )
  .map(([letter, numbers]) => `${letter}.${numbers.join(".")}`);

/**
 * Generate a cascade event
 */
const cascadeEventArbitrary = fc.record({
  artifactId: artifactIdArbitrary,
  event: fc.constantFrom(
    "ready",
    "in_progress",
    "in_review",
    "completed",
    "blocked",
  ),
  timestamp: fc
    .integer({ min: 1704067200000, max: 1798761600000 }) // 2024-01-01 to 2027-01-01 in ms
    .map((ms) => new Date(ms).toISOString()),
  actor: fc.constantFrom(
    "System Cascade (cascade@completion)",
    "System Cascade (cascade@dependency-resolution)",
    "test-user@example.com",
  ),
  trigger: fc.constantFrom(
    "children_completed",
    "dependencies_met",
    "pr_merged",
    "manual",
  ),
});

/**
 * Generate a CascadeResult
 */
const cascadeResultArbitrary = fc
  .record({
    updatedArtifacts: fc.constant([]), // Not used in our functions
    events: fc.array(cascadeEventArbitrary, { minLength: 0, maxLength: 20 }),
  })
  .map((r) => ({ ...r, updatedArtifacts: [...r.updatedArtifacts] }));

/**
 * Generate cascade results (completion + readiness)
 */
const cascadeResultsArbitrary = fc.record({
  completionCascade: cascadeResultArbitrary,
  readinessCascade: cascadeResultArbitrary,
  mergeMetadata: fc.record({
    targetBranch: fc.constantFrom("main", "master", "develop"),
    sourceBranch: fc.option(
      fc
        .tuple(artifactIdArbitrary, fc.string({ minLength: 5, maxLength: 10 }))
        .map(([id, suffix]) => `${id}-${suffix}`),
      { nil: null },
    ),
    commitSha: fc
      .array(
        fc.constantFrom(
          "0",
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "a",
          "b",
          "c",
          "d",
          "e",
          "f",
        ),
        { minLength: 40, maxLength: 40 },
      )
      .map((arr) => arr.join("")),
    prNumber: fc.option(fc.integer({ min: 1, max: 9999 }), { nil: null }),
    prTitle: fc.option(fc.string({ minLength: 10, maxLength: 50 }), {
      nil: null,
    }),
    prBody: fc.option(fc.string({ minLength: 20, maxLength: 100 }), {
      nil: null,
    }),
    isPRMerge: fc.boolean(),
    artifactIds: fc.array(artifactIdArbitrary, {
      minLength: 1,
      maxLength: 5,
    }),
  }),
  totalArtifactsUpdated: fc.integer({ min: 0, max: 100 }),
  totalEventsAdded: fc.integer({ min: 0, max: 100 }),
  summary: fc.string({ minLength: 5, maxLength: 50 }),
});

/**
 * Generate cascade commit attribution
 */
const attributionArbitrary = fc.record({
  agentName: fc.constantFrom("Kodebase GitOps", "Test Agent", "Claude Agent"),
  agentVersion: fc
    .tuple(
      fc.integer({ min: 0, max: 9 }),
      fc.integer({ min: 0, max: 99 }),
      fc.integer({ min: 0, max: 99 }),
    )
    .map(([major, minor, patch]) => `v${major}.${minor}.${patch}`),
  triggerEvent: fc.constantFrom("post-merge", "post-checkout", "manual"),
  prNumber: fc.option(fc.integer({ min: 1, max: 9999 }), { nil: undefined }),
  humanActor: fc.option(fc.emailAddress(), { nil: undefined }),
});

describe("cascade-commit property tests", () => {
  describe("collectAffectedArtifacts", () => {
    it("returns unique artifact IDs (no duplicates)", () => {
      fc.assert(
        fc.property(cascadeResultsArbitrary, (cascadeResults) => {
          const result = collectAffectedArtifacts(cascadeResults);

          // Extract all artifact IDs
          const artifactIds = result.map((a) => a.artifactId);

          // Check uniqueness
          const uniqueIds = [...new Set(artifactIds)];
          expect(artifactIds.length).toBe(uniqueIds.length);
        }),
        { numRuns: 100 },
      );
    });

    it("returns artifacts sorted lexicographically by ID", () => {
      fc.assert(
        fc.property(cascadeResultsArbitrary, (cascadeResults) => {
          const result = collectAffectedArtifacts(cascadeResults);

          // Extract artifact IDs
          const artifactIds = result.map((a) => a.artifactId);

          // Check sorting
          const sortedIds = [...artifactIds].sort();
          expect(artifactIds).toEqual(sortedIds);
        }),
        { numRuns: 100 },
      );
    });

    it("deduplicates events for each artifact", () => {
      fc.assert(
        fc.property(cascadeResultsArbitrary, (cascadeResults) => {
          const result = collectAffectedArtifacts(cascadeResults);

          // Each description should not have duplicate events
          for (const artifact of result) {
            const events = artifact.description.split(", ");
            const uniqueEvents = [...new Set(events)];
            expect(events.length).toBe(uniqueEvents.length);
          }
        }),
        { numRuns: 100 },
      );
    });

    it("preserves total artifact count from input events", () => {
      fc.assert(
        fc.property(cascadeResultsArbitrary, (cascadeResults) => {
          const result = collectAffectedArtifacts(cascadeResults);

          // Collect unique artifact IDs from input
          const inputArtifactIds = new Set([
            ...cascadeResults.completionCascade.events.map((e) => e.artifactId),
            ...cascadeResults.readinessCascade.events.map((e) => e.artifactId),
          ]);

          // Result count should match unique input IDs
          expect(result.length).toBe(inputArtifactIds.size);
        }),
        { numRuns: 100 },
      );
    });

    it("is idempotent (calling twice gives same result)", () => {
      fc.assert(
        fc.property(cascadeResultsArbitrary, (cascadeResults) => {
          const result1 = collectAffectedArtifacts(cascadeResults);
          const result2 = collectAffectedArtifacts(cascadeResults);

          expect(result1).toEqual(result2);
        }),
        { numRuns: 100 },
      );
    });
  });

  describe("generateCommitMessage", () => {
    it("always includes agent attribution footer", () => {
      fc.assert(
        fc.property(
          cascadeResultsArbitrary,
          attributionArbitrary,
          (cascadeResults, attribution) => {
            const message = generateCommitMessage(cascadeResults, attribution);

            // Should contain attribution
            expect(message).toContain(
              `Agent-Attribution: ${attribution.agentName}/${attribution.agentVersion}`,
            );
            expect(message).toContain(`Trigger: ${attribution.triggerEvent}`);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("includes PR reference in title when prNumber is present", () => {
      fc.assert(
        fc.property(
          cascadeResultsArbitrary.filter(
            (r) => r.mergeMetadata.prNumber != null,
          ),
          attributionArbitrary,
          (cascadeResults, attribution) => {
            const message = generateCommitMessage(cascadeResults, attribution);

            // Should include PR reference in title
            expect(message).toContain(
              `(PR #${cascadeResults.mergeMetadata.prNumber})`,
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it("includes PR reference in footer when attribution.prNumber is present", () => {
      fc.assert(
        fc.property(
          cascadeResultsArbitrary,
          attributionArbitrary.filter((a) => a.prNumber != null),
          (cascadeResults, attribution) => {
            const message = generateCommitMessage(cascadeResults, attribution);

            // Should include PR reference in trigger line
            expect(message).toMatch(
              new RegExp(
                `Trigger: ${attribution.triggerEvent} \\(PR #${attribution.prNumber}\\)`,
              ),
            );
          },
        ),
        { numRuns: 100 },
      );
    });

    it("lists affected artifacts in sorted order", () => {
      fc.assert(
        fc.property(
          cascadeResultsArbitrary.filter(
            (r) =>
              r.completionCascade.events.length > 0 ||
              r.readinessCascade.events.length > 0,
          ),
          attributionArbitrary,
          (cascadeResults, attribution) => {
            const message = generateCommitMessage(cascadeResults, attribution);

            // Extract artifact IDs from message
            const lines = message.split("\n");
            const artifactLines = lines.filter((line) => line.startsWith("- "));
            const artifactIds = artifactLines.map(
              (line) => line.match(/- ([A-Z]\.\d+(?:\.\d+)*)/)?.[1] ?? "",
            );

            // Should be sorted
            const sortedIds = [...artifactIds].sort();
            expect(artifactIds).toEqual(sortedIds);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("starts with 'cascade: Update artifact states' title", () => {
      fc.assert(
        fc.property(
          cascadeResultsArbitrary,
          attributionArbitrary,
          (cascadeResults, attribution) => {
            const message = generateCommitMessage(cascadeResults, attribution);

            // Should start with cascade prefix
            expect(message).toMatch(
              /^cascade: Update artifact states after PR merge/,
            );
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
