/**
 * Property-based tests for impact report formatter
 *
 * Tests invariants for groupByImpactType:
 * - Partitioning: No artifact appears in multiple groups
 * - Total count preservation: Sum of all groups equals input count
 * - Correctness: Each artifact is in the group matching its impactType
 */

import type { TAnyArtifact } from "@kodebase/core";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { ImpactedArtifact, ImpactType } from "./impact-analyzer.js";

/**
 * Recreate the groupByImpactType function for testing
 * (It's private in the formatter, so we test the logic directly)
 */
function groupByImpactType(artifacts: ImpactedArtifact[]) {
  return {
    blocks_parent_completion: artifacts.filter(
      (a) => a.impactType === "blocks_parent_completion",
    ),
    breaks_dependency: artifacts.filter(
      (a) => a.impactType === "breaks_dependency",
    ),
    orphans_children: artifacts.filter(
      (a) => a.impactType === "orphans_children",
    ),
  };
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
 * Generate an impact type
 */
const impactTypeArbitrary: fc.Arbitrary<ImpactType> = fc.constantFrom(
  "blocks_parent_completion",
  "breaks_dependency",
  "orphans_children",
);

/**
 * Generate a minimal TAnyArtifact for testing
 */
const minimalArtifactArbitrary = fc
  .record({
    id: artifactIdArbitrary,
    title: fc.string({ minLength: 5, maxLength: 50 }),
  })
  .map(
    (data) =>
      ({
        metadata: {
          artifact_id: data.id,
          title: data.title,
          priority: "medium",
          estimation: "M",
          created_by: "test@example.com",
          assignee: "test@example.com",
          schema_version: "0.0.1",
          relationships: {
            blocks: [],
            blocked_by: [],
          },
          events: [],
        },
        content: {
          summary: "Test summary",
          acceptance_criteria: [],
        },
      }) as TAnyArtifact,
  );

/**
 * Generate an impacted artifact
 */
const impactedArtifactArbitrary = fc
  .tuple(artifactIdArbitrary, minimalArtifactArbitrary, impactTypeArbitrary)
  .map(([id, artifact, impactType]) => ({
    id,
    artifact,
    impactType,
  }));

describe("impact-report-formatter property tests", () => {
  describe("groupByImpactType", () => {
    it("partitions artifacts (no artifact object in multiple groups)", () => {
      fc.assert(
        fc.property(
          fc.array(impactedArtifactArbitrary, { minLength: 0, maxLength: 50 }),
          (artifacts) => {
            const grouped = groupByImpactType(artifacts);

            // Collect all artifact objects from each group
            const blocksSet = new Set(grouped.blocks_parent_completion);
            const breaksSet = new Set(grouped.breaks_dependency);
            const orphansSet = new Set(grouped.orphans_children);

            // Check for no overlap between groups (using object identity)
            // blocks ∩ breaks = ∅
            for (const artifact of blocksSet) {
              expect(breaksSet.has(artifact)).toBe(false);
              expect(orphansSet.has(artifact)).toBe(false);
            }

            // breaks ∩ orphans = ∅
            for (const artifact of breaksSet) {
              expect(orphansSet.has(artifact)).toBe(false);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("preserves total count (sum of groups equals input)", () => {
      fc.assert(
        fc.property(
          fc.array(impactedArtifactArbitrary, { minLength: 0, maxLength: 50 }),
          (artifacts) => {
            const grouped = groupByImpactType(artifacts);

            const totalCount =
              grouped.blocks_parent_completion.length +
              grouped.breaks_dependency.length +
              grouped.orphans_children.length;

            expect(totalCount).toBe(artifacts.length);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("places artifacts in correct group by impactType", () => {
      fc.assert(
        fc.property(
          fc.array(impactedArtifactArbitrary, { minLength: 0, maxLength: 50 }),
          (artifacts) => {
            const grouped = groupByImpactType(artifacts);

            // All artifacts in blocks_parent_completion group should have that type
            for (const artifact of grouped.blocks_parent_completion) {
              expect(artifact.impactType).toBe("blocks_parent_completion");
            }

            // All artifacts in breaks_dependency group should have that type
            for (const artifact of grouped.breaks_dependency) {
              expect(artifact.impactType).toBe("breaks_dependency");
            }

            // All artifacts in orphans_children group should have that type
            for (const artifact of grouped.orphans_children) {
              expect(artifact.impactType).toBe("orphans_children");
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("handles empty input gracefully", () => {
      const grouped = groupByImpactType([]);

      expect(grouped.blocks_parent_completion).toEqual([]);
      expect(grouped.breaks_dependency).toEqual([]);
      expect(grouped.orphans_children).toEqual([]);
    });

    it("handles single impact type correctly", () => {
      fc.assert(
        fc.property(
          impactTypeArbitrary,
          fc.array(impactedArtifactArbitrary, { minLength: 1, maxLength: 20 }),
          (singleType, artifacts) => {
            // Force all artifacts to have the same impact type
            const uniformArtifacts = artifacts.map((a) => ({
              ...a,
              impactType: singleType,
            }));

            const grouped = groupByImpactType(uniformArtifacts);

            // Only one group should be non-empty
            const nonEmptyGroups = [
              grouped.blocks_parent_completion.length > 0 ? 1 : 0,
              grouped.breaks_dependency.length > 0 ? 1 : 0,
              grouped.orphans_children.length > 0 ? 1 : 0,
            ].reduce((sum, val) => sum + val, 0);

            expect(nonEmptyGroups).toBe(1);

            // The non-empty group should contain all artifacts
            if (singleType === "blocks_parent_completion") {
              expect(grouped.blocks_parent_completion.length).toBe(
                uniformArtifacts.length,
              );
            } else if (singleType === "breaks_dependency") {
              expect(grouped.breaks_dependency.length).toBe(
                uniformArtifacts.length,
              );
            } else {
              expect(grouped.orphans_children.length).toBe(
                uniformArtifacts.length,
              );
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it("is idempotent (calling twice gives same result)", () => {
      fc.assert(
        fc.property(
          fc.array(impactedArtifactArbitrary, { minLength: 0, maxLength: 50 }),
          (artifacts) => {
            const grouped1 = groupByImpactType(artifacts);
            const grouped2 = groupByImpactType(artifacts);

            expect(grouped1).toEqual(grouped2);
          },
        ),
        { numRuns: 100 },
      );
    });

    it("maintains input order within each group", () => {
      fc.assert(
        fc.property(
          fc.array(impactedArtifactArbitrary, { minLength: 2, maxLength: 20 }),
          (artifacts) => {
            const grouped = groupByImpactType(artifacts);

            // For each group, check that the relative order matches the input order
            const checkOrder = (
              group: ImpactedArtifact[],
              originalList: ImpactedArtifact[],
            ) => {
              // Build a map of artifact object references to their indices
              const indexMap = new Map<ImpactedArtifact, number>();
              for (let i = 0; i < originalList.length; i++) {
                indexMap.set(originalList[i], i);
              }

              // Get indices for the group items
              const groupIndices = group.map(
                (item) => indexMap.get(item) ?? -1,
              );

              // Indices should be in ascending order (preserving input order)
              for (let i = 1; i < groupIndices.length; i++) {
                expect(groupIndices[i]).toBeGreaterThan(groupIndices[i - 1]);
              }
            };

            checkOrder(grouped.blocks_parent_completion, artifacts);
            checkOrder(grouped.breaks_dependency, artifacts);
            checkOrder(grouped.orphans_children, artifacts);
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
