/**
 * Types for draft PR creation service
 */

/**
 * Configuration for draft PR creation
 */
export interface DraftPRConfig {
  /**
   * Whether draft PR creation is enabled
   * @default false
   */
  enabled?: boolean;

  /**
   * Git repository root directory
   * @default process.cwd()
   */
  gitRoot?: string;

  /**
   * Artifacts directory path (relative to gitRoot)
   * @default ".kodebase/artifacts"
   */
  artifactsDir?: string;
}

/**
 * Result of draft PR creation attempt
 */
export interface DraftPRResult {
  /**
   * Whether PR was created successfully
   */
  created: boolean;

  /**
   * PR number if created or already exists
   */
  prNumber?: number;

  /**
   * PR URL if created or already exists
   */
  prUrl?: string;

  /**
   * Reason for creation status
   */
  reason: string;

  /**
   * Error if creation failed
   */
  error?: Error;
}
