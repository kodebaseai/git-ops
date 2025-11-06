/**
 * Impact Analysis Engine for artifact operations
 *
 * Analyzes the impact of operations (cancel, delete, remove_dependency) on
 * artifacts by traversing the artifact dependency graph and identifying
 * affected artifacts.
 *
 * @module impact-analyzer
 */

import {
  type ArtifactWithId,
  DependencyGraphService,
  QueryService,
} from "@kodebase/artifacts";
import type { TAnyArtifact } from "@kodebase/core";

/**
 * Types of operations that can be analyzed
 */
export type ImpactOperation = "cancel" | "delete" | "remove_dependency";

/**
 * Types of impact that an operation can have on related artifacts
 */
export type ImpactType =
  | "blocks_parent_completion" // Parent/blocked artifacts can't be completed
  | "breaks_dependency" // Artifacts that depend on this one will be broken
  | "orphans_children"; // Child artifacts will be orphaned

/**
 * Information about an impacted artifact
 */
export interface ImpactedArtifact {
  /**
   * The artifact ID
   */
  id: string;

  /**
   * The artifact metadata
   */
  artifact: TAnyArtifact;

  /**
   * The type of impact on this artifact
   */
  impactType: ImpactType;

  /**
   * Human-readable description of the impact
   */
  reason: string;
}

/**
 * Result of impact analysis
 */
export interface ImpactReport {
  /**
   * The artifact ID that was analyzed
   */
  artifactId: string;

  /**
   * The operation that was analyzed
   */
  operation: ImpactOperation;

  /**
   * List of artifacts that would be impacted
   */
  impactedArtifacts: ImpactedArtifact[];

  /**
   * Whether the operation would have any impact
   */
  hasImpact: boolean;

  /**
   * Analysis timestamp
   */
  analyzedAt: string;
}

/**
 * Parent artifact affected by cancellation
 */
export interface ParentCompletionImpact {
  /**
   * The parent artifact ID
   */
  id: string;

  /**
   * The parent artifact
   */
  artifact: TAnyArtifact;

  /**
   * Number of remaining incomplete children (after this cancellation)
   */
  remainingIncomplete: number;

  /**
   * Whether parent can now be completed (all children done/cancelled)
   */
  canComplete: boolean;

  /**
   * Human-readable message
   */
  message: string;
}

/**
 * Dependent artifact that will be unblocked
 */
export interface DependentUnblocked {
  /**
   * The dependent artifact ID
   */
  id: string;

  /**
   * The dependent artifact
   */
  artifact: TAnyArtifact;

  /**
   * Number of remaining blockers after this cancellation
   */
  remainingBlockers: number;

  /**
   * Whether artifact will be fully unblocked
   */
  fullyUnblocked: boolean;

  /**
   * Human-readable message
   */
  message: string;
}

/**
 * Result of cancellation impact analysis
 */
export interface CancellationImpactReport {
  /**
   * The artifact ID being cancelled
   */
  artifactId: string;

  /**
   * Parent artifacts affected by this cancellation
   */
  parentCompletionAffected: ParentCompletionImpact[];

  /**
   * Artifacts that will be unblocked
   */
  dependentsUnblocked: DependentUnblocked[];

  /**
   * Child artifacts (will remain in current state)
   */
  children: ArtifactWithId[];

  /**
   * Whether there is any impact
   */
  hasImpact: boolean;

  /**
   * Overall impact summary message
   */
  summary: string;

  /**
   * Analysis timestamp
   */
  analyzedAt: string;
}

/**
 * Impact Analysis Engine
 *
 * Analyzes the impact of operations on artifacts by traversing the
 * dependency graph and identifying affected relationships.
 *
 * @example
 * ```typescript
 * const analyzer = new ImpactAnalyzer({ baseDir: '/path/to/repo' });
 *
 * // Analyze impact of deleting an artifact
 * const report = await analyzer.analyze('C.1.2', 'delete');
 *
 * if (report.hasImpact) {
 *   console.log(`Deleting ${report.artifactId} would impact:`);
 *   for (const impacted of report.impactedArtifacts) {
 *     console.log(`- ${impacted.id}: ${impacted.reason}`);
 *   }
 * }
 * ```
 */
export class ImpactAnalyzer {
  private readonly depService: DependencyGraphService;
  private readonly queryService: QueryService;

  /**
   * Creates a new ImpactAnalyzer instance
   *
   * @param options - Configuration options
   * @param options.baseDir - Base directory of the project (defaults to process.cwd())
   */
  constructor(options: { baseDir?: string } = {}) {
    const baseDir = options.baseDir ?? process.cwd();
    this.depService = new DependencyGraphService(baseDir);
    this.queryService = new QueryService(baseDir);
  }

  /**
   * Analyzes the impact of an operation on an artifact
   *
   * @param artifactId - The artifact ID to analyze
   * @param operation - The operation to perform
   * @returns Impact analysis report
   *
   * @throws {Error} If artifact doesn't exist or circular dependency detected
   *
   * @example
   * ```typescript
   * // Analyze canceling an artifact
   * const report = await analyzer.analyze('C.1.2', 'cancel');
   *
   * // Analyze deleting an artifact
   * const report = await analyzer.analyze('A.1.1', 'delete');
   *
   * // Analyze removing a dependency
   * const report = await analyzer.analyze('C.1.3', 'remove_dependency');
   * ```
   */
  async analyze(
    artifactId: string,
    operation: ImpactOperation,
  ): Promise<ImpactReport> {
    const impactedArtifacts: ImpactedArtifact[] = [];

    switch (operation) {
      case "cancel":
        impactedArtifacts.push(...(await this.analyzeCancelImpact(artifactId)));
        break;
      case "delete":
        impactedArtifacts.push(...(await this.analyzeDeleteImpact(artifactId)));
        break;
      case "remove_dependency":
        impactedArtifacts.push(
          ...(await this.analyzeRemoveDependencyImpact(artifactId)),
        );
        break;
    }

    return {
      artifactId,
      operation,
      impactedArtifacts,
      hasImpact: impactedArtifacts.length > 0,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Analyzes impact of canceling an artifact
   *
   * Canceling an artifact affects:
   * 1. Artifacts that block this one (may prevent parent completion)
   * 2. Artifacts blocked by this one (breaks their dependencies)
   * 3. Child artifacts in the hierarchy (orphans them)
   *
   * @param artifactId - The artifact ID
   * @returns List of impacted artifacts
   */
  private async analyzeCancelImpact(
    artifactId: string,
  ): Promise<ImpactedArtifact[]> {
    const impacted: ImpactedArtifact[] = [];
    const visited = new Set<string>();

    // Find artifacts that this one blocks (parents/blockers)
    const blockedArtifacts =
      await this.depService.getBlockedArtifacts(artifactId);

    for (const blocked of blockedArtifacts) {
      if (!visited.has(blocked.id)) {
        visited.add(blocked.id);
        impacted.push({
          id: blocked.id,
          artifact: blocked.artifact,
          impactType: "breaks_dependency",
          reason: `Depends on ${artifactId} which is being canceled`,
        });
      }
    }

    // Find artifacts that block this one (dependencies)
    const dependencies = await this.depService.getDependencies(artifactId);

    for (const dep of dependencies) {
      if (!visited.has(dep.id)) {
        visited.add(dep.id);
        impacted.push({
          id: dep.id,
          artifact: dep.artifact,
          impactType: "blocks_parent_completion",
          reason: `${artifactId} (blocked artifact) is being canceled`,
        });
      }
    }

    // Find child artifacts in hierarchy
    const children = await this.findChildrenInHierarchy(artifactId);

    for (const child of children) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        impacted.push({
          id: child.id,
          artifact: child.artifact,
          impactType: "orphans_children",
          reason: `Parent ${artifactId} is being canceled`,
        });
      }
    }

    return impacted;
  }

  /**
   * Analyzes impact of deleting an artifact
   *
   * Deleting an artifact affects:
   * 1. Artifacts blocked by this one (breaks their dependencies)
   * 2. Child artifacts in the hierarchy (orphans them)
   *
   * @param artifactId - The artifact ID
   * @returns List of impacted artifacts
   */
  private async analyzeDeleteImpact(
    artifactId: string,
  ): Promise<ImpactedArtifact[]> {
    const impacted: ImpactedArtifact[] = [];
    const visited = new Set<string>();

    // Find artifacts that this one blocks (parents/blockers)
    const blockedArtifacts =
      await this.depService.getBlockedArtifacts(artifactId);

    for (const blocked of blockedArtifacts) {
      if (!visited.has(blocked.id)) {
        visited.add(blocked.id);
        impacted.push({
          id: blocked.id,
          artifact: blocked.artifact,
          impactType: "breaks_dependency",
          reason: `Depends on ${artifactId} which is being deleted`,
        });
      }
    }

    // Find child artifacts in hierarchy
    const children = await this.findChildrenInHierarchy(artifactId);

    for (const child of children) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        impacted.push({
          id: child.id,
          artifact: child.artifact,
          impactType: "orphans_children",
          reason: `Parent ${artifactId} is being deleted`,
        });
      }
    }

    return impacted;
  }

  /**
   * Analyzes impact of removing a dependency
   *
   * Removing a dependency affects:
   * 1. The artifact itself (may change its readiness state)
   * 2. Artifacts that were unblocked by completion of the removed dependency
   *
   * @param artifactId - The artifact ID
   * @returns List of impacted artifacts
   */
  private async analyzeRemoveDependencyImpact(
    artifactId: string,
  ): Promise<ImpactedArtifact[]> {
    const impacted: ImpactedArtifact[] = [];
    const visited = new Set<string>();

    // The artifact itself is impacted
    const artifacts = await this.queryService.findArtifacts({});
    const targetArtifact = artifacts.find((a) => a.id === artifactId);

    if (targetArtifact) {
      visited.add(artifactId);
      impacted.push({
        id: artifactId,
        artifact: targetArtifact.artifact,
        impactType: "breaks_dependency",
        reason: "Removing dependency may affect artifact readiness state",
      });
    }

    // Find artifacts that depend on this one's dependencies
    const dependencies = await this.depService.getDependencies(artifactId);

    for (const dep of dependencies) {
      const blockedByDep = await this.depService.getBlockedArtifacts(dep.id);

      for (const blocked of blockedByDep) {
        if (!visited.has(blocked.id) && blocked.id !== artifactId) {
          visited.add(blocked.id);
          impacted.push({
            id: blocked.id,
            artifact: blocked.artifact,
            impactType: "breaks_dependency",
            reason: `Shares dependency ${dep.id} with ${artifactId}`,
          });
        }
      }
    }

    return impacted;
  }

  /**
   * Finds child artifacts in the hierarchical relationship
   *
   * Uses artifact ID patterns to determine parent-child relationships:
   * - Initiative (A): parent of milestones (A.1, A.2)
   * - Milestone (A.1): parent of issues (A.1.1, A.1.2)
   *
   * @param artifactId - The parent artifact ID
   * @returns List of child artifacts
   */
  private async findChildrenInHierarchy(
    artifactId: string,
  ): Promise<ArtifactWithId[]> {
    const allArtifacts = await this.queryService.findArtifacts({});
    const children: ArtifactWithId[] = [];

    // Pattern: if parent is "A" or "A.1", children start with "A." or "A.1."
    const childPattern = new RegExp(`^${artifactId}\\.\\d+`);

    for (const artifact of allArtifacts) {
      if (childPattern.test(artifact.id)) {
        // Only direct children (not grandchildren)
        const parts = artifact.id.replace(`${artifactId}.`, "").split(".");
        if (parts.length === 1) {
          children.push(artifact);
        }
      }
    }

    return children;
  }

  /**
   * Analyzes the impact of cancelling an artifact
   *
   * Cancellation has special semantics:
   * - Cancelled artifacts count as "done" for parent completion checks
   * - Artifacts blocked by this one become unblocked
   * - Child artifacts remain in their current state
   *
   * @param artifactId - The artifact ID to analyze
   * @returns Cancellation impact report with detailed analysis
   *
   * @throws {Error} If artifact doesn't exist
   *
   * @example
   * ```typescript
   * const analyzer = new ImpactAnalyzer({ baseDir: '/path/to/repo' });
   * const report = await analyzer.analyzeCancellation('C.1.2');
   *
   * console.log(report.summary);
   * // "Cancelling C.1.2 will unblock 3 dependent artifacts"
   *
   * if (report.parentCompletionAffected.length > 0) {
   *   console.log('Parent milestones affected:');
   *   for (const parent of report.parentCompletionAffected) {
   *     console.log(`- ${parent.id}: ${parent.message}`);
   *   }
   * }
   * ```
   */
  async analyzeCancellation(
    artifactId: string,
  ): Promise<CancellationImpactReport> {
    // Verify artifact exists
    const allArtifacts = await this.queryService.findArtifacts({});
    const targetArtifact = allArtifacts.find((a) => a.id === artifactId);

    if (!targetArtifact) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    const parentCompletionAffected: ParentCompletionImpact[] = [];
    const dependentsUnblocked: DependentUnblocked[] = [];

    // 1. Analyze parent completion impact
    // Find parent artifact by ID pattern (e.g., C.1.2 -> C.1)
    const parentId = this.getParentId(artifactId);
    if (parentId) {
      const parentArtifact = allArtifacts.find((a) => a.id === parentId);
      if (parentArtifact) {
        const siblings = await this.findChildrenInHierarchy(parentId);

        // Count incomplete siblings (excluding the one being cancelled)
        let remainingIncomplete = 0;
        for (const sibling of siblings) {
          if (sibling.id === artifactId) continue; // Skip the one being cancelled

          const hasCompleted = sibling.artifact.metadata.events.some(
            (e) => e.event === "completed",
          );
          const hasCancelled = sibling.artifact.metadata.events.some(
            (e) => e.event === "cancelled",
          );

          if (!hasCompleted && !hasCancelled) {
            remainingIncomplete++;
          }
        }

        const canComplete = remainingIncomplete === 0;
        const message = canComplete
          ? `Parent ${parentId} can now be completed (all children done/cancelled)`
          : `Parent ${parentId} still has ${remainingIncomplete} incomplete child${remainingIncomplete > 1 ? "ren" : ""}`;

        parentCompletionAffected.push({
          id: parentId,
          artifact: parentArtifact.artifact,
          remainingIncomplete,
          canComplete,
          message,
        });
      }
    }

    // 2. Find dependents that will be unblocked
    const blockedArtifacts =
      await this.depService.getBlockedArtifacts(artifactId);

    for (const blocked of blockedArtifacts) {
      const blockers =
        blocked.artifact.metadata.relationships?.blocked_by ?? [];

      // Count remaining blockers after this cancellation
      const remainingBlockers = blockers.filter((b) => b !== artifactId).length;
      const fullyUnblocked = remainingBlockers === 0;

      const message = fullyUnblocked
        ? "Will be fully unblocked (no remaining blockers)"
        : `Will have ${remainingBlockers} remaining blocker${remainingBlockers > 1 ? "s" : ""}`;

      dependentsUnblocked.push({
        id: blocked.id,
        artifact: blocked.artifact,
        remainingBlockers,
        fullyUnblocked,
        message,
      });
    }

    // 3. Find children (they remain in current state)
    const children = await this.findChildrenInHierarchy(artifactId);

    // 4. Generate summary message
    const summary = this.generateCancellationSummary(
      artifactId,
      parentCompletionAffected,
      dependentsUnblocked,
      children,
    );

    const hasImpact =
      parentCompletionAffected.length > 0 ||
      dependentsUnblocked.length > 0 ||
      children.length > 0;

    return {
      artifactId,
      parentCompletionAffected,
      dependentsUnblocked,
      children,
      hasImpact,
      summary,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Gets the parent artifact ID from a child ID
   *
   * @param artifactId - The child artifact ID (e.g., "C.1.2")
   * @returns The parent artifact ID (e.g., "C.1") or null if no parent
   */
  private getParentId(artifactId: string): string | null {
    const parts = artifactId.split(".");
    if (parts.length <= 1) {
      return null; // Top-level artifact (no parent)
    }

    return parts.slice(0, -1).join(".");
  }

  /**
   * Generates a human-readable summary of cancellation impact
   *
   * @param artifactId - The artifact being cancelled
   * @param parents - Affected parent artifacts
   * @param dependents - Unblocked dependent artifacts
   * @param children - Child artifacts
   * @returns Summary message
   */
  private generateCancellationSummary(
    artifactId: string,
    parents: ParentCompletionImpact[],
    dependents: DependentUnblocked[],
    children: ArtifactWithId[],
  ): string {
    const parts: string[] = [];

    if (dependents.length > 0) {
      const count = dependents.length;
      parts.push(
        `will unblock ${count} dependent artifact${count > 1 ? "s" : ""}`,
      );
    }

    if (parents.length > 0) {
      const completableParents = parents.filter((p) => p.canComplete);
      if (completableParents.length > 0) {
        const count = completableParents.length;
        parts.push(
          `will allow ${count} parent${count > 1 ? "s" : ""} to be completed`,
        );
      }
    }

    if (children.length > 0) {
      const count = children.length;
      parts.push(
        `has ${count} child${count > 1 ? "ren" : ""} (will remain in current state)`,
      );
    }

    if (parts.length === 0) {
      return `Cancelling ${artifactId} has no impact on other artifacts`;
    }

    return `Cancelling ${artifactId} ${parts.join(", ")}`;
  }

  /**
   * Clears internal caches
   *
   * Useful for testing or forcing fresh data load
   */
  clearCache(): void {
    this.depService.clearCache();
  }
}
