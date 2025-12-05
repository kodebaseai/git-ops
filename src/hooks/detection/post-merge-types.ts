/**
 * Types for post-merge hook trigger detection and metadata extraction
 */

/**
 * Merge metadata extracted from git and GitHub/GitLab
 */
export interface MergeMetadata {
  /** Target branch that was merged into */
  targetBranch: string;
  /** Source branch that was merged from */
  sourceBranch: string | null;
  /** Commit SHA of the merge */
  commitSha: string;
  /** Pull/Merge request number (if available) */
  prNumber: number | null;
  /** PR URL (if available) */
  prUrl: string | null;
  /** PR title (if available) */
  prTitle: string | null;
  /** PR body/description (if available) */
  prBody: string | null;
  /** Whether this merge came from a PR */
  isPRMerge: boolean;
  /** Artifact IDs identified from branch name or PR metadata */
  artifactIds: string[];
}

/**
 * Configuration for post-merge trigger detection
 */
export interface PostMergeConfig {
  /** Git root directory */
  gitRoot?: string;
  /** Target branch to trigger on (default: 'main') */
  targetBranch?: string;
  /** Whether to require PR for execution (default: true) */
  requirePR?: boolean;
  /** GitHub token for API calls (falls back to gh CLI if not provided) */
  githubToken?: string;
}

/**
 * Result of merge detection
 */
export interface MergeDetectionResult {
  /** Whether this merge should trigger hook execution */
  shouldExecute: boolean;
  /** Reason for the decision */
  reason: string;
  /** Merge metadata (if shouldExecute is true) */
  metadata?: MergeMetadata;
}
