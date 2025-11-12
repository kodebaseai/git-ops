/**
 * Git platform adapter interface and related type definitions
 */

import type { TGitPlatform, TMergeMethod, TReviewStatus } from "./constants.js";

/**
 * Options for creating a pull request
 */
export interface PRCreateOptions {
  /** Branch name for the PR (source branch) */
  branch?: string;
  /** PR title */
  title: string;
  /** PR body/description */
  body?: string;
  /** Whether to create as draft */
  draft?: boolean;
  /** Repository path */
  repoPath: string;
  /** Base branch (target branch, default: main) */
  baseBranch?: string;
  /** Labels to add */
  labels?: string[];
  /** Assignees */
  assignees?: string[];
  /** Reviewers */
  reviewers?: string[];
  /** Milestone */
  milestone?: string;
}

/**
 * Pull request information
 */
export interface PRInfo {
  /** PR number */
  number: number;
  /** PR state */
  state: string;
  /** PR title */
  title: string;
  /** PR body/description */
  body?: string;
  /** PR URL */
  url?: string;
  /** Source branch */
  sourceBranch?: string;
  /** Target branch */
  targetBranch?: string;
  /** Author username */
  author?: string;
  /** Created timestamp */
  createdAt?: Date;
  /** Last updated timestamp */
  updatedAt?: Date;
  /** Whether PR is in draft mode */
  isDraft?: boolean;
  /** Labels attached to the PR */
  labels?: string[];
  /** Assigned users */
  assignees?: string[];
  /** Requested reviewers */
  reviewers?: string[];
  /** Overall review status */
  reviewStatus?: TReviewStatus;
  /** Number of approvals received */
  approvals?: number;
  /** Whether the PR can be merged */
  mergeable?: boolean;
  /** Whether there are merge conflicts */
  hasConflicts?: boolean;
}

/**
 * Branch information
 */
export interface Branch {
  /** Branch name (short name, e.g., 'main', 'feature/foo') */
  name: string;
  /** Full ref name (e.g., 'refs/heads/main') */
  ref?: string;
  /** SHA hash of the latest commit on this branch */
  sha: string;
  /** Whether this branch has protection rules */
  protected?: boolean;
  /** Whether this is the repository's default branch */
  isDefault?: boolean;
  /** Remote tracking branch name (e.g., 'origin/main') */
  remote?: string;
  /** Number of commits ahead of the upstream branch */
  ahead?: number;
  /** Number of commits behind the upstream branch */
  behind?: number;
}

/**
 * Authentication status and information
 */
export interface AuthStatus {
  /** Whether authentication credentials are valid */
  authenticated: boolean;
  /** Authenticated user or account name */
  user?: string;
  /** Platform being authenticated against */
  platform: TGitPlatform;
  /** Type of authentication mechanism used */
  authType?: "token" | "oauth" | "ssh" | "unknown";
  /** Available API scopes or permissions */
  scopes?: string[];
  /** Error message if authentication failed */
  error?: string;
}

/**
 * Git platform adapter interface
 *
 * Provides a unified abstraction layer for interacting with different git platforms
 * (GitHub, GitLab, Bitbucket) for PR operations, authentication, and branch management.
 *
 * @remarks
 * This interface is designed to abstract platform-specific implementations while
 * maintaining compatibility across GitHub, GitLab, and Bitbucket. Platform-specific
 * features should be handled gracefully (e.g., returning null or throwing descriptive
 * errors for unsupported operations).
 *
 * ## Platform Compatibility Design
 *
 * The interface is designed with the following compatibility considerations:
 *
 * ### GitHub
 * - Full support for all methods
 * - Native draft PR support via `createDraftPR`
 * - Native auto-merge support via `enableAutoMerge`
 * - Rich API for branch protection, reviews, and PR metadata
 *
 * ### GitLab
 * - Full support for all methods
 * - Draft PRs are called "Merge Requests" with WIP/Draft status
 * - Auto-merge available through "Merge when pipeline succeeds"
 * - Similar feature parity with GitHub
 *
 * ### Bitbucket
 * - Core PR operations supported
 * - Draft PRs may be simulated via labels or title prefixes (e.g., "[WIP]")
 * - Auto-merge may not be natively supported (should throw descriptive error)
 * - Some metadata fields may have limited availability
 *
 * @example
 * Basic usage with GitHub:
 * ```typescript
 * const adapter: GitPlatformAdapter = new GitHubAdapter({
 *   token: process.env.GITHUB_TOKEN
 * });
 *
 * // Validate authentication
 * const authStatus = await adapter.validateAuth();
 * if (!authStatus.authenticated) {
 *   throw new Error('Not authenticated');
 * }
 *
 * // Create a draft PR
 * const pr = await adapter.createDraftPR({
 *   title: 'Feature: Add new component',
 *   body: 'This PR adds a new component',
 *   branch: 'feature/new-component',
 *   baseBranch: 'main',
 *   repoPath: '/path/to/repo'
 * });
 *
 * // Enable auto-merge
 * await adapter.enableAutoMerge(pr.number, {
 *   mergeMethod: 'squash',
 *   deleteBranch: true
 * });
 * ```
 */
export interface GitPlatformAdapter {
  /**
   * Platform type identifier
   *
   * @remarks
   * Used to identify which platform this adapter implements.
   * Possible values: 'github', 'gitlab', 'bitbucket'
   */
  platform: TGitPlatform;

  /**
   * Create a regular (non-draft) pull request
   *
   * @param options - PR creation options including title, body, branch, labels, etc.
   * @returns Promise resolving to created PR information
   *
   * @remarks
   * Creates a pull request that is immediately ready for review.
   * For draft PRs, use `createDraftPR` instead.
   *
   * The behavior of labels, assignees, and reviewers may vary by platform:
   * - GitHub: Full support for all metadata
   * - GitLab: Uses Merge Request terminology, similar features
   * - Bitbucket: May have limited support for some metadata fields
   *
   * @throws {Error} If PR creation fails (e.g., branch doesn't exist, insufficient permissions, authentication failed)
   *
   * @example
   * ```typescript
   * const pr = await adapter.createPR({
   *   title: 'Fix: Resolve parser bug',
   *   body: 'This fixes the parser bug by improving error handling',
   *   branch: 'fix/parser-bug',
   *   baseBranch: 'main',
   *   repoPath: '/path/to/repo',
   *   labels: ['bug', 'priority-high'],
   *   reviewers: ['user1', 'user2']
   * });
   * console.log(`PR created: ${pr.url}`);
   * ```
   */
  createPR(options: PRCreateOptions): Promise<PRInfo>;

  /**
   * Create a draft pull request
   *
   * @param options - PR creation options (same as createPR)
   * @returns Promise resolving to created PR information with isDraft: true
   *
   * @remarks
   * Creates a pull request in draft mode, which prevents merging until marked as ready.
   * Draft PRs are useful for:
   * - Work in progress that needs early feedback
   * - PRs that aren't ready for formal review
   * - Testing CI/CD pipelines before requesting review
   *
   * Platform-specific behavior:
   * - GitHub: Native draft PR support
   * - GitLab: Uses WIP or Draft prefix on Merge Request title
   * - Bitbucket: May simulate with labels (e.g., "WIP") or title prefix (e.g., "[WIP]")
   *
   * @throws {Error} If draft PR creation fails
   *
   * @example
   * ```typescript
   * const draftPR = await adapter.createDraftPR({
   *   title: 'WIP: New feature implementation',
   *   body: 'Work in progress, early feedback welcome',
   *   branch: 'feature/wip',
   *   baseBranch: 'main',
   *   repoPath: '/path/to/repo'
   * });
   * console.log(`Draft PR created: ${draftPR.url}`);
   * ```
   */
  createDraftPR(options: PRCreateOptions): Promise<PRInfo>;

  /**
   * Get pull request information by number or identifier
   *
   * @param prIdentifier - PR number or platform-specific identifier
   * @returns Promise resolving to PR information, or null if not found
   *
   * @remarks
   * Retrieves current information about a PR including its state, metadata, and review status.
   * Returns null if the PR doesn't exist (not an error condition).
   *
   * The prIdentifier parameter:
   * - Can be a numeric PR/MR number (most common)
   * - May accept platform-specific identifiers (e.g., "owner/repo#123")
   *
   * @example
   * ```typescript
   * const pr = await adapter.getPR(123);
   * if (pr) {
   *   console.log(`PR #${pr.number}: ${pr.title}`);
   *   console.log(`State: ${pr.state}`);
   *   console.log(`Author: ${pr.author}`);
   *   console.log(`Mergeable: ${pr.mergeable}`);
   * } else {
   *   console.log('PR not found');
   * }
   * ```
   */
  getPR(prIdentifier: string | number): Promise<PRInfo | null>;

  /**
   * Merge a pull request
   *
   * @param prNumber - PR number to merge
   * @param options - Optional merge configuration
   * @param options.method - Merge method: 'merge', 'squash', or 'rebase'
   * @param options.message - Custom merge commit message
   * @param options.deleteBranch - Whether to delete the source branch after merging
   * @returns Promise that resolves when merge completes
   *
   * @remarks
   * Merges the specified PR using the given merge method.
   *
   * Merge methods:
   * - 'merge': Creates a merge commit (preserves all commits)
   * - 'squash': Squashes all commits into one
   * - 'rebase': Rebases and fast-forwards
   *
   * The default merge method depends on platform and repository settings.
   *
   * @throws {Error} If merge fails due to:
   * - Merge conflicts
   * - PR not in mergeable state
   * - Insufficient permissions
   * - Required checks not passing
   * - Required approvals not met
   *
   * @example
   * ```typescript
   * await adapter.mergePR(123, {
   *   method: 'squash',
   *   message: 'feat: Add new authentication system',
   *   deleteBranch: true
   * });
   * console.log('PR merged successfully');
   * ```
   */
  mergePR(
    prNumber: number,
    options?: {
      method?: TMergeMethod;
      message?: string;
      deleteBranch?: boolean;
    },
  ): Promise<void>;

  /**
   * Enable auto-merge for a pull request
   *
   * @param prNumber - PR number to enable auto-merge for
   * @param options - Optional auto-merge configuration
   * @param options.mergeMethod - Merge method to use when auto-merging
   * @param options.deleteBranch - Whether to delete branch after auto-merge
   * @returns Promise that resolves when auto-merge is enabled
   *
   * @remarks
   * Enables automatic merging when all conditions are met:
   * - All required status checks pass
   * - All required approvals are obtained
   * - No merge conflicts exist
   * - Branch is up to date (if required)
   *
   * Platform support:
   * - GitHub: Native auto-merge support
   * - GitLab: "Merge when pipeline succeeds" feature
   * - Bitbucket: May not be supported (will throw descriptive error)
   *
   * @throws {Error} If:
   * - Platform doesn't support auto-merge
   * - PR is not in a state that allows auto-merge
   * - Insufficient permissions
   *
   * @example
   * ```typescript
   * try {
   *   await adapter.enableAutoMerge(123, {
   *     mergeMethod: 'squash',
   *     deleteBranch: true
   *   });
   *   console.log('Auto-merge enabled. PR will merge when ready.');
   * } catch (error) {
   *   console.error('Auto-merge not supported:', error.message);
   * }
   * ```
   */
  enableAutoMerge(
    prNumber: number,
    options?: {
      mergeMethod?: TMergeMethod;
      deleteBranch?: boolean;
    },
  ): Promise<void>;

  /**
   * Validate authentication with the platform
   *
   * @returns Promise resolving to authentication status and user information
   *
   * @remarks
   * Checks if the current credentials are valid and returns information about
   * the authenticated user/account and available permissions/scopes.
   *
   * This method should be called:
   * - Before performing authenticated operations
   * - To verify credentials during application startup
   * - To check permission scopes before specific operations
   *
   * A failed authentication (authenticated: false) is not an error - it's a normal
   * response indicating invalid or missing credentials.
   *
   * @example
   * ```typescript
   * const authStatus = await adapter.validateAuth();
   *
   * if (!authStatus.authenticated) {
   *   console.error(`Authentication failed: ${authStatus.error}`);
   *   process.exit(1);
   * }
   *
   * console.log(`Authenticated as: ${authStatus.user}`);
   * console.log(`Platform: ${authStatus.platform}`);
   * console.log(`Auth type: ${authStatus.authType}`);
   *
   * if (authStatus.scopes) {
   *   console.log(`Available scopes: ${authStatus.scopes.join(', ')}`);
   * }
   * ```
   */
  validateAuth(): Promise<AuthStatus>;

  /**
   * Get information about a specific branch
   *
   * @param branchName - Name of the branch to retrieve (e.g., 'main', 'feature/foo')
   * @param repoPath - Local repository path
   * @returns Promise resolving to branch information, or null if not found
   *
   * @remarks
   * Retrieves information about a specific branch including:
   * - Latest commit SHA
   * - Protection status (if available via API)
   * - Tracking information (ahead/behind remote)
   * - Whether it's the default branch
   *
   * This method may combine local git operations with platform API calls
   * to provide complete branch information.
   *
   * @example
   * ```typescript
   * const branch = await adapter.getBranch('feature/new-component', '/path/to/repo');
   *
   * if (!branch) {
   *   console.log('Branch not found');
   *   return;
   * }
   *
   * console.log(`Branch: ${branch.name}`);
   * console.log(`SHA: ${branch.sha}`);
   * console.log(`Protected: ${branch.protected}`);
   * console.log(`Default: ${branch.isDefault}`);
   *
   * if (branch.ahead) {
   *   console.log(`Ahead by ${branch.ahead} commits`);
   * }
   * if (branch.behind) {
   *   console.log(`Behind by ${branch.behind} commits`);
   * }
   * ```
   */
  getBranch(branchName: string, repoPath: string): Promise<Branch | null>;

  /**
   * Get the current branch name in the local repository
   *
   * @param repoPath - Local repository path
   * @returns Promise resolving to the current branch name
   *
   * @remarks
   * Returns the name of the currently checked out branch in the local repository.
   * This is a local git operation and does not require authentication or network access.
   *
   * Equivalent to: `git rev-parse --abbrev-ref HEAD`
   *
   * @throws {Error} If:
   * - Path is not a git repository
   * - Repository is in detached HEAD state (returns SHA instead)
   * - Git operation fails
   *
   * @example
   * ```typescript
   * const currentBranch = await adapter.getCurrentBranch('/path/to/repo');
   * console.log(`Currently on branch: ${currentBranch}`);
   * ```
   */
  getCurrentBranch(repoPath: string): Promise<string>;

  /**
   * Get the remote URL for the repository
   *
   * @param repoPath - Local repository path
   * @param remoteName - Name of the remote (default: 'origin')
   * @returns Promise resolving to the remote URL
   *
   * @remarks
   * Retrieves the URL of the specified remote (typically 'origin').
   * The URL format depends on how the remote was configured:
   * - HTTPS: `https://github.com/owner/repo.git`
   * - SSH: `git@github.com:owner/repo.git`
   *
   * This is a local git operation and does not require authentication or network access.
   *
   * Equivalent to: `git remote get-url <remoteName>`
   *
   * @throws {Error} If:
   * - Path is not a git repository
   * - Remote doesn't exist
   * - Git operation fails
   *
   * @example
   * ```typescript
   * const remoteUrl = await adapter.getRemoteUrl('/path/to/repo');
   * console.log(`Remote URL: ${remoteUrl}`);
   *
   * // Get URL for a different remote
   * const upstreamUrl = await adapter.getRemoteUrl('/path/to/repo', 'upstream');
   * console.log(`Upstream URL: ${upstreamUrl}`);
   * ```
   */
  getRemoteUrl(repoPath: string, remoteName?: string): Promise<string>;

  /**
   * Check if the platform is available and accessible
   *
   * @returns Promise resolving to true if platform is available, false otherwise
   *
   * @remarks
   * Performs a lightweight check to verify the platform is accessible.
   * This typically involves:
   * - Checking network connectivity
   * - Verifying the platform API is reachable
   * - Confirming the platform is not experiencing an outage
   *
   * This method does NOT validate authentication - use `validateAuth()` for that.
   *
   * Useful for:
   * - Detecting network issues before operations
   * - Handling platform outages gracefully
   * - Implementing retry logic
   * - Circuit breaker patterns
   *
   * @example
   * ```typescript
   * const available = await adapter.isAvailable();
   *
   * if (!available) {
   *   console.warn('Platform is currently unavailable. Retrying in 30s...');
   *   await new Promise(resolve => setTimeout(resolve, 30000));
   *   return;
   * }
   *
   * // Proceed with operations
   * const pr = await adapter.createPR({...});
   * ```
   */
  isAvailable(): Promise<boolean>;

  /**
   * Mark a draft pull request as ready for review
   *
   * @param prNumber - PR number to mark as ready
   * @returns Promise that resolves when PR is marked as ready
   *
   * @remarks
   * Converts a draft PR to a ready-for-review state. This allows the PR to be merged
   * and typically notifies reviewers that it's ready for their attention.
   *
   * Platform-specific behavior:
   * - GitHub: Uses `gh pr ready` command
   * - GitLab: Removes WIP/Draft prefix from Merge Request title
   * - Bitbucket: May not be supported (will throw descriptive error)
   *
   * @throws {Error} If:
   * - PR is not a draft
   * - PR doesn't exist
   * - Insufficient permissions
   * - Platform doesn't support draft PRs
   *
   * @example
   * ```typescript
   * // Create draft PR
   * const pr = await adapter.createDraftPR({
   *   title: 'WIP: New feature',
   *   body: 'Work in progress',
   *   branch: 'feature/wip',
   *   baseBranch: 'main',
   *   repoPath: '/path/to/repo'
   * });
   *
   * // Later, mark as ready
   * await adapter.markPRReady(pr.number);
   * console.log('PR is now ready for review');
   * ```
   */
  markPRReady(prNumber: number): Promise<void>;

  /**
   * Find a pull request for a specific branch
   *
   * @param branchName - Name of the branch to find PR for
   * @returns Promise resolving to PR information, or null if no PR found
   *
   * @remarks
   * Searches for an existing pull request that has the specified branch as its source branch.
   * This is useful for:
   * - Checking if a PR already exists before creating a new one
   * - Finding the PR associated with the current working branch
   * - Detecting user-created PRs
   *
   * Returns the most recent PR if multiple PRs exist for the same branch.
   *
   * @example
   * ```typescript
   * // Check if PR exists for current branch
   * const existingPR = await adapter.findPRForBranch('feature/new-component');
   *
   * if (existingPR) {
   *   console.log(`PR already exists: ${existingPR.url}`);
   *   console.log(`Status: ${existingPR.isDraft ? 'Draft' : 'Ready'}`);
   * } else {
   *   // Create new PR
   *   const newPR = await adapter.createDraftPR({...});
   * }
   * ```
   */
  findPRForBranch(branchName: string): Promise<PRInfo | null>;
}
