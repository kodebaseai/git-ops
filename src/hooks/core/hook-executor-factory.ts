/**
 * Factory for creating HookExecutor instances from Kodebase configuration
 */

import { loadConfig } from "@kodebase/config";
import type { HookExecutorConfig } from "../../utils/types.js";
import { HookExecutor } from "./hook-executor.js";

/**
 * Create a HookExecutor instance from Kodebase configuration file.
 *
 * Loads configuration from .kodebase/config.yml and applies hook settings.
 *
 * @param projectRoot - Project root directory (defaults to current working directory)
 * @param configPath - Optional path to config file (defaults to .kodebase/config.yml)
 * @param overrides - Optional config overrides
 * @returns Promise resolving to configured HookExecutor instance
 *
 * @example
 * ```ts
 * // Load from default config location
 * const executor = await createHookExecutor();
 *
 * // Load from custom config path
 * const executor = await createHookExecutor(process.cwd(), '.kodebase/custom-config.yml');
 *
 * // Load with overrides
 * const executor = await createHookExecutor(process.cwd(), undefined, {
 *   timeout: 60000,
 *   logErrors: false
 * });
 * ```
 */
export async function createHookExecutor(
  projectRoot: string = process.cwd(),
  configPath?: string,
  overrides?: Partial<HookExecutorConfig>,
): Promise<HookExecutor> {
  // Load configuration from file
  const config = await loadConfig(projectRoot, configPath);

  // Extract hooks configuration
  const hooksConfig = config.gitOps?.hooks;

  // Build executor config from loaded settings
  const executorConfig: HookExecutorConfig = {
    timeout: overrides?.timeout ?? 30000, // Default 30s, can be configured later
    nonBlocking: overrides?.nonBlocking ?? hooksConfig?.non_blocking ?? true,
    logErrors: overrides?.logErrors ?? hooksConfig?.log_errors ?? true,
    lifecycle: overrides?.lifecycle,
  };

  return new HookExecutor(executorConfig);
}

/**
 * Create a HookExecutor for a specific hook type using configuration.
 *
 * Respects both global hook settings and hook-specific configuration.
 *
 * @param hookType - Type of hook (e.g., 'post-merge', 'pre-commit')
 * @param projectRoot - Project root directory (defaults to current working directory)
 * @param configPath - Optional path to config file
 * @param overrides - Optional config overrides
 * @returns Promise resolving to configured HookExecutor instance
 *
 * @example
 * ```ts
 * // Create executor for post-merge hook
 * const executor = await createHookExecutorForType('post-merge');
 *
 * // Check if hook is enabled
 * const config = await loadConfig(process.cwd());
 * if (config.gitOps?.hooks?.post_merge?.enabled !== false) {
 *   await executor.executeHook('post-merge', context);
 * }
 * ```
 */
export async function createHookExecutorForType(
  hookType: string,
  projectRoot: string = process.cwd(),
  configPath?: string,
  overrides?: Partial<HookExecutorConfig>,
): Promise<HookExecutor> {
  // Load configuration
  const config = await loadConfig(projectRoot, configPath);
  const hooksConfig = config.gitOps?.hooks;

  // Get hook-specific config
  const hookKey = hookType.replace(/-/g, "_") as
    | "post_merge"
    | "post_checkout"
    | "pre_commit"
    | "pre_push";
  const hookConfig = hooksConfig?.[hookKey];

  // Build executor config with hook-specific settings
  const executorConfig: HookExecutorConfig = {
    timeout: overrides?.timeout ?? 30000,
    nonBlocking:
      overrides?.nonBlocking ??
      hookConfig?.non_blocking ??
      hooksConfig?.non_blocking ??
      true,
    logErrors: overrides?.logErrors ?? hooksConfig?.log_errors ?? true,
    lifecycle: overrides?.lifecycle,
  };

  return new HookExecutor(executorConfig);
}

/**
 * Check if a hook is enabled in configuration.
 *
 * A hook is enabled if:
 * - Global hooks.enabled is not false
 * - Hook-specific enabled is not false
 *
 * @param hookType - Type of hook to check
 * @param projectRoot - Project root directory (defaults to current working directory)
 * @param configPath - Optional path to config file
 * @returns Promise resolving to boolean indicating if hook is enabled
 *
 * @example
 * ```ts
 * if (await isHookEnabled('post-merge')) {
 *   const executor = await createHookExecutorForType('post-merge');
 *   await executor.executeHook('post-merge', context);
 * }
 * ```
 */
export async function isHookEnabled(
  hookType: string,
  projectRoot: string = process.cwd(),
  configPath?: string,
): Promise<boolean> {
  const config = await loadConfig(projectRoot, configPath);
  const hooksConfig = config.gitOps?.hooks;

  // Check global hooks enabled flag
  if (hooksConfig?.enabled === false) {
    return false;
  }

  // Check hook-specific enabled flag
  const hookKey = hookType.replace(/-/g, "_") as
    | "post_merge"
    | "post_checkout"
    | "pre_commit"
    | "pre_push";
  const hookConfig = hooksConfig?.[hookKey];

  // Hook is enabled by default unless explicitly disabled
  return hookConfig?.enabled !== false;
}
