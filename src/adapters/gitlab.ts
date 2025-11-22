/**
 * GitLab platform adapter stub implementation
 *
 * @remarks
 * This is a stub implementation to maintain interface compatibility.
 * GitLab support is planned for v1.1.
 *
 * All methods throw NotImplementedError with helpful messages and links
 * to the GitLab support roadmap.
 */

import type {
  AuthStatus,
  Branch,
  GitPlatformAdapter,
  PRCreateOptions,
  PRInfo,
} from "../types/adapter.js";
import { CGitPlatform, type TGitPlatform } from "../types/constants.js";

/**
 * GitLab adapter configuration
 */
export interface GitLabAdapterConfig {
  /** GitLab personal access token or instance URL */
  token?: string;
  /** GitLab instance URL (default: https://gitlab.com) */
  baseUrl?: string;
}

/**
 * Error thrown when GitLab features are not yet implemented
 */
export class GitLabNotImplementedError extends Error {
  constructor(method: string) {
    super(
      `GitLab support for '${method}' is not yet implemented. ` +
        "GitLab adapter support is planned for v1.1. " +
        "Track progress at: https://github.com/kodebase-org/kodebase/issues",
    );
    this.name = "GitLabNotImplementedError";
  }
}

/**
 * GitLab platform adapter stub
 *
 * @remarks
 * This stub implementation ensures interface compatibility while GitLab
 * support is under development. All methods throw GitLabNotImplementedError.
 *
 * Planned for v1.1:
 * - GitLab API integration via @gitbeaker/rest
 * - Merge Request operations (GitLab's equivalent of PRs)
 * - GitLab CI/CD pipeline integration
 * - Self-hosted GitLab instance support
 *
 * @example
 * ```typescript
 * const adapter = new GitLabAdapter({ token: 'glpat-...' });
 *
 * // This will throw GitLabNotImplementedError
 * try {
 *   await adapter.validateAuth();
 * } catch (error) {
 *   console.error(error.message);
 *   // "GitLab support for 'validateAuth' is not yet implemented..."
 * }
 * ```
 */
export class GitLabAdapter implements GitPlatformAdapter {
  readonly platform: TGitPlatform = CGitPlatform.GITLAB;

  async validateAuth(): Promise<AuthStatus> {
    // Detect GitLab context but return unimplemented status
    return {
      authenticated: false,
      platform: CGitPlatform.GITLAB,
      error:
        "GitLab support is not yet implemented. Planned for v1.1. " +
        "Track progress at: https://github.com/kodebase-org/kodebase/issues",
    };
  }

  async createPR(_options: PRCreateOptions): Promise<PRInfo> {
    throw new GitLabNotImplementedError("createPR");
  }

  async createDraftPR(_options: PRCreateOptions): Promise<PRInfo> {
    throw new GitLabNotImplementedError("createDraftPR");
  }

  async getPR(_prIdentifier: string | number): Promise<PRInfo | null> {
    throw new GitLabNotImplementedError("getPR");
  }

  async mergePR(
    _prNumber: number,
    _options?: {
      method?: "merge" | "squash" | "rebase";
      message?: string;
      deleteBranch?: boolean;
    },
  ): Promise<void> {
    throw new GitLabNotImplementedError("mergePR");
  }

  async enableAutoMerge(
    _prNumber: number,
    _options?: {
      mergeMethod?: "merge" | "squash" | "rebase";
      deleteBranch?: boolean;
    },
  ): Promise<void> {
    throw new GitLabNotImplementedError("enableAutoMerge");
  }

  async getBranch(
    _branchName: string,
    _repoPath: string,
  ): Promise<Branch | null> {
    throw new GitLabNotImplementedError("getBranch");
  }

  async getCurrentBranch(_repoPath: string): Promise<string> {
    throw new GitLabNotImplementedError("getCurrentBranch");
  }

  async getRemoteUrl(_repoPath: string, _remoteName?: string): Promise<string> {
    throw new GitLabNotImplementedError("getRemoteUrl");
  }

  async isAvailable(): Promise<boolean> {
    throw new GitLabNotImplementedError("isAvailable");
  }

  async markPRReady(_prNumber: number): Promise<void> {
    throw new GitLabNotImplementedError("markPRReady");
  }

  async updatePRDescription(
    _prNumber: number,
    _description: string,
  ): Promise<void> {
    throw new GitLabNotImplementedError("updatePRDescription");
  }

  async findPRForBranch(_branchName: string): Promise<PRInfo | null> {
    throw new GitLabNotImplementedError("findPRForBranch");
  }
}
