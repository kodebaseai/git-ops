/**
 * Hook execution framework with non-blocking execution and error handling
 */

import type { HookContext, HookExecutorConfig, HookResult } from "./types.js";

/**
 * Default timeout for hook execution (30 seconds)
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * Executes git hooks with non-blocking execution, timeout support, and lifecycle callbacks.
 *
 * @example
 * ```ts
 * const executor = new HookExecutor({
 *   timeout: 30000,
 *   lifecycle: {
 *     beforeExecute: (name, ctx) => console.log(`Running ${name}...`),
 *     onError: (name, ctx, err) => console.error(`${name} failed:`, err)
 *   }
 * });
 *
 * const result = await executor.executeHook('post-merge', {
 *   artifactId: 'A.1.2',
 *   eventType: 'completed',
 *   timestamp: '2025-11-05T14:00:00Z'
 * });
 * ```
 */
export class HookExecutor {
  private readonly config: Required<Omit<HookExecutorConfig, "lifecycle">> & {
    lifecycle?: HookExecutorConfig["lifecycle"];
  };

  constructor(config: HookExecutorConfig = {}) {
    this.config = {
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      nonBlocking: config.nonBlocking ?? true,
      logErrors: config.logErrors ?? true,
      lifecycle: {
        beforeExecute: config.lifecycle?.beforeExecute,
        afterExecute: config.lifecycle?.afterExecute,
        onError: config.lifecycle?.onError,
      },
    };
  }

  /**
   * Execute a hook with the given context.
   *
   * In non-blocking mode (default), errors are caught and logged but never thrown.
   * In blocking mode, errors are thrown to the caller.
   *
   * @param hookName - Name of the hook to execute
   * @param context - Context data for the hook execution
   * @returns Promise resolving to hook execution result
   */
  async executeHook(
    hookName: string,
    context: HookContext,
  ): Promise<HookResult> {
    const startTime = performance.now();

    try {
      // Call beforeExecute lifecycle hook if provided
      if (this.config.lifecycle?.beforeExecute) {
        await this.config.lifecycle.beforeExecute(hookName, context);
      }

      // Execute the hook with timeout
      const result = await this.executeWithTimeout(hookName, context);

      // Call afterExecute lifecycle hook if provided
      if (this.config.lifecycle?.afterExecute) {
        await this.config.lifecycle.afterExecute(hookName, context);
      }

      const duration = performance.now() - startTime;

      return {
        success: true,
        duration,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      const err = error instanceof Error ? error : new Error(String(error));

      // Call onError lifecycle hook if provided
      if (this.config.lifecycle?.onError) {
        await this.config.lifecycle.onError(hookName, context, err);
      }

      // Log error if configured
      if (this.config.logErrors) {
        console.error(`Hook "${hookName}" failed:`, err.message);
      }

      // In non-blocking mode, return error result instead of throwing
      if (this.config.nonBlocking) {
        return {
          success: false,
          duration,
          error: err.message,
        };
      }

      // In blocking mode, re-throw the error
      throw err;
    }
  }

  /**
   * Execute multiple hooks in parallel.
   *
   * All hooks execute independently - failures in one hook don't affect others.
   *
   * @param hooks - Array of hook names to execute
   * @param context - Context data for hook execution
   * @returns Promise resolving to array of hook results
   */
  async executeHooksParallel(
    hooks: string[],
    context: HookContext,
  ): Promise<HookResult[]> {
    const results = await Promise.allSettled(
      hooks.map((hook) => this.executeHook(hook, context)),
    );

    return results.map((result) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      // In blocking mode, executeHook throws - convert to failed result
      return {
        success: false,
        duration: 0,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      };
    });
  }

  /**
   * Execute multiple hooks sequentially.
   *
   * Hooks execute in order. If a hook fails in blocking mode, subsequent hooks won't execute.
   *
   * @param hooks - Array of hook names to execute in order
   * @param context - Context data for hook execution
   * @returns Promise resolving to array of hook results
   */
  async executeHooksSequential(
    hooks: string[],
    context: HookContext,
  ): Promise<HookResult[]> {
    const results: HookResult[] = [];

    for (const hook of hooks) {
      const result = await this.executeHook(hook, context);
      results.push(result);

      // In blocking mode, stop on first failure
      if (!this.config.nonBlocking && !result.success) {
        break;
      }
    }

    return results;
  }

  /**
   * Execute a hook implementation with timeout support.
   *
   * @param hookName - Name of the hook
   * @param context - Hook execution context
   * @returns Promise resolving to execution output
   */
  private async executeWithTimeout(
    hookName: string,
    context: HookContext,
  ): Promise<{ stdout?: string; stderr?: string }> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(
            `Hook "${hookName}" timed out after ${this.config.timeout}ms`,
          ),
        );
      }, this.config.timeout);

      // Simulate hook execution (in real implementation, this would call actual hook scripts)
      // For now, we'll resolve immediately with empty output
      Promise.resolve({ stdout: "", stderr: "" })
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
}
