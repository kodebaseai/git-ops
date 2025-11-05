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
  type HookContext,
  type HookErrorCallback,
  type HookExecutionMetadata,
  type HookExecutionStatus,
  HookExecutor,
  type HookExecutorConfig,
  type HookLifecycleCallback,
  type HookResult,
  type IdempotencyConfig,
  IdempotencyTracker,
  isHookEnabled,
  type ShouldExecuteResult,
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
