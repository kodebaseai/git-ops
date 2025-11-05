/**
 * @kodebase/git-ops
 *
 * Git platform abstraction for GitHub, GitLab, and Bitbucket operations
 */

export { GitHubAdapter, type GitHubAdapterConfig } from "./adapters/github.js";
export {
  GitLabAdapter,
  type GitLabAdapterConfig,
  GitLabNotImplementedError,
} from "./adapters/gitlab.js";
export {
  AdapterCreateError,
  createAdapter,
  getMergeDefaults,
  getPRCreationDefaults,
} from "./factory.js";
export {
  createHookExecutor,
  createHookExecutorForType,
  createHookInstaller,
  type GitHookType,
  type HookContext,
  type HookErrorCallback,
  type HookExecutionMetadata,
  type HookExecutionStatus,
  HookExecutor,
  type HookExecutorConfig,
  type HookInfo,
  HookInstaller,
  type HookInstallerConfig,
  type HookLifecycleCallback,
  type HookResult,
  type IdempotencyConfig,
  IdempotencyTracker,
  type InstallResult,
  isHookEnabled,
  type ShouldExecuteResult,
  type UninstallResult,
} from "./hooks/index.js";
export type {
  AuthStatus,
  Branch,
  GitPlatformAdapter,
  PRCreateOptions,
  PRInfo,
  TGitPlatform,
  TMergeMethod,
  TPRState,
  TReviewStatus,
} from "./types/index.js";
export {
  CGitPlatform,
  CMergeMethod,
  CPRState,
  CReviewStatus,
} from "./types/index.js";
