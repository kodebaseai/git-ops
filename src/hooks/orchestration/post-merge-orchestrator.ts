/**
 * Post-merge cascade orchestration
 *
 * Orchestrates completion and readiness cascades after PR merge.
 * Thin coordinator that delegates to CascadeService for all cascade logic.
 */

import { CascadeService } from "@kodebase/artifacts";
import type {
  ExecuteOrchestrationOptions,
  OrchestrationResult,
  PostMergeOrchestratorConfig,
} from "./post-merge-orchestrator-types.js";

/**
 * Default configuration for post-merge orchestrator
 */
const DEFAULT_CONFIG: Required<PostMergeOrchestratorConfig> = {
  gitRoot: process.cwd(),
  baseDir: process.cwd(),
};

/**
 * Post-merge cascade orchestrator
 *
 * Coordinates the execution of completion and readiness cascades after a PR merge.
 * Acts as a thin orchestration layer over CascadeService from @kodebase/artifacts.
 *
 * **Responsibilities:**
 * - Execute completion cascade first (merged artifact → parent in_review)
 * - Execute readiness cascade second (blocked dependents → ready)
 * - Collect cascade results and generate summary
 * - Handle errors gracefully (log but don't fail hook)
 *
 * **Order Matters:**
 * Completion cascade must run before readiness cascade because readiness
 * cascade needs to see the latest state after parent transitions.
 *
 * @example Basic usage
 * ```typescript
 * const orchestrator = new PostMergeOrchestrator();
 * const detector = new PostMergeDetector();
 *
 * // After PR merge
 * const detection = await detector.detectMerge(0);
 * if (detection.shouldExecute && detection.metadata) {
 *   const result = await orchestrator.execute({
 *     mergeMetadata: detection.metadata,
 *   });
 *   console.log(result.summary);
 * }
 * ```
 */
export class PostMergeOrchestrator {
  private config: Required<PostMergeOrchestratorConfig>;
  private cascadeService: CascadeService;

  constructor(
    config: PostMergeOrchestratorConfig = {},
    cascadeService?: CascadeService,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.cascadeService = cascadeService ?? new CascadeService();
  }

  /**
   * Execute post-merge cascade orchestration
   *
   * Runs completion and readiness cascades in sequence for all affected artifacts.
   *
   * @param options - Orchestration options with merge metadata
   * @returns Orchestration result with all cascade results and summary
   *
   * @example
   * ```typescript
   * const result = await orchestrator.execute({
   *   mergeMetadata: {
   *     artifactIds: ['A.1.5', 'B.2.3'],
   *     // ... other metadata
   *   },
   * });
   *
   * console.log(`Updated ${result.totalArtifactsUpdated} artifacts`);
   * console.log(`Added ${result.totalEventsAdded} events`);
   * ```
   */
  async execute(
    options: ExecuteOrchestrationOptions,
  ): Promise<OrchestrationResult> {
    const { mergeMetadata, actor } = options;
    const cascadeActor = actor ?? "System Cascade (cascade@post-merge)";

    // Initialize result
    const result: OrchestrationResult = {
      mergeMetadata,
      completionCascade: { updatedArtifacts: [], events: [] },
      readinessCascade: { updatedArtifacts: [], events: [] },
      summary: "",
      totalArtifactsUpdated: 0,
      totalEventsAdded: 0,
    };

    // No artifacts to process
    if (mergeMetadata.artifactIds.length === 0) {
      result.summary = "No artifact IDs found in merge";
      return result;
    }

    try {
      // Execute cascades for each artifact
      for (const artifactId of mergeMetadata.artifactIds) {
        // 1. Completion Cascade (upward to parent)
        try {
          const completionResult =
            await this.cascadeService.executeCompletionCascade({
              artifactId,
              trigger: "pr_merged",
              actor: cascadeActor,
              baseDir: this.config.baseDir,
            });

          // Merge results
          result.completionCascade.updatedArtifacts.push(
            ...completionResult.updatedArtifacts,
          );
          result.completionCascade.events.push(...completionResult.events);
        } catch (error) {
          // Log error but continue with other artifacts
          console.error(
            `Completion cascade failed for ${artifactId}:`,
            error instanceof Error ? error.message : String(error),
          );
        }

        // 2. Readiness Cascade (lateral to dependents)
        try {
          const readinessResult =
            await this.cascadeService.executeReadinessCascade({
              completedArtifactId: artifactId,
              trigger: "dependencies_met",
              actor: cascadeActor,
              baseDir: this.config.baseDir,
            });

          // Merge results
          result.readinessCascade.updatedArtifacts.push(
            ...readinessResult.updatedArtifacts,
          );
          result.readinessCascade.events.push(...readinessResult.events);
        } catch (error) {
          // Log error but continue with other artifacts
          console.error(
            `Readiness cascade failed for ${artifactId}:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      // Calculate totals (count unique artifacts from events)
      const uniqueArtifacts = new Set<string>([
        ...result.completionCascade.events.map((e) => e.artifactId),
        ...result.readinessCascade.events.map((e) => e.artifactId),
      ]);
      result.totalArtifactsUpdated = uniqueArtifacts.size;
      result.totalEventsAdded =
        result.completionCascade.events.length +
        result.readinessCascade.events.length;

      // Generate summary
      result.summary = this.generateSummary(result);

      return result;
    } catch (error) {
      // Fatal error - return partial results
      result.summary = `Cascade orchestration failed: ${error instanceof Error ? error.message : String(error)}`;
      return result;
    }
  }

  /**
   * Generate human-readable summary of cascade results
   */
  private generateSummary(result: OrchestrationResult): string {
    const lines: string[] = [];

    // Header
    lines.push(
      `Post-merge cascades for artifacts: ${result.mergeMetadata.artifactIds.join(", ")}`,
    );

    // Completion cascade results
    if (result.completionCascade.events.length > 0) {
      lines.push(
        `\nCompletion cascade: ${result.completionCascade.events.length} event(s)`,
      );
      for (const event of result.completionCascade.events) {
        lines.push(`  - ${event.artifactId} → ${event.event}`);
      }
    } else {
      lines.push("\nCompletion cascade: no changes");
    }

    // Readiness cascade results
    if (result.readinessCascade.events.length > 0) {
      lines.push(
        `\nReadiness cascade: ${result.readinessCascade.events.length} event(s)`,
      );
      for (const event of result.readinessCascade.events) {
        lines.push(`  - ${event.artifactId} → ${event.event}`);
      }
    } else {
      lines.push("\nReadiness cascade: no changes");
    }

    // Summary
    lines.push(
      `\nTotal: ${result.totalArtifactsUpdated} artifact(s) updated, ${result.totalEventsAdded} event(s) added`,
    );

    return lines.join("\n");
  }
}

/**
 * Factory function to create post-merge orchestrator
 */
export function createPostMergeOrchestrator(
  config?: PostMergeOrchestratorConfig,
  cascadeService?: CascadeService,
): PostMergeOrchestrator {
  return new PostMergeOrchestrator(config, cascadeService);
}
