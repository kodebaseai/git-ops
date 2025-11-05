/**
 * Factory functions for creating git platform adapters from configuration
 */

import type { KodebaseConfig } from "@kodebase/config";
import { GitHubAdapter, type GitHubAdapterConfig } from "./adapters/github.js";
import { GitLabAdapter } from "./adapters/gitlab.js";
import type { GitPlatformAdapter } from "./types/adapter.js";
import { CGitPlatform } from "./types/constants.js";

/**
 * Error thrown when adapter creation fails
 */
export class AdapterCreateError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AdapterCreateError";
    if (cause) {
      this.cause = cause;
    }
  }
}

/**
 * Create a git platform adapter from Kodebase configuration
 *
 * @param config - Kodebase configuration object
 * @returns Configured git platform adapter
 * @throws {AdapterCreateError} If platform is unsupported or configuration is invalid
 *
 * @remarks
 * This factory function reads the platform configuration from `config.gitOps.platform`
 * and creates the appropriate adapter with authentication strategy.
 *
 * Platform selection:
 * - Uses `config.gitOps.platform.type` (default: "github")
 * - Falls back to GitHub if platform type is not specified
 *
 * Authentication strategy (auto by default):
 * - "auto": Try token env var, then CLI, then fail with helpful message
 * - "token": Use token from env var only (fails if not found)
 * - "cli": Use CLI authentication only (fails if CLI not installed/authenticated)
 *
 * GitHub-specific config:
 * - `config.gitOps.platform.github.token_env_var`: Custom env var name (default: GITHUB_TOKEN)
 * - `config.gitOps.platform.github.api_url`: GitHub Enterprise API URL
 *
 * @example
 * ```typescript
 * import { loadConfig } from '@kodebase/config';
 * import { createAdapter } from '@kodebase/git-ops';
 *
 * const config = await loadConfig(process.cwd());
 * const adapter = createAdapter(config);
 *
 * // Validate authentication
 * const auth = await adapter.validateAuth();
 * if (!auth.authenticated) {
 *   console.error(`Authentication failed: ${auth.error}`);
 *   process.exit(1);
 * }
 *
 * // Create a PR
 * const pr = await adapter.createPR({
 *   title: 'Feature: New component',
 *   body: 'Implementation of new component',
 *   branch: 'feature/new-component',
 *   baseBranch: 'main',
 *   repoPath: process.cwd(),
 * });
 * ```
 */
export function createAdapter(config: KodebaseConfig): GitPlatformAdapter {
  const platformType = config.gitOps?.platform?.type ?? CGitPlatform.GITHUB;
  const authStrategy = config.gitOps?.platform?.auth_strategy ?? "auto";

  switch (platformType) {
    case CGitPlatform.GITHUB: {
      const githubConfig = config.gitOps?.platform?.github;
      const tokenEnvVar = githubConfig?.token_env_var ?? "GITHUB_TOKEN";

      // Build adapter config based on auth strategy
      const adapterConfig: GitHubAdapterConfig = {};

      if (authStrategy === "token" || authStrategy === "auto") {
        const token = process.env[tokenEnvVar];
        if (authStrategy === "token" && !token) {
          throw new AdapterCreateError(
            `GitHub token not found. Expected environment variable: ${tokenEnvVar}. ` +
              `Set the token or change auth_strategy to "auto" or "cli".`,
          );
        }
        if (token) {
          adapterConfig.token = token;
        }
      }

      if (authStrategy === "cli" && !process.env[tokenEnvVar]) {
        // For CLI-only mode, ensure we don't pick up token
        // (validateAuth will check gh CLI)
      }

      return new GitHubAdapter(adapterConfig);
    }

    case CGitPlatform.GITLAB: {
      // GitLab stub implementation - config validation for future use
      const gitlabConfig = config.gitOps?.platform?.gitlab;
      const tokenEnvVar = gitlabConfig?.token_env_var ?? "GITLAB_TOKEN";

      if (authStrategy === "token") {
        const token = process.env[tokenEnvVar];
        if (!token) {
          throw new AdapterCreateError(
            `GitLab token not found. Expected environment variable: ${tokenEnvVar}. ` +
              `Set the token or change auth_strategy to "auto" or "cli".`,
          );
        }
      }

      return new GitLabAdapter();
    }

    case CGitPlatform.BITBUCKET:
      throw new AdapterCreateError(
        "Bitbucket support is not yet implemented. Planned for v2.0. " +
          "Currently supported platforms: github, gitlab (stub). " +
          `Please update config.gitOps.platform.type to "github".`,
      );

    default:
      throw new AdapterCreateError(
        `Unsupported platform type: "${platformType}". ` +
          "Supported platforms: github, gitlab (stub). " +
          "Please update config.gitOps.platform.type.",
      );
  }
}

/**
 * Get PR creation options from configuration
 *
 * @param config - Kodebase configuration object
 * @returns PR creation defaults from config
 *
 * @remarks
 * Extracts PR creation settings that can be used as defaults when creating PRs.
 * These settings include:
 * - Title/body templates
 * - Auto-assign behavior
 * - Auto-add labels
 * - Default reviewers
 *
 * @example
 * ```typescript
 * const config = await loadConfig(process.cwd());
 * const prDefaults = getPRCreationDefaults(config);
 *
 * console.log(prDefaults.autoAssign); // true
 * console.log(prDefaults.defaultReviewers); // ['user1', 'user2']
 * console.log(prDefaults.additionalLabels); // ['enhancement']
 * ```
 */
export function getPRCreationDefaults(config: KodebaseConfig) {
  const prCreation = config.gitOps?.pr_creation ?? {};
  const postCheckout = config.gitOps?.post_checkout ?? {};

  return {
    titleTemplate: prCreation.title_template,
    bodyTemplate: prCreation.body_template,
    autoAssign: prCreation.auto_assign ?? postCheckout.auto_assign ?? false,
    autoAddLabels:
      prCreation.auto_add_labels ?? postCheckout.auto_add_labels ?? false,
    defaultReviewers: prCreation.default_reviewers ?? [],
    additionalLabels: prCreation.additional_labels ?? [],
    createDraft: postCheckout.create_draft_pr ?? false,
  };
}

/**
 * Get merge options from configuration
 *
 * @param config - Kodebase configuration object
 * @returns Merge defaults from config
 *
 * @remarks
 * Extracts merge settings that can be used when merging PRs.
 * These settings include:
 * - Auto-merge behavior
 * - Branch deletion after merge
 *
 * @example
 * ```typescript
 * const config = await loadConfig(process.cwd());
 * const mergeDefaults = getMergeDefaults(config);
 *
 * console.log(mergeDefaults.autoMerge); // true
 * console.log(mergeDefaults.deleteBranch); // true
 * ```
 */
export function getMergeDefaults(config: KodebaseConfig) {
  const postMerge = config.gitOps?.post_merge ?? {};
  const branches = config.gitOps?.branches ?? {};

  return {
    autoMerge: postMerge.cascade_pr?.auto_merge ?? false,
    deleteBranch:
      branches.delete_after_merge ??
      postMerge.cascade_pr?.delete_branch ??
      false,
    requireChecks: postMerge.cascade_pr?.require_checks ?? true,
    labels: postMerge.cascade_pr?.labels ?? [],
  };
}
