/**
 * Hook execution framework for git operations
 */

export { HookExecutor } from "./hook-executor.js";
export {
  createHookExecutor,
  createHookExecutorForType,
  isHookEnabled,
} from "./hook-executor-factory.js";
export type {
  HookContext,
  HookErrorCallback,
  HookExecutorConfig,
  HookLifecycleCallback,
  HookResult,
} from "./types.js";
