/**
 * Types for post-checkout hook detection and metadata extraction
 */

/**
 * Configuration for post-checkout detection
 */
export interface PostCheckoutConfig {
  /**
   * Git repository root directory
   * @default process.cwd()
   */
  gitRoot?: string;
}

/**
 * Metadata extracted from checkout operation
 */
export interface CheckoutMetadata {
  /**
   * Previous HEAD commit SHA
   */
  previousHead: string;

  /**
   * New HEAD commit SHA
   */
  newHead: string;

  /**
   * Current branch name after checkout
   */
  branchName: string;

  /**
   * Whether this is a new branch creation (vs existing branch checkout)
   */
  isNewBranch: boolean;

  /**
   * Artifact IDs extracted and validated from branch name
   */
  artifactIds: string[];

  /**
   * Artifact IDs that were found in branch name but don't exist in artifacts directory
   * Only populated when validation is enabled
   */
  invalidArtifactIds?: string[];
}

/**
 * Result of checkout detection
 */
export interface CheckoutDetectionResult {
  /**
   * Whether the hook should execute
   */
  shouldExecute: boolean;

  /**
   * Reason for execution or non-execution
   */
  reason: string;

  /**
   * Checkout metadata if available
   */
  metadata?: CheckoutMetadata;
}
