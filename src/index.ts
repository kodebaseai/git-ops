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
  type CheckoutDetectionResult,
  type CheckoutMetadata,
  CLogLevel,
  createHookExecutor,
  createHookExecutorForType,
  createHookInstaller,
  createPostMergeDetector,
  createPostMergeOrchestrator,
  type ExecuteOrchestrationOptions,
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
  type HookLogEntry,
  HookLogger,
  type HookLoggerConfig,
  type HookResult,
  type IdempotencyConfig,
  IdempotencyTracker,
  type InstallResult,
  isHookEnabled,
  type MergeDetectionResult,
  type MergeMetadata,
  type OrchestrationResult,
  type PostCheckoutConfig,
  // Detectors
  PostCheckoutDetector,
  // Orchestrators
  PostCheckoutOrchestrator,
  type PostCheckoutOrchestratorConfig,
  type PostCheckoutOrchestratorResult,
  type PostMergeConfig,
  PostMergeDetector,
  PostMergeOrchestrator,
  type PostMergeOrchestratorConfig,
  type ShouldExecuteResult,
  type TLogLevel,
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
