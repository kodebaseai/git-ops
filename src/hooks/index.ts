/**
 * Hook execution framework for git operations
 */

export { HookExecutor } from "./hook-executor.js";
export {
  createHookExecutor,
  createHookExecutorForType,
  isHookEnabled,
} from "./hook-executor-factory.js";
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
