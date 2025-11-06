/**
 * Post-checkout hook trigger detection and metadata extraction
 *
 * Detects new branch creation (vs existing branch checkout) and extracts:
 * - Branch name
 * - Previous/new commit SHAs
 * - Artifact IDs from branch name
 *
 * Git post-checkout hook parameters:
 * - previous_head: SHA of previous HEAD
 * - new_head: SHA of new HEAD
 * - branch_flag: 1 = branch checkout, 0 = file checkout
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  CheckoutDetectionResult,
  CheckoutMetadata,
  PostCheckoutConfig,
} from "./post-checkout-types.js";

const execAsync = promisify(exec);

/**
 * Regular expression to match artifact IDs in branch names
 * Matches patterns like: A.1.5, B.2.3, C.4.1.2
 */
const ARTIFACT_ID_REGEX = /\b[A-Z]\.\d+(?:\.\d+)*\b/g;

/**
 * Default configuration for post-checkout detection
 */
const DEFAULT_CONFIG: Required<PostCheckoutConfig> = {
  gitRoot: process.cwd(),
};

/**
 * Post-checkout hook trigger detector
 *
 * Detects new branch creation and extracts checkout metadata including:
 * - Branch name
 * - Previous/new commit SHAs
 * - Affected artifact IDs from branch name
 *
 * @example
 * ```typescript
 * const detector = new PostCheckoutDetector({ gitRoot: '/path/to/repo' });
 *
 * // Git calls post-checkout with: previous_head new_head branch_flag
 * const result = await detector.detectCheckout('abc123', 'def456', 1);
 *
 * if (result.shouldExecute && result.metadata) {
 *   console.log(`New branch: ${result.metadata.branchName}`);
 *   console.log(`Artifacts: ${result.metadata.artifactIds.join(', ')}`);
 * }
 * ```
 */
export class PostCheckoutDetector {
  private config: Required<PostCheckoutConfig>;

  constructor(config: PostCheckoutConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect if post-checkout hook should execute
   *
   * @param previousHead - SHA of previous HEAD
   * @param newHead - SHA of new HEAD
   * @param branchFlag - 1 for branch checkout, 0 for file checkout
   * @returns Detection result with metadata if should execute
   *
   * @example
   * ```typescript
   * // New branch creation (C.1.2)
   * const result = await detector.detectCheckout('abc123', 'abc123', 1);
   * // result.shouldExecute = true, result.metadata.artifactIds = ['C.1.2']
   *
   * // File checkout (ignored)
   * const result = await detector.detectCheckout('abc123', 'def456', 0);
   * // result.shouldExecute = false, reason = "File checkout (not branch)"
   * ```
   */
  async detectCheckout(
    previousHead: string,
    newHead: string,
    branchFlag: number,
  ): Promise<CheckoutDetectionResult> {
    try {
      // Only handle branch checkouts (not file checkouts)
      if (branchFlag !== 1) {
        return {
          shouldExecute: false,
          reason: "File checkout (not branch)",
        };
      }

      // Get current branch name
      const branchName = await this.getCurrentBranch();

      // Detect if this is a new branch creation
      // New branch: previousHead === newHead (both point to same commit)
      // Existing branch: previousHead !== newHead (switched to different branch)
      const isNewBranch = previousHead === newHead;

      // Extract artifact IDs from branch name
      const artifactIds = this.extractArtifactIds(branchName);

      // If no artifacts identified, don't execute
      if (artifactIds.length === 0) {
        return {
          shouldExecute: false,
          reason: "No artifact IDs found in branch name",
          metadata: {
            previousHead,
            newHead,
            branchName,
            isNewBranch,
            artifactIds: [],
          },
        };
      }

      const metadata: CheckoutMetadata = {
        previousHead,
        newHead,
        branchName,
        isNewBranch,
        artifactIds,
      };

      return {
        shouldExecute: true,
        reason: isNewBranch
          ? `New branch created with artifacts: ${artifactIds.join(", ")}`
          : `Checked out existing branch with artifacts: ${artifactIds.join(", ")}`,
        metadata,
      };
    } catch (error) {
      return {
        shouldExecute: false,
        reason: `Error detecting checkout: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get current branch name
   *
   * @returns Current branch name (e.g., "C.1.2", "main")
   */
  private async getCurrentBranch(): Promise<string> {
    const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
      cwd: this.config.gitRoot,
    });
    return stdout.trim();
  }

  /**
   * Extract artifact IDs from branch name
   *
   * @param branchName - Branch name to extract from
   * @returns Array of unique artifact IDs, sorted
   *
   * @example
   * ```typescript
   * extractArtifactIds('C.1.2')        // ['C.1.2']
   * extractArtifactIds('C.1.2-C.1.3')  // ['C.1.2', 'C.1.3']
   * extractArtifactIds('feature-C.4.1.2') // ['C.4.1.2']
   * extractArtifactIds('main')         // []
   * ```
   */
  private extractArtifactIds(branchName: string): string[] {
    const matches = branchName.match(ARTIFACT_ID_REGEX);
    if (!matches) {
      return [];
    }

    // Return unique, sorted artifact IDs
    return Array.from(new Set(matches)).sort();
  }
}
