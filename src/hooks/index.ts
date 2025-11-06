/**
 * Hook execution framework for git operations
 */

export type { BranchValidationResult } from "./branch-validator.js";
export { BranchValidator } from "./branch-validator.js";
export { createCascadeCommit } from "./cascade-commit.js";
export type {
  CascadeCommitAttribution,
  CreateCascadeCommitOptions,
  CreateCascadeCommitResult,
} from "./cascade-commit-types.js";
export type { THookEvent, THookTrigger } from "./constants.js";
export { CHookEvent, CHookTrigger } from "./constants.js";
export { DraftPRService } from "./draft-pr-service.js";
export type { DraftPRConfig, DraftPRResult } from "./draft-pr-types.js";
export { HookExecutor } from "./hook-executor.js";
export {
  createHookExecutor,
  createHookExecutorForType,
  isHookEnabled,
} from "./hook-executor-factory.js";
export { createHookInstaller, HookInstaller } from "./hook-installer.js";
export type {
  GitHookType,
  HookInfo,
  HookInstallerConfig,
  InstallResult,
  UninstallResult,
} from "./hook-installer-types.js";
export { HookLogger } from "./hook-logger.js";
export { IdempotencyTracker } from "./idempotency-tracker.js";
export type {
  HookExecutionMetadata,
  HookExecutionStatus,
  IdempotencyConfig,
  ShouldExecuteResult,
} from "./idempotency-types.js";
export type {
  HookLogEntry,
  HookLoggerConfig,
  TLogLevel,
} from "./logger-types.js";
export { CLogLevel } from "./logger-types.js";
export { PostCheckoutDetector } from "./post-checkout-detector.js";
export { PostCheckoutOrchestrator } from "./post-checkout-orchestrator.js";
export type {
  PostCheckoutOrchestratorConfig,
  PostCheckoutOrchestratorResult,
} from "./post-checkout-orchestrator-types.js";
export type {
  CheckoutDetectionResult,
  CheckoutMetadata,
  PostCheckoutConfig,
} from "./post-checkout-types.js";
export {
  createPostMergeDetector,
  PostMergeDetector,
} from "./post-merge-detector.js";
export {
  createPostMergeOrchestrator,
  PostMergeOrchestrator,
} from "./post-merge-orchestrator.js";
export type {
  ExecuteOrchestrationOptions,
  OrchestrationResult,
  PostMergeOrchestratorConfig,
} from "./post-merge-orchestrator-types.js";
export type {
  MergeDetectionResult,
  MergeMetadata,
  PostMergeConfig,
} from "./post-merge-types.js";
export {
  createStrategyExecutor,
  StrategyExecutor,
} from "./strategy-executor.js";
export type {
  ExecuteStrategyOptions,
  StrategyExecutionResult,
  StrategyExecutorConfig,
} from "./strategy-executor-types.js";
export type {
  HookContext,
  HookErrorCallback,
  HookExecutorConfig,
  HookLifecycleCallback,
  HookResult,
} from "./types.js";
