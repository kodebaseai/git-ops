/**
 * Hook execution framework for git operations
 */

export type { THookEvent, THookTrigger } from "./constants.js";
export { CHookEvent, CHookTrigger } from "./constants.js";
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
export { IdempotencyTracker } from "./idempotency-tracker.js";
export type {
  HookExecutionMetadata,
  HookExecutionStatus,
  IdempotencyConfig,
  ShouldExecuteResult,
} from "./idempotency-types.js";
export type {
  HookContext,
  HookErrorCallback,
  HookExecutorConfig,
  HookLifecycleCallback,
  HookResult,
} from "./types.js";
