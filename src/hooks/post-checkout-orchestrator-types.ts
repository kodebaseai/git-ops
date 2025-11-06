/**
 * Types for post-checkout orchestration
 */

import type { ArtifactService } from "@kodebase/artifacts";

/**
 * Interface for draft PR creation
 * Simplified interface for testing - actual DraftPRService has different signature
 */
export interface DraftPRCreator {
  /**
   * Create a draft PR for the given branch and artifacts
   */
  createDraftPR(options: {
    branchName: string;
    artifactIds: string[];
  }): Promise<{ url: string }>;
}

/**
 * Configuration for post-checkout orchestration
 */
export interface PostCheckoutOrchestratorConfig {
  /**
   * Base directory (git root)
   * @default process.cwd()
   */
  baseDir?: string;

  /**
   * Whether to enable draft PR creation
   * @default true
   */
  enableDraftPR?: boolean;

  /**
   * Whether to enable progress cascade execution
   * @default true
   */
  enableCascade?: boolean;

  /**
   * Optional draft PR service for dependency injection
   * Required if enableDraftPR is true
   */
  draftPRService?: DraftPRCreator;

  /**
   * Optional artifact service for dependency injection
   * If not provided, CascadeService will create its own instance
   */
  artifactService?: ArtifactService;
}

/**
 * Result of post-checkout orchestration
 */
export interface PostCheckoutOrchestratorResult {
  /**
   * Whether the orchestration succeeded
   */
  success: boolean;

  /**
   * Reason for failure (if not successful)
   */
  reason?: string;

  /**
   * Branch name that was checked out
   */
  branchName?: string;

  /**
   * Artifact IDs extracted from branch name
   */
  artifactIds?: string[];

  /**
   * Whether this was a new branch creation
   */
  isNewBranch?: boolean;

  /**
   * Artifact IDs that were successfully transitioned to in_progress
   */
  artifactsTransitioned?: string[];

  /**
   * Parent artifact IDs that were cascaded to in_progress
   */
  parentsCascaded?: string[];

  /**
   * URL of created draft PR (if created)
   */
  prUrl?: string;

  /**
   * Errors encountered during orchestration
   * Hook can still succeed with errors in non-critical operations
   */
  errors: string[];

  /**
   * Warnings encountered during orchestration
   */
  warnings: string[];
}
