/**
 * Hook execution framework for git operations
 */

// Utils and constants
export type { THookEvent, THookTrigger } from "../utils/constants.js";
export { CHookEvent, CHookTrigger } from "../utils/constants.js";
export type {
  HookContext,
  HookErrorCallback,
  HookExecutorConfig,
  HookLifecycleCallback,
  HookResult,
} from "../utils/types.js";
export type {
  ImpactedArtifact,
  ImpactOperation,
  ImpactReport,
  ImpactType,
} from "./analysis/impact-analyzer.js";
// Analysis
export { ImpactAnalyzer } from "./analysis/impact-analyzer.js";
// Cascade
export { createCascadeCommit } from "./cascade/cascade-commit.js";
export type {
  CascadeCommitAttribution,
  CreateCascadeCommitOptions,
  CreateCascadeCommitResult,
} from "./cascade/cascade-commit-types.js";
// Core hook system
export { HookExecutor } from "./core/hook-executor.js";
export {
  createHookExecutor,
  createHookExecutorForType,
  isHookEnabled,
} from "./core/hook-executor-factory.js";
export { createHookInstaller, HookInstaller } from "./core/hook-installer.js";
export type {
  GitHookType,
  HookInfo,
  HookInstallerConfig,
  InstallResult,
  UninstallResult,
} from "./core/hook-installer-types.js";
export { HookLogger } from "./core/hook-logger.js";
export { IdempotencyTracker } from "./core/idempotency-tracker.js";
export type {
  HookExecutionMetadata,
  HookExecutionStatus,
  IdempotencyConfig,
  ShouldExecuteResult,
} from "./core/idempotency-types.js";
export type {
  HookLogEntry,
  HookLoggerConfig,
  TLogLevel,
} from "./core/logger-types.js";
export { CLogLevel } from "./core/logger-types.js";
// Detection
export { PostCheckoutDetector } from "./detection/post-checkout-detector.js";
export type {
  CheckoutDetectionResult,
  CheckoutMetadata,
  PostCheckoutConfig,
} from "./detection/post-checkout-types.js";
export {
  createPostMergeDetector,
  PostMergeDetector,
} from "./detection/post-merge-detector.js";
export type {
  MergeDetectionResult,
  MergeMetadata,
  PostMergeConfig,
} from "./detection/post-merge-types.js";
// Draft PR
export { DraftPRService } from "./draft-pr/draft-pr-service.js";
export type {
  DraftPRConfig,
  DraftPRResult,
} from "./draft-pr/draft-pr-types.js";
// Orchestration
export { PostCheckoutOrchestrator } from "./orchestration/post-checkout-orchestrator.js";
export type {
  PostCheckoutOrchestratorConfig,
  PostCheckoutOrchestratorResult,
} from "./orchestration/post-checkout-orchestrator-types.js";
export {
  createPostMergeOrchestrator,
  PostMergeOrchestrator,
} from "./orchestration/post-merge-orchestrator.js";
export type {
  ExecuteOrchestrationOptions,
  OrchestrationResult,
  PostMergeOrchestratorConfig,
} from "./orchestration/post-merge-orchestrator-types.js";
export {
  createStrategyExecutor,
  StrategyExecutor,
} from "./orchestration/strategy-executor.js";
export type {
  ExecuteStrategyOptions,
  StrategyExecutionResult,
  StrategyExecutorConfig,
} from "./orchestration/strategy-executor-types.js";
// Validation
export type { BranchValidationResult } from "./validation/branch-validator.js";
export { BranchValidator } from "./validation/branch-validator.js";
export type {
  PreCommitError,
  PreCommitErrorType,
  PreCommitValidationOptions,
  PreCommitValidationResult,
} from "./validation/pre-commit-validator.js";
export { validatePreCommit } from "./validation/pre-commit-validator.js";
export type {
  PrePushValidationOptions,
  PrePushValidationResult,
  PrePushWarning,
  PrePushWarningType,
} from "./validation/pre-push-validator.js";
export { validatePrePush } from "./validation/pre-push-validator.js";
