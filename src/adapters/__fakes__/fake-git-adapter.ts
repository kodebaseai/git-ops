/**
 * Fake Git Platform Adapter for testing
 *
 * @remarks
 * In-memory implementation of GitPlatformAdapter for fast, deterministic tests.
 * This is an inline implementation for D.1.1 POC. Will be extracted to
 * @kodebase/test-utils in D.1.4.
 */

import type {
  AuthStatus,
  Branch,
  GitPlatformAdapter,
  PRCreateOptions,
  PRInfo,
} from "../../types/adapter.js";
import {
  CGitPlatform,
  type TGitPlatform,
  type TMergeMethod,
} from "../../types/constants.js";

/**
 * Extended PR info with platform state (auto-merge, etc.)
 * In real implementations, this would be tracked on the platform
 */
interface FakePRInfo extends PRInfo {
  autoMergeEnabled?: boolean;
  autoMergeMethod?: TMergeMethod;
  autoMergeDeleteBranch?: boolean;
}

/**
 * In-memory state for fake adapter
 */
interface FakeState {
  prs: Map<number, FakePRInfo>;
  branches: Map<string, Branch>;
  nextPRNumber: number;
  authenticated: boolean;
  user: string;
  currentBranch: Map<string, string>; // repoPath -> branchName
  remoteUrls: Map<string, Map<string, string>>; // repoPath -> remoteName -> url
  platformAvailable: boolean;
}

/**
 * Configuration for FakeGitAdapter
 */
export interface FakeGitAdapterConfig {
  platform?: TGitPlatform;
  authenticated?: boolean;
  user?: string;
  initialState?: Partial<FakeState>;
}

/**
 * Fake Git Platform Adapter
 *
 * @remarks
 * Fully functional in-memory implementation with no external dependencies.
 * Simulates all GitPlatformAdapter behaviors including:
 * - PR creation (regular and draft)
 * - PR retrieval and merging
 * - Auto-merge
 * - Authentication
 * - Branch operations
 * - Platform availability checks
 *
 * State is mutable and can be inspected for assertions.
 *
 * @example
 * ```typescript
 * const adapter = new FakeGitAdapter({
 *   authenticated: true,
 *   user: 'test-user'
 * });
 *
 * const pr = await adapter.createPR({
 *   title: 'Test PR',
 *   repoPath: '/test/repo',
 *   branch: 'feature'
 * });
 *
 * expect(pr.number).toBe(1);
 * expect(adapter.getState().prs.size).toBe(1);
 * ```
 */
export class FakeGitAdapter implements GitPlatformAdapter {
  public readonly platform: TGitPlatform;
  private state: FakeState;

  constructor(config: FakeGitAdapterConfig = {}) {
    this.platform = config.platform ?? CGitPlatform.GITHUB;
    this.state = {
      prs: new Map(),
      branches: new Map(),
      nextPRNumber: 1,
      authenticated: config.authenticated ?? true,
      user: config.user ?? "fake-user",
      currentBranch: new Map(),
      remoteUrls: new Map(),
      platformAvailable: true,
      ...config.initialState,
    };
  }

  /**
   * Get current internal state (for test assertions)
   */
  public getState(): Readonly<FakeState> {
    return this.state;
  }

  /**
   * Reset state to initial configuration
   */
  public reset(): void {
    this.state.prs.clear();
    this.state.branches.clear();
    this.state.nextPRNumber = 1;
    this.state.currentBranch.clear();
    this.state.remoteUrls.clear();
  }

  /**
   * Set authentication status
   */
  public setAuthenticated(authenticated: boolean, user?: string): void {
    this.state.authenticated = authenticated;
    if (user !== undefined) {
      this.state.user = user;
    }
  }

  /**
   * Set platform availability
   */
  public setPlatformAvailable(available: boolean): void {
    this.state.platformAvailable = available;
  }

  async createPR(options: PRCreateOptions): Promise<PRInfo> {
    if (!this.state.authenticated) {
      throw new Error("Not authenticated");
    }

    const prNumber = this.state.nextPRNumber++;
    const pr: FakePRInfo = {
      number: prNumber,
      state: "open",
      title: options.title,
      body: options.body,
      url: `https://${this.platform}.com/${options.repoPath}/pull/${prNumber}`,
      sourceBranch: options.branch ?? "unknown",
      targetBranch: options.baseBranch ?? "main",
      author: this.state.user,
      createdAt: new Date(),
      updatedAt: new Date(),
      isDraft: false,
      labels: options.labels ?? [],
      assignees: options.assignees ?? [],
      reviewers: options.reviewers ?? [],
      mergeable: true,
      hasConflicts: false,
    };

    this.state.prs.set(prNumber, pr);
    return pr;
  }

  async createDraftPR(options: PRCreateOptions): Promise<PRInfo> {
    const pr = await this.createPR(options);
    pr.isDraft = true;
    pr.title = `[DRAFT] ${pr.title}`;
    return pr;
  }

  async getPR(prIdentifier: string | number): Promise<PRInfo | null> {
    const prNumber =
      typeof prIdentifier === "string"
        ? Number.parseInt(prIdentifier, 10)
        : prIdentifier;
    return this.state.prs.get(prNumber) ?? null;
  }

  async mergePR(
    prNumber: number,
    options?: {
      method?: TMergeMethod;
      message?: string;
      deleteBranch?: boolean;
    },
  ): Promise<void> {
    const pr = this.state.prs.get(prNumber);
    if (!pr) {
      throw new Error(`PR #${prNumber} not found`);
    }

    if (pr.state !== "open") {
      throw new Error(`PR #${prNumber} is not open`);
    }

    if (pr.hasConflicts) {
      throw new Error(`PR #${prNumber} has merge conflicts`);
    }

    if (!pr.mergeable) {
      throw new Error(`PR #${prNumber} is not mergeable`);
    }

    pr.state = "merged";
    pr.updatedAt = new Date();

    // Simulate branch deletion
    if (options?.deleteBranch && pr.sourceBranch) {
      this.state.branches.delete(pr.sourceBranch);
    }
  }

  async enableAutoMerge(
    prNumber: number,
    options?: {
      mergeMethod?: TMergeMethod;
      deleteBranch?: boolean;
    },
  ): Promise<void> {
    const pr = this.state.prs.get(prNumber);
    if (!pr) {
      throw new Error(`PR #${prNumber} not found`);
    }

    // Store auto-merge preference (type-safe with FakePRInfo)
    pr.autoMergeEnabled = true;
    pr.autoMergeMethod = options?.mergeMethod ?? "merge";
    pr.autoMergeDeleteBranch = options?.deleteBranch ?? false;
  }

  async validateAuth(): Promise<AuthStatus> {
    if (!this.state.authenticated) {
      return {
        authenticated: false,
        platform: this.platform,
        error: "Invalid credentials",
      };
    }

    return {
      authenticated: true,
      user: this.state.user,
      platform: this.platform,
      authType: "token",
      scopes: ["repo", "read:user"],
    };
  }

  async getBranch(
    branchName: string,
    repoPath: string,
  ): Promise<Branch | null> {
    const key = `${repoPath}:${branchName}`;
    return this.state.branches.get(key) ?? null;
  }

  async getCurrentBranch(repoPath: string): Promise<string> {
    const branch = this.state.currentBranch.get(repoPath);
    if (!branch) {
      throw new Error(`No current branch set for ${repoPath}`);
    }
    return branch;
  }

  async getRemoteUrl(repoPath: string, remoteName = "origin"): Promise<string> {
    const remotes = this.state.remoteUrls.get(repoPath);
    if (!remotes) {
      throw new Error(`No remotes configured for ${repoPath}`);
    }

    const url = remotes.get(remoteName);
    if (!url) {
      throw new Error(`Remote '${remoteName}' not found for ${repoPath}`);
    }

    return url;
  }

  async isAvailable(): Promise<boolean> {
    return this.state.platformAvailable;
  }

  /**
   * Test helper: Add a branch to state
   */
  public addBranch(
    branchName: string,
    repoPath: string,
    branch: Omit<Branch, "name">,
  ): void {
    const key = `${repoPath}:${branchName}`;
    this.state.branches.set(key, { name: branchName, ...branch });
  }

  /**
   * Test helper: Set current branch for a repo
   */
  public setCurrentBranch(repoPath: string, branchName: string): void {
    this.state.currentBranch.set(repoPath, branchName);
  }

  /**
   * Test helper: Set remote URL
   */
  public setRemoteUrl(repoPath: string, remoteName: string, url: string): void {
    if (!this.state.remoteUrls.has(repoPath)) {
      this.state.remoteUrls.set(repoPath, new Map());
    }
    this.state.remoteUrls.get(repoPath)?.set(remoteName, url);
  }

  /**
   * Test helper: Simulate PR conflicts
   */
  public setPRConflicts(prNumber: number, hasConflicts: boolean): void {
    const pr = this.state.prs.get(prNumber);
    if (pr) {
      pr.hasConflicts = hasConflicts;
      pr.mergeable = !hasConflicts;
    }
  }
}
