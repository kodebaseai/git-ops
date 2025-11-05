/**
 * Post-merge hook trigger detection and metadata extraction
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  MergeDetectionResult,
  MergeMetadata,
  PostMergeConfig,
} from "./post-merge-types.js";

const execAsync = promisify(exec);

/**
 * Regular expression to match artifact IDs in branch names or text
 * Matches patterns like: A.1.5, B.2.3, C.4.1.2
 */
const ARTIFACT_ID_REGEX = /\b[A-Z]\.\d+(?:\.\d+)*\b/g;

/**
 * Default configuration for post-merge detection
 */
const DEFAULT_CONFIG: Required<PostMergeConfig> = {
  gitRoot: process.cwd(),
  targetBranch: "main",
  requirePR: true,
  githubToken: "",
};

/**
 * Post-merge hook trigger detector
 *
 * Detects PR merges to main branch and extracts merge metadata including:
 * - PR number and metadata
 * - Source and target branches
 * - Affected artifact IDs
 */
export class PostMergeDetector {
  private config: Required<PostMergeConfig>;

  constructor(config: PostMergeConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect if post-merge hook should execute
   *
   * @param squelchMerge - Git post-merge hook parameter (0 = merge, 1 = squash/rebase)
   * @returns Detection result with metadata if should execute
   */
  async detectMerge(squelchMerge?: number): Promise<MergeDetectionResult> {
    try {
      // Get current branch
      const currentBranch = await this.getCurrentBranch();

      // Check if we're on the target branch
      if (currentBranch !== this.config.targetBranch) {
        return {
          shouldExecute: false,
          reason: `Not on target branch (current: ${currentBranch}, target: ${this.config.targetBranch})`,
        };
      }

      // Get merge metadata
      const metadata = await this.extractMergeMetadata(squelchMerge);

      // If PR is required, verify this was a PR merge
      if (this.config.requirePR && !metadata.isPRMerge) {
        return {
          shouldExecute: false,
          reason: "Direct commit to main (PR required by config)",
          metadata,
        };
      }

      // If no artifacts identified, don't execute
      if (metadata.artifactIds.length === 0) {
        return {
          shouldExecute: false,
          reason: "No artifact IDs found in branch name or PR metadata",
          metadata,
        };
      }

      return {
        shouldExecute: true,
        reason: `PR merge detected with artifacts: ${metadata.artifactIds.join(", ")}`,
        metadata,
      };
    } catch (error) {
      return {
        shouldExecute: false,
        reason: `Error detecting merge: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Extract merge metadata from git history and GitHub API
   */
  private async extractMergeMetadata(
    squelchMerge?: number,
  ): Promise<MergeMetadata> {
    const commitSha = await this.getCommitSha("HEAD");
    const currentBranch = await this.getCurrentBranch();

    // Get source branch from reflog or commit message
    const sourceBranch = await this.getSourceBranch();

    // Try to extract PR number from commit message
    const prNumber = await this.getPRNumber();

    // Get PR metadata if we have a PR number
    let prTitle: string | null = null;
    let prBody: string | null = null;
    if (prNumber !== null) {
      const prMetadata = await this.getPRMetadata(prNumber);
      prTitle = prMetadata.title;
      prBody = prMetadata.body;
    }

    // Determine if this was a PR merge
    const isPRMerge = prNumber !== null || squelchMerge === 0;

    // Extract artifact IDs from branch name and PR metadata
    const artifactIds = this.extractArtifactIds(sourceBranch, prTitle, prBody);

    return {
      targetBranch: currentBranch,
      sourceBranch,
      commitSha,
      prNumber,
      prTitle,
      prBody,
      isPRMerge,
      artifactIds,
    };
  }

  /**
   * Get current git branch name
   */
  private async getCurrentBranch(): Promise<string> {
    const { stdout } = await execAsync("git rev-parse --abbrev-ref HEAD", {
      cwd: this.config.gitRoot,
    });
    return stdout.trim();
  }

  /**
   * Get commit SHA
   */
  private async getCommitSha(ref: string): Promise<string> {
    const { stdout } = await execAsync(`git rev-parse ${ref}`, {
      cwd: this.config.gitRoot,
    });
    return stdout.trim();
  }

  /**
   * Get source branch from reflog or commit message
   * Uses git reflog to find the most recent branch that was merged
   */
  private async getSourceBranch(): Promise<string | null> {
    try {
      // Try to get from reflog first
      const { stdout: reflog } = await execAsync(
        'git reflog -1 --grep-reflog="merge" --format=%gs',
        {
          cwd: this.config.gitRoot,
        },
      );

      // Parse "merge branch_name into target" or "merge branch_name:" format
      const match = reflog.match(/merge\s+(?:origin\/)?([^\s:]+)/i);
      if (match?.[1]) {
        return match[1];
      }

      // Fallback: try to extract from commit message
      const { stdout: message } = await execAsync(
        "git log -1 --pretty=%B HEAD",
        {
          cwd: this.config.gitRoot,
        },
      );

      const messageMatch = message.match(/Merge.*'([^']+)'/i);
      if (messageMatch?.[1]) {
        return messageMatch[1];
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Extract PR number from commit message
   * GitHub adds (#123) to merge commits
   */
  private async getPRNumber(): Promise<number | null> {
    try {
      const { stdout } = await execAsync("git log -1 --pretty=%s HEAD", {
        cwd: this.config.gitRoot,
      });

      const match = stdout.match(/#(\d+)/);
      return match?.[1] ? Number.parseInt(match[1], 10) : null;
    } catch {
      return null;
    }
  }

  /**
   * Get PR metadata from GitHub API or gh CLI
   */
  private async getPRMetadata(
    prNumber: number,
  ): Promise<{ title: string | null; body: string | null }> {
    try {
      // Try gh CLI first (simpler, handles auth automatically)
      const { stdout } = await execAsync(
        `gh pr view ${prNumber} --json title,body`,
        {
          cwd: this.config.gitRoot,
        },
      );

      const data = JSON.parse(stdout) as { title: string; body: string };
      return {
        title: data.title || null,
        body: data.body || null,
      };
    } catch {
      // If gh CLI fails, fall back to empty metadata
      // TODO: Implement GitHub API fallback with token
      return { title: null, body: null };
    }
  }

  /**
   * Extract artifact IDs from branch name and PR metadata
   * Searches for patterns like A.1.5, B.2.3, C.4.1.2
   */
  private extractArtifactIds(
    branchName: string | null,
    prTitle: string | null,
    prBody: string | null,
  ): string[] {
    const artifacts = new Set<string>();

    // Extract from branch name
    if (branchName) {
      const matches = branchName.match(ARTIFACT_ID_REGEX);
      if (matches) {
        for (const match of matches) {
          artifacts.add(match);
        }
      }
    }

    // Extract from PR title
    if (prTitle) {
      const matches = prTitle.match(ARTIFACT_ID_REGEX);
      if (matches) {
        for (const match of matches) {
          artifacts.add(match);
        }
      }
    }

    // Extract from PR body
    if (prBody) {
      const matches = prBody.match(ARTIFACT_ID_REGEX);
      if (matches) {
        for (const match of matches) {
          artifacts.add(match);
        }
      }
    }

    return Array.from(artifacts).sort();
  }
}

/**
 * Factory function to create post-merge detector with config
 */
export function createPostMergeDetector(
  config?: PostMergeConfig,
): PostMergeDetector {
  return new PostMergeDetector(config);
}
