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
import { execAsync } from "../utils/exec.js";

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

  async createPR(_options: PRCreateOptions): Promise<PRInfo> {
    throw new Error("Not implemented");
  }

  async createDraftPR(_options: PRCreateOptions): Promise<PRInfo> {
    throw new Error("Not implemented");
  }

  async getPR(_prIdentifier: string | number): Promise<PRInfo | null> {
    throw new Error("Not implemented");
  }

  async mergePR(
    _prNumber: number,
    _options?: {
      method?: TMergeMethod;
      message?: string;
      deleteBranch?: boolean;
    },
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  async enableAutoMerge(
    _prNumber: number,
    _options?: {
      mergeMethod?: TMergeMethod;
      deleteBranch?: boolean;
    },
  ): Promise<void> {
    throw new Error("Not implemented");
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
}
