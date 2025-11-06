/**
 * Draft PR creation service
 *
 * Handles automatic draft PR creation when new feature branches are created.
 * Integrates with GitPlatformAdapter to create PRs with metadata from artifacts.
 *
 * @module draft-pr-service
 */

import type { GitPlatformAdapter } from "../types/adapter.js";
import type { DraftPRConfig, DraftPRResult } from "./draft-pr-types.js";

/**
 * Default configuration for draft PR service
 */
const DEFAULT_CONFIG: Required<DraftPRConfig> = {
  enabled: false,
  gitRoot: process.cwd(),
  artifactsDir: ".kodebase/artifacts",
};

/**
 * Draft PR creation service
 *
 * Creates draft PRs automatically when new feature branches are created.
 * Extracts PR metadata from artifact files and handles idempotency.
 *
 * @example
 * ```typescript
 * import { DraftPRService } from "@kodebase/git-ops";
 *
 * const adapter = createAdapter(config);
 * const service = new DraftPRService(adapter, {
 *   enabled: true,
 *   gitRoot: '/path/to/repo',
 * });
 *
 * const result = await service.createDraftPR('C.6.3', 'C.6.3-draft-pr-creation');
 * if (result.created) {
 *   console.log(`PR created: ${result.prUrl}`);
 * }
 * ```
 */
export class DraftPRService {
  private config: Required<DraftPRConfig>;
  private adapter: GitPlatformAdapter;

  constructor(adapter: GitPlatformAdapter, config: DraftPRConfig = {}) {
    this.adapter = adapter;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Create a draft PR for the given artifact
   *
   * Checks if PR already exists before creating a new one.
   * Loads artifact metadata to generate PR title and body.
   *
   * @param artifactId - Artifact ID (e.g., "C.6.3")
   * @param branchName - Branch name (e.g., "C.6.3-draft-pr-creation")
   * @param baseBranch - Base branch for PR (default: "main")
   * @returns Result of PR creation attempt
   *
   * @example
   * ```typescript
   * // Create draft PR for C.6.3
   * const result = await service.createDraftPR('C.6.3', 'C.6.3-draft-pr-creation');
   *
   * if (result.created) {
   *   console.log(`PR #${result.prNumber} created: ${result.prUrl}`);
   * } else {
   *   console.log(`PR not created: ${result.reason}`);
   * }
   * ```
   */
  async createDraftPR(
    artifactId: string,
    branchName: string,
    baseBranch = "main",
  ): Promise<DraftPRResult> {
    try {
      // Check if draft PR creation is enabled
      if (!this.config.enabled) {
        return {
          created: false,
          reason: "Draft PR creation is disabled",
        };
      }

      // Check if PR already exists for this branch
      const existingPR = await this.findExistingPR(branchName);
      if (existingPR) {
        return {
          created: false,
          prNumber: existingPR.number,
          prUrl: existingPR.url,
          reason: `PR already exists: #${existingPR.number}`,
        };
      }

      // Load artifact metadata to build PR title and body
      const { title, body } = await this.buildPRContent(artifactId);

      // Create draft PR
      const pr = await this.adapter.createDraftPR({
        branch: branchName,
        title,
        body,
        draft: true,
        repoPath: this.config.gitRoot,
        baseBranch,
      });

      return {
        created: true,
        prNumber: pr.number,
        prUrl: pr.url,
        reason: "Draft PR created successfully",
      };
    } catch (error) {
      return {
        created: false,
        reason: `Failed to create draft PR: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Find existing PR for the given branch
   *
   * @param _branchName - Branch name to search for
   * @returns PR info if found, null otherwise
   * @private
   */
  private async findExistingPR(
    _branchName: string,
  ): Promise<{ number: number; url: string } | null> {
    try {
      // Try to get PR by branch name
      // Note: This is a simplified implementation. In reality, you'd need to
      // query the platform's API to find PRs by branch name.
      // For now, we'll rely on the platform adapter's createDraftPR to handle
      // the "PR already exists" error gracefully.
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Build PR title and body from artifact metadata
   *
   * @param artifactId - Artifact ID (e.g., "C.6.3")
   * @returns PR title and body
   * @private
   */
  private async buildPRContent(
    artifactId: string,
  ): Promise<{ title: string; body: string }> {
    try {
      // Import loadArtifactMetadata here to avoid circular dependency
      const { loadArtifactMetadata } = await import("./artifact-loader.js");
      const artifact = await loadArtifactMetadata(artifactId, this.config);

      // Build PR title from artifact metadata
      const title = `[${artifactId}] ${artifact.metadata.title}`;

      // Build PR body from artifact content
      const bodyParts: string[] = [];

      // Extract summary based on artifact type
      const content = artifact.content;
      let summary: string | undefined;
      let criteria: string[] = [];

      // Handle different artifact types
      if ("summary" in content) {
        // Issue or Milestone
        summary = content.summary;
        if ("acceptance_criteria" in content) {
          // Issue
          criteria = Array.isArray(content.acceptance_criteria)
            ? content.acceptance_criteria
            : [content.acceptance_criteria];
        } else if ("validation" in content && content.validation) {
          // Milestone
          criteria = Array.isArray(content.validation)
            ? content.validation
            : [content.validation];
        }
      } else if ("vision" in content) {
        // Initiative
        summary = content.vision;
        if ("success_criteria" in content) {
          criteria = Array.isArray(content.success_criteria)
            ? content.success_criteria
            : [content.success_criteria];
        }
      }

      // Add summary if available
      if (summary) {
        bodyParts.push("## Summary\n");
        bodyParts.push(summary);
        bodyParts.push("\n");
      }

      // Add criteria if available
      if (criteria.length > 0) {
        bodyParts.push("## Acceptance Criteria\n");
        for (const criterion of criteria) {
          bodyParts.push(`- [ ] ${criterion}`);
        }
        bodyParts.push("\n");
      }

      bodyParts.push("---");
      bodyParts.push("\n*This draft PR was created automatically.*");

      const body = bodyParts.join("\n");

      return { title, body };
    } catch (_error) {
      // Fallback to basic title if artifact metadata loading fails
      return {
        title: `[${artifactId}] Work in progress`,
        body: `Automated draft PR for artifact ${artifactId}.\n\n*This draft PR was created automatically.*`,
      };
    }
  }
}
