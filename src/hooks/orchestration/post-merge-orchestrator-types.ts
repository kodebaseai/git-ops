/**
 * Types for post-merge cascade orchestration
 */

import type { CascadeResult } from "@kodebase/artifacts";
import type { MergeMetadata } from "../detection/post-merge-types.js";

/**
 * Configuration for post-merge orchestrator
 */
export interface PostMergeOrchestratorConfig {
  /** Git root directory */
  gitRoot?: string;
  /** Base directory for artifact resolution */
  baseDir?: string;
}

/**
 * Result of orchestrating all post-merge cascades
 */
export interface OrchestrationResult {
  /** Merge metadata from detection */
  mergeMetadata: MergeMetadata;
  /** Result of completion cascade */
  completionCascade: CascadeResult;
  /** Result of readiness cascade */
  readinessCascade: CascadeResult;
  /** Summary message describing all changes */
  summary: string;
  /** Total number of artifacts updated */
  totalArtifactsUpdated: number;
  /** Total number of events added */
  totalEventsAdded: number;
}

/**
 * Options for executing post-merge orchestration
 */
export interface ExecuteOrchestrationOptions {
  /** Merge metadata from PostMergeDetector */
  mergeMetadata: MergeMetadata;
  /** Actor for cascade events (defaults to 'System Cascade (cascade@post-merge)') */
  actor?: string;
}
