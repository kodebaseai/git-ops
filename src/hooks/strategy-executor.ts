/**
 * Post-merge strategy executor
 *
 * Executes configurable post-merge strategies (cascade_pr, direct_commit, manual)
 * based on configuration loaded from @kodebase/config.
 */

import { type KodebaseConfig, loadConfig } from "@kodebase/config";
import { createAdapter } from "../factory.js";
import type { GitPlatformAdapter } from "../types/adapter.js";
import { execAsync } from "../utils/exec.js";
import type {
  ExecuteStrategyOptions,
  StrategyExecutionResult,
  StrategyExecutorConfig,
} from "./strategy-executor-types.js";

/**
 * Default configuration for strategy executor
 */
const DEFAULT_CONFIG: Required<StrategyExecutorConfig> = {
  gitRoot: process.cwd(),
  repoPath: process.cwd(),
};

/**
 * Default actor for git operations
 */
const DEFAULT_ACTOR = "Kodebase GitOps";

/**
 * Post-merge strategy executor
 *
 * Executes post-merge strategies based on configuration from @kodebase/config.
 * Supports three strategies:
 * - cascade_pr: Creates PR with cascade changes
 * - direct_commit: Commits cascade changes directly to main
 * - manual: Logs cascade results, no automatic action
 *
 * **Responsibilities:**
 * - Load configuration from @kodebase/config
 * - Execute the configured strategy
 * - Handle git operations (commit, push, branch creation)
 * - Integrate with GitPlatformAdapter for PR operations
 * - Handle errors gracefully
 *
 * @example Basic usage
 * ```typescript
 * const executor = new StrategyExecutor();
 * const orchestrator = new PostMergeOrchestrator();
 *
 * // After cascade orchestration
 * const cascadeResults = await orchestrator.execute({
 *   mergeMetadata: detection.metadata,
 * });
 *
 * // Execute strategy
 * const result = await executor.execute({
 *   strategy: 'cascade_pr',
 *   cascadeResults,
 * });
 *
 * console.log(result.message);
 * ```
 */
export class StrategyExecutor {
  private config: Required<StrategyExecutorConfig>;
  private kodebaseConfig?: KodebaseConfig;
  private adapter?: GitPlatformAdapter;

  constructor(
    config: StrategyExecutorConfig = {},
    kodebaseConfig?: KodebaseConfig,
    adapter?: GitPlatformAdapter,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.kodebaseConfig = kodebaseConfig;
    this.adapter = adapter;
  }

  /**
   * Execute a post-merge strategy
   *
   * Executes the specified strategy with the cascade results.
   *
   * @param options - Strategy execution options
   * @returns Strategy execution result
   *
   * @example
   * ```typescript
   * const result = await executor.execute({
   *   strategy: 'cascade_pr',
   *   cascadeResults,
   *   actor: 'user@example.com',
   * });
   *
   * if (result.success && result.prInfo) {
   *   console.log(`Created PR: ${result.prInfo.url}`);
   * }
   * ```
   */
  async execute(
    options: ExecuteStrategyOptions,
  ): Promise<StrategyExecutionResult> {
    const { strategy, cascadeResults, actor = DEFAULT_ACTOR } = options;

    // Check if there are any changes
    if (cascadeResults.totalArtifactsUpdated === 0) {
      return {
        strategy,
        success: true,
        message: "No cascade changes to apply",
      };
    }

    try {
      // Load config if not provided
      if (!this.kodebaseConfig) {
        this.kodebaseConfig = await loadConfig(this.config.gitRoot);
      }

      // Execute strategy
      switch (strategy) {
        case "cascade_pr":
          return await this.executeCascadePR(cascadeResults, actor);
        case "direct_commit":
          return await this.executeDirectCommit(cascadeResults, actor);
        case "manual":
          return this.executeManual(cascadeResults);
        default:
          return {
            strategy,
            success: false,
            message: `Unknown strategy: ${strategy}`,
            error: `Strategy '${strategy}' is not supported`,
          };
      }
    } catch (error) {
      return {
        strategy,
        success: false,
        message: `Strategy execution failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute cascade_pr strategy
   *
   * Creates a PR with cascade changes. Optionally auto-merges based on config.
   */
  private async executeCascadePR(
    cascadeResults: ExecuteStrategyOptions["cascadeResults"],
    actor: string,
  ): Promise<StrategyExecutionResult> {
    const config = this.kodebaseConfig?.gitOps?.post_merge?.cascade_pr ?? {};
    const {
      auto_merge = true,
      require_checks = false,
      labels = ["automated", "cascade"],
      branch_prefix = "cascade/pr-",
    } = config;

    try {
      // Get merged PR number from metadata
      const prNumber = await this.getCurrentPRNumber();

      // Create cascade branch
      const branchName = `${branch_prefix}${prNumber}`;
      await this.createBranch(branchName);

      // Stage and commit changes
      await this.stageArtifactChanges();
      const _commitSha = await this.commitChanges(
        `cascade: updates from merged PR #${prNumber}`,
        actor,
      );

      // Push to remote
      await this.pushBranch(branchName);

      // Create PR using adapter
      const prInfo = await this.createPR({
        title: `[Automated] Cascade updates from PR #${prNumber}`,
        body: this.generateCascadeReport(cascadeResults, prNumber),
        branch: branchName,
        labels,
      });

      // Handle auto-merge
      let autoMerged = false;
      if (auto_merge) {
        try {
          if (require_checks) {
            await this.enableAutoMerge(prInfo.number);
            autoMerged = false; // Will merge later when checks pass
          } else {
            await this.mergePR(prInfo.number);
            autoMerged = true;
          }
        } catch (error) {
          console.warn(
            `Auto-merge failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      return {
        strategy: "cascade_pr",
        success: true,
        message: autoMerged
          ? `Created and auto-merged cascade PR #${prInfo.number}`
          : `Created cascade PR #${prInfo.number}${auto_merge && !require_checks ? " (auto-merge pending checks)" : ""}`,
        prInfo: {
          number: prInfo.number,
          url: prInfo.url,
          autoMerged,
        },
      };
    } catch (error) {
      return {
        strategy: "cascade_pr",
        success: false,
        message: `Failed to create cascade PR: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute direct_commit strategy
   *
   * Commits cascade changes directly to the current branch and pushes.
   */
  private async executeDirectCommit(
    _cascadeResults: ExecuteStrategyOptions["cascadeResults"],
    actor: string,
  ): Promise<StrategyExecutionResult> {
    const config = this.kodebaseConfig?.gitOps?.post_merge?.direct_commit ?? {};
    const { commit_prefix = "[automated]", push_immediately = true } = config;

    try {
      // Stage and commit changes
      await this.stageArtifactChanges();
      const commitSha = await this.commitChanges(
        `${commit_prefix} cascade: post-merge updates`,
        actor,
      );

      // Push if configured
      let pushed = false;
      if (push_immediately) {
        await this.pushCurrentBranch();
        pushed = true;
      }

      return {
        strategy: "direct_commit",
        success: true,
        message: pushed
          ? `Cascade updates committed and pushed (${commitSha.substring(0, 7)})`
          : `Cascade updates committed (${commitSha.substring(0, 7)})`,
        commitInfo: {
          sha: commitSha,
          message: `${commit_prefix} cascade: post-merge updates`,
          pushed,
        },
      };
    } catch (error) {
      return {
        strategy: "direct_commit",
        success: false,
        message: `Failed to commit cascade updates: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute manual strategy
   *
   * Logs cascade results but takes no automatic action.
   */
  private executeManual(
    cascadeResults: ExecuteStrategyOptions["cascadeResults"],
  ): StrategyExecutionResult {
    // Log summary to console
    console.log("\n=== Manual Cascade Updates ===");
    console.log(cascadeResults.summary);
    console.log("\nTo apply these changes, run:");
    console.log("  kodebase cascade apply");
    console.log("==============================\n");

    return {
      strategy: "manual",
      success: true,
      message: "Cascade updates logged. Manual action required.",
    };
  }

  /**
   * Generate cascade report for PR body
   */
  private generateCascadeReport(
    cascadeResults: ExecuteStrategyOptions["cascadeResults"],
    prNumber: number,
  ): string {
    const lines: string[] = [];

    lines.push(`## Cascade Updates from PR #${prNumber}`);
    lines.push("");

    // Merged artifacts
    const mergedArtifacts = cascadeResults.mergeMetadata.artifactIds;
    if (mergedArtifacts.length > 0) {
      lines.push("### Merged Artifacts");
      for (const artifactId of mergedArtifacts) {
        lines.push(`- ✅ ${artifactId} → completed`);
      }
      lines.push("");
    }

    // Completion cascade results
    if (cascadeResults.completionCascade.events.length > 0) {
      lines.push("### Completion Cascade");
      for (const event of cascadeResults.completionCascade.events) {
        lines.push(`- 📊 ${event.artifactId} → ${event.event}`);
      }
      lines.push("");
    }

    // Readiness cascade results
    if (cascadeResults.readinessCascade.events.length > 0) {
      lines.push("### Readiness Cascade");
      for (const event of cascadeResults.readinessCascade.events) {
        lines.push(`- ✅ ${event.artifactId} → ${event.event}`);
      }
      lines.push("");
    }

    // Summary
    lines.push("### Summary");
    lines.push(
      `- **Artifacts Updated:** ${cascadeResults.totalArtifactsUpdated}`,
    );
    lines.push(`- **Events Added:** ${cascadeResults.totalEventsAdded}`);
    lines.push("");

    lines.push("---");
    lines.push("");
    lines.push("*This PR was automatically created by Kodebase git-ops.*");

    return lines.join("\n");
  }

  /**
   * Get current PR number from git metadata
   */
  private async getCurrentPRNumber(): Promise<number> {
    try {
      // Try to get PR number from branch name or git reflog
      const { stdout } = await execAsync("git log -1 --pretty=%B", {
        cwd: this.config.gitRoot,
      });

      // Look for "Merge pull request #123" or similar
      const match = stdout.match(/#(\d+)/);
      if (match?.[1]) {
        return Number.parseInt(match[1], 10);
      }

      // Fallback: use timestamp
      return Date.now() % 100000;
    } catch {
      // Fallback: use timestamp
      return Date.now() % 100000;
    }
  }

  /**
   * Create a new git branch
   */
  private async createBranch(branchName: string): Promise<void> {
    const { exitCode, stderr } = await execAsync(
      `git checkout -b ${JSON.stringify(branchName).slice(1, -1)}`,
      { cwd: this.config.gitRoot },
    );

    if (exitCode !== 0) {
      throw new Error(`Failed to create branch: ${stderr}`);
    }
  }

  /**
   * Stage artifact changes
   */
  private async stageArtifactChanges(): Promise<void> {
    const { exitCode, stderr } = await execAsync(
      "git add .kodebase/artifacts/**/*.yml",
      { cwd: this.config.gitRoot },
    );

    if (exitCode !== 0) {
      throw new Error(`Failed to stage changes: ${stderr}`);
    }
  }

  /**
   * Commit staged changes
   */
  private async commitChanges(message: string, actor: string): Promise<string> {
    const commitMessage = `${message}\n\n🤖 Generated with Kodebase\n\nCo-Authored-By: ${actor} <noreply@kodebase.ai>`;
    const { exitCode, stderr } = await execAsync(
      `git commit -m ${JSON.stringify(commitMessage)}`,
      { cwd: this.config.gitRoot },
    );

    if (exitCode !== 0) {
      throw new Error(`Failed to commit changes: ${stderr}`);
    }

    // Get commit SHA
    const { stdout: sha } = await execAsync("git rev-parse HEAD", {
      cwd: this.config.gitRoot,
    });
    return sha;
  }

  /**
   * Push branch to remote
   */
  private async pushBranch(branchName: string): Promise<void> {
    const { exitCode, stderr } = await execAsync(
      `git push -u origin ${JSON.stringify(branchName).slice(1, -1)}`,
      { cwd: this.config.gitRoot },
    );

    if (exitCode !== 0) {
      throw new Error(`Failed to push branch: ${stderr}`);
    }
  }

  /**
   * Push current branch to remote
   */
  private async pushCurrentBranch(): Promise<void> {
    const { exitCode, stderr } = await execAsync("git push", {
      cwd: this.config.gitRoot,
    });

    if (exitCode !== 0) {
      throw new Error(`Failed to push: ${stderr}`);
    }
  }

  /**
   * Create PR using platform adapter
   */
  private async createPR(options: {
    title: string;
    body: string;
    branch: string;
    labels: string[];
  }): Promise<{ number: number; url: string }> {
    if (!this.adapter) {
      this.adapter = await this.createAdapter();
    }

    const prInfo = await this.adapter.createPR({
      ...options,
      repoPath: this.config.repoPath,
      baseBranch: "main",
    });

    return {
      number: prInfo.number,
      url: prInfo.url ?? `PR #${prInfo.number}`,
    };
  }

  /**
   * Enable auto-merge for a PR
   */
  private async enableAutoMerge(prNumber: number): Promise<void> {
    if (!this.adapter) {
      this.adapter = await this.createAdapter();
    }

    await this.adapter.enableAutoMerge(prNumber, {
      deleteBranch: true,
    });
  }

  /**
   * Merge a PR immediately
   */
  private async mergePR(prNumber: number): Promise<void> {
    if (!this.adapter) {
      this.adapter = await this.createAdapter();
    }

    await this.adapter.mergePR(prNumber, {
      deleteBranch: true,
    });
  }

  /**
   * Create platform adapter
   */
  private async createAdapter(): Promise<GitPlatformAdapter> {
    // Load config if not already loaded
    if (!this.kodebaseConfig) {
      this.kodebaseConfig = await loadConfig(this.config.gitRoot);
    }
    return createAdapter(this.kodebaseConfig);
  }
}

/**
 * Factory function to create strategy executor
 */
export function createStrategyExecutor(
  config?: StrategyExecutorConfig,
  kodebaseConfig?: KodebaseConfig,
  adapter?: GitPlatformAdapter,
): StrategyExecutor {
  return new StrategyExecutor(config, kodebaseConfig, adapter);
}
