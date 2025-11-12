/**
 * GitHub platform adapter implementation
 */

import type {
  AuthStatus,
  Branch,
  GitPlatformAdapter,
  PRCreateOptions,
  PRInfo,
} from "../types/adapter.js";
import {
  CGitPlatform,
  type TGitPlatform,
  type TMergeMethod,
} from "../types/constants.js";
import { execAsync, execWithStdin } from "../utils/exec.js";

/**
 * GitHub adapter configuration
 */
export interface GitHubAdapterConfig {
  /** GitHub personal access token (optional - falls back to env or gh CLI) */
  token?: string;
}

/**
 * GitHub platform adapter
 *
 * @remarks
 * Implements GitPlatformAdapter for GitHub using either:
 * 1. GITHUB_TOKEN environment variable
 * 2. GitHub CLI (gh) authentication
 *
 * Authentication priority:
 * 1. Token passed via config
 * 2. GITHUB_TOKEN env var
 * 3. gh CLI authentication
 *
 * @example
 * ```typescript
 * // Using explicit token
 * const adapter = new GitHubAdapter({ token: 'ghp_...' });
 *
 * // Using GITHUB_TOKEN env var
 * const adapter = new GitHubAdapter();
 *
 * // Validate auth before use
 * const auth = await adapter.validateAuth();
 * if (!auth.authenticated) {
 *   throw new Error('Not authenticated');
 * }
 * ```
 */
export class GitHubAdapter implements GitPlatformAdapter {
  readonly platform: TGitPlatform = CGitPlatform.GITHUB;
  private readonly config: GitHubAdapterConfig;

  constructor(config: GitHubAdapterConfig = {}) {
    this.config = config;
  }

  /**
   * Validate GitHub authentication
   *
   * @returns Authentication status with user info
   *
   * @remarks
   * Checks authentication in this order:
   * 1. GITHUB_TOKEN env var - validates with GitHub API
   * 2. gh CLI - checks `gh auth status`
   *
   * For token auth, makes a test API call to /user endpoint.
   * For gh CLI, checks the exit code and parses user info from status output.
   *
   * @example
   * ```typescript
   * const auth = await adapter.validateAuth();
   * if (!auth.authenticated) {
   *   console.error(`Auth failed: ${auth.error}`);
   *   process.exit(1);
   * }
   * console.log(`Authenticated as ${auth.user} via ${auth.authType}`);
   * ```
   */
  async validateAuth(): Promise<AuthStatus> {
    // Try token authentication first (config or env)
    const token = this.config.token ?? process.env.GITHUB_TOKEN;

    if (token) {
      try {
        const response = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });

        if (response.status === 401) {
          return {
            authenticated: false,
            platform: CGitPlatform.GITHUB,
            error: "Token is invalid or expired",
          };
        }

        if (!response.ok) {
          return {
            authenticated: false,
            platform: CGitPlatform.GITHUB,
            error: `GitHub API error: ${response.status} ${response.statusText}`,
          };
        }

        const user = (await response.json()) as {
          login: string;
          scopes?: string;
        };
        const scopes =
          response.headers.get("x-oauth-scopes")?.split(", ") ?? [];

        return {
          authenticated: true,
          platform: CGitPlatform.GITHUB,
          user: user.login,
          authType: "token",
          scopes,
        };
      } catch (error) {
        return {
          authenticated: false,
          platform: CGitPlatform.GITHUB,
          error: `Failed to validate token: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    // Fall back to gh CLI authentication
    try {
      const { stdout, exitCode } = await execAsync("gh auth status");

      if (exitCode !== 0) {
        return {
          authenticated: false,
          platform: CGitPlatform.GITHUB,
          error:
            "gh CLI not authenticated. Run 'gh auth login' to authenticate.",
        };
      }

      // Parse username from gh auth status output
      // Example output: "✓ Logged in to github.com account username (keyring)"
      const userMatch = stdout.match(/github\.com account ([^\s(]+)/);
      const user = userMatch?.[1];

      return {
        authenticated: true,
        platform: CGitPlatform.GITHUB,
        user,
        authType: "oauth",
      };
    } catch (error) {
      return {
        authenticated: false,
        platform: CGitPlatform.GITHUB,
        error: `gh CLI check failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  async createPR(options: PRCreateOptions): Promise<PRInfo> {
    const args = [
      "gh",
      "pr",
      "create",
      "--repo",
      await this.getRepoFromPath(options.repoPath),
    ];

    if (options.title) args.push("--title", options.title);
    // Use --body-file with stdin to avoid shell escaping issues with newlines
    if (options.body) args.push("--body-file", "-");
    if (options.baseBranch) args.push("--base", options.baseBranch);
    if (options.branch) args.push("--head", options.branch);
    if (options.labels?.length) args.push("--label", options.labels.join(","));
    if (options.assignees?.length)
      args.push("--assignee", options.assignees.join(","));
    if (options.reviewers?.length)
      args.push("--reviewer", options.reviewers.join(","));
    if (options.milestone) args.push("--milestone", options.milestone);

    const { stdout, exitCode, stderr } = await execWithStdin(
      args,
      options.body,
    );

    if (exitCode !== 0) {
      throw new Error(`Failed to create PR: ${stderr || stdout}`);
    }

    // Parse PR URL from output to get PR number
    const urlMatch = stdout.match(
      /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/,
    );
    if (!urlMatch?.[1]) {
      throw new Error("Failed to parse PR number from gh CLI output");
    }
    const prNumber = Number.parseInt(urlMatch[1], 10);

    return this.getPR(prNumber) as Promise<PRInfo>;
  }

  async createDraftPR(options: PRCreateOptions): Promise<PRInfo> {
    const args = [
      "gh",
      "pr",
      "create",
      "--draft",
      "--repo",
      await this.getRepoFromPath(options.repoPath),
    ];

    if (options.title) args.push("--title", options.title);
    // Use --body-file with stdin to avoid shell escaping issues with newlines
    if (options.body) args.push("--body-file", "-");
    if (options.baseBranch) args.push("--base", options.baseBranch);
    if (options.branch) args.push("--head", options.branch);
    if (options.labels?.length) args.push("--label", options.labels.join(","));
    if (options.assignees?.length)
      args.push("--assignee", options.assignees.join(","));
    if (options.reviewers?.length)
      args.push("--reviewer", options.reviewers.join(","));
    if (options.milestone) args.push("--milestone", options.milestone);

    const { stdout, exitCode, stderr } = await execWithStdin(
      args,
      options.body,
    );

    if (exitCode !== 0) {
      throw new Error(`Failed to create draft PR: ${stderr || stdout}`);
    }

    // Parse PR URL from output to get PR number
    const urlMatch = stdout.match(
      /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/,
    );
    if (!urlMatch?.[1]) {
      throw new Error("Failed to parse PR number from gh CLI output");
    }
    const prNumber = Number.parseInt(urlMatch[1], 10);

    return this.getPR(prNumber) as Promise<PRInfo>;
  }

  async getPR(prIdentifier: string | number): Promise<PRInfo | null> {
    const { stdout, exitCode } = await execAsync(
      `gh pr view ${prIdentifier} --json number,state,title,body,url,headRefName,baseRefName,author,createdAt,updatedAt,isDraft,labels,assignees,reviewRequests,reviewDecision,mergeable,mergeStateStatus`,
    );

    if (exitCode !== 0) {
      return null; // PR not found
    }

    try {
      const data = JSON.parse(stdout) as {
        number: number;
        state: string;
        title: string;
        body: string;
        url: string;
        headRefName: string;
        baseRefName: string;
        author: { login: string };
        createdAt: string;
        updatedAt: string;
        isDraft: boolean;
        labels: Array<{ name: string }>;
        assignees: Array<{ login: string }>;
        reviewRequests: Array<{ login: string }>;
        reviewDecision: string | null;
        mergeable: string;
        mergeStateStatus: string;
      };

      return {
        number: data.number,
        state: data.state,
        title: data.title,
        body: data.body,
        url: data.url,
        sourceBranch: data.headRefName,
        targetBranch: data.baseRefName,
        author: data.author.login,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        isDraft: data.isDraft,
        labels: data.labels.map((l) => l.name),
        assignees: data.assignees.map((a) => a.login),
        reviewers: data.reviewRequests.map((r) => r.login),
        reviewStatus: this.mapReviewDecision(data.reviewDecision),
        mergeable: data.mergeable === "MERGEABLE",
        hasConflicts: data.mergeStateStatus === "DIRTY",
      };
    } catch (error) {
      throw new Error(
        `Failed to parse PR data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async mergePR(
    prNumber: number,
    options?: {
      method?: TMergeMethod;
      message?: string;
      deleteBranch?: boolean;
    },
  ): Promise<void> {
    const args = ["gh", "pr", "merge", String(prNumber)];

    if (options?.method) {
      args.push(`--${options.method}`);
    }

    if (options?.deleteBranch) {
      args.push("--delete-branch");
    }

    if (options?.message) {
      args.push("--body", options.message);
    }

    const { exitCode, stderr, stdout } = await execAsync(args.join(" "));

    if (exitCode !== 0) {
      throw new Error(`Failed to merge PR #${prNumber}: ${stderr || stdout}`);
    }
  }

  async enableAutoMerge(
    prNumber: number,
    options?: {
      mergeMethod?: TMergeMethod;
      deleteBranch?: boolean;
    },
  ): Promise<void> {
    const args = ["gh", "pr", "merge", String(prNumber), "--auto"];

    if (options?.mergeMethod) {
      args.push(`--${options.mergeMethod}`);
    }

    if (options?.deleteBranch) {
      args.push("--delete-branch");
    }

    const { exitCode, stderr, stdout } = await execAsync(args.join(" "));

    if (exitCode !== 0) {
      throw new Error(
        `Failed to enable auto-merge for PR #${prNumber}: ${stderr || stdout}`,
      );
    }
  }

  async markPRReady(prNumber: number): Promise<void> {
    const { exitCode, stderr, stdout } = await execAsync(
      `gh pr ready ${prNumber}`,
    );

    if (exitCode !== 0) {
      throw new Error(
        `Failed to mark PR #${prNumber} as ready: ${stderr || stdout}`,
      );
    }
  }

  async findPRForBranch(branchName: string): Promise<PRInfo | null> {
    const { stdout, exitCode } = await execAsync(
      `gh pr list --head ${branchName} --json number,state,title,body,url,headRefName,baseRefName,author,createdAt,updatedAt,isDraft,labels,assignees,reviewRequests,reviewDecision,mergeable,mergeStateStatus --limit 1`,
    );

    if (exitCode !== 0 || !stdout) {
      return null; // No PR found or error
    }

    try {
      const prs = JSON.parse(stdout) as Array<{
        number: number;
        state: string;
        title: string;
        body: string;
        url: string;
        headRefName: string;
        baseRefName: string;
        author: { login: string };
        createdAt: string;
        updatedAt: string;
        isDraft: boolean;
        labels: Array<{ name: string }>;
        assignees: Array<{ login: string }>;
        reviewRequests: Array<{ login: string }>;
        reviewDecision: string | null;
        mergeable: string;
        mergeStateStatus: string;
      }>;

      if (prs.length === 0) {
        return null; // No PR found
      }

      const data = prs[0];
      if (!data) {
        return null;
      }

      return {
        number: data.number,
        state: data.state,
        title: data.title,
        body: data.body,
        url: data.url,
        sourceBranch: data.headRefName,
        targetBranch: data.baseRefName,
        author: data.author.login,
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
        isDraft: data.isDraft,
        labels: data.labels.map((l) => l.name),
        assignees: data.assignees.map((a) => a.login),
        reviewers: data.reviewRequests.map((r) => r.login),
        reviewStatus: this.mapReviewDecision(data.reviewDecision),
        mergeable: data.mergeable === "MERGEABLE",
        hasConflicts: data.mergeStateStatus === "DIRTY",
      };
    } catch (error) {
      throw new Error(
        `Failed to parse PR data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getBranch(
    _branchName: string,
    _repoPath: string,
  ): Promise<Branch | null> {
    throw new Error("Not implemented");
  }

  async getCurrentBranch(_repoPath: string): Promise<string> {
    throw new Error("Not implemented");
  }

  async getRemoteUrl(_repoPath: string, _remoteName?: string): Promise<string> {
    throw new Error("Not implemented");
  }

  async isAvailable(): Promise<boolean> {
    throw new Error("Not implemented");
  }

  /**
   * Get repository owner/name from local git repository path
   *
   * @param repoPath - Local repository path
   * @returns Repository in format "owner/repo"
   */
  private async getRepoFromPath(repoPath: string): Promise<string> {
    // Note: Using template literal here is safe because repoPath is a file system path
    // that will be validated by git itself. Any invalid path will cause git to fail.
    // For production use, consider using a library like shellwords for proper escaping.
    const { stdout, exitCode } = await execAsync(
      `git -C "${repoPath.replace(/"/g, '\\"')}" remote get-url origin`,
    );

    if (exitCode !== 0) {
      throw new Error("Failed to get remote URL from repository");
    }

    // Parse owner/repo from remote URL
    // Supports both HTTPS and SSH formats:
    // - https://github.com/owner/repo.git
    // - git@github.com:owner/repo.git
    const match = stdout.match(/github\.com[:/]([^/]+\/[^/]+?)(\.git)?$/);

    if (!match?.[1]) {
      throw new Error(
        `Could not parse GitHub repository from remote URL: ${stdout}`,
      );
    }

    return match[1];
  }

  /**
   * Map GitHub review decision to our review status type
   */
  private mapReviewDecision(
    decision: string | null,
  ): "approved" | "changes_requested" | "review_required" | "pending" {
    if (!decision) return "pending";

    switch (decision) {
      case "APPROVED":
        return "approved";
      case "CHANGES_REQUESTED":
        return "changes_requested";
      case "REVIEW_REQUIRED":
        return "review_required";
      default:
        return "pending";
    }
  }
}
