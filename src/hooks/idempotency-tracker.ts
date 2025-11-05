/**
 * Idempotency tracker for hook execution via artifact event log inspection.
 *
 * Prevents duplicate hook executions by inspecting artifact event logs.
 * Supports retry logic for failed hooks after a configurable timeout.
 */

import type { TEvent } from "@kodebase/core";
import type {
  HookExecutionMetadata,
  IdempotencyConfig,
  ShouldExecuteResult,
} from "./idempotency-types.js";

/**
 * Default retry timeout: 5 minutes
 */
const DEFAULT_RETRY_TIMEOUT = 5 * 60 * 1000;

/**
 * Tracks hook execution idempotency using artifact event logs.
 *
 * Prevents duplicate hook executions by checking if a hook has already
 * been executed successfully for the current artifact state. Allows retries
 * for failed hooks after a configurable timeout.
 *
 * @example
 * ```ts
 * import { IdempotencyTracker } from "@kodebase/git-ops";
 * import { readArtifact } from "@kodebase/core";
 *
 * const tracker = new IdempotencyTracker({ retryTimeout: 300000 }); // 5 min
 * const artifact = await readArtifact(artifactPath);
 *
 * const result = tracker.shouldExecuteHook(artifact.metadata.events, "post-merge");
 * if (result.shouldExecute) {
 *   await executeHook("post-merge", context);
 * }
 * ```
 */
export class IdempotencyTracker {
  private readonly config: Required<IdempotencyConfig>;

  constructor(config: IdempotencyConfig = {}) {
    this.config = {
      retryTimeout: config.retryTimeout ?? DEFAULT_RETRY_TIMEOUT,
      allowRetry: config.allowRetry ?? true,
    };
  }

  /**
   * Determines if a hook should be executed based on event log history.
   *
   * Returns false if:
   * - Hook was already executed successfully
   * - Hook failed recently (within retry timeout)
   *
   * Returns true if:
   * - Hook has never been executed
   * - Hook failed and retry timeout has passed
   *
   * @param events - Array of artifact events from event log
   * @param hookName - Name of the hook to check
   * @param currentTimestamp - Current timestamp (defaults to now, injectable for testing)
   * @returns Result indicating whether to execute and why
   */
  shouldExecuteHook(
    events: TEvent[],
    hookName: string,
    currentTimestamp?: string,
  ): ShouldExecuteResult {
    const now = currentTimestamp ? new Date(currentTimestamp) : new Date();

    // Find all hook execution events for this hook
    const hookExecutions = this.findHookExecutions(events, hookName);
    const lastExecution = hookExecutions[hookExecutions.length - 1];

    if (!lastExecution) {
      return {
        shouldExecute: true,
        reason: "Hook has never been executed",
      };
    }

    const metadata = lastExecution.event.metadata as HookExecutionMetadata;

    // If last execution was successful, don't re-execute
    if (metadata.status === "success") {
      return {
        shouldExecute: false,
        reason: "Hook already executed successfully",
        lastExecution: {
          ...metadata,
          timestamp: lastExecution.event.timestamp,
        },
      };
    }

    // Last execution failed - check if retry is allowed
    if (!this.config.allowRetry) {
      return {
        shouldExecute: false,
        reason: "Hook failed and retry is disabled",
        lastExecution: {
          ...metadata,
          timestamp: lastExecution.event.timestamp,
        },
      };
    }

    // Check if retry timeout has passed
    const lastExecutionTime = new Date(lastExecution.event.timestamp);
    const timeSinceFailure = now.getTime() - lastExecutionTime.getTime();

    if (timeSinceFailure < this.config.retryTimeout) {
      return {
        shouldExecute: false,
        reason: `Hook failed recently (${Math.round(timeSinceFailure / 1000)}s ago), retry timeout not reached`,
        lastExecution: {
          ...metadata,
          timestamp: lastExecution.event.timestamp,
        },
      };
    }

    // Retry timeout has passed, allow re-execution
    return {
      shouldExecute: true,
      reason: `Hook failed ${Math.round(timeSinceFailure / 1000)}s ago, retry timeout passed`,
      lastExecution: {
        ...metadata,
        timestamp: lastExecution.event.timestamp,
      },
    };
  }

  /**
   * Creates an event object for recording hook execution in artifact event log.
   *
   * This event should be appended to the artifact's event log using ArtifactService.
   *
   * @param hookName - Name of the hook that was executed
   * @param status - Execution status ('success' or 'failed')
   * @param actor - Actor performing the hook execution
   * @param metadata - Additional execution metadata
   * @returns Event object ready to be appended to artifact
   *
   * @example
   * ```ts
   * const executionEvent = tracker.createHookExecutionEvent(
   *   "post-merge",
   *   "success",
   *   "agent.hooks",
   *   { duration: 1250, artifactEvent: "completed" }
   * );
   * await artifactService.appendEvent({ id: "A.1.2", event: executionEvent });
   * ```
   */
  createHookExecutionEvent(
    hookName: string,
    status: "success" | "failed",
    actor: string,
    metadata: Partial<HookExecutionMetadata> = {},
  ): TEvent {
    const now = new Date().toISOString();

    // Custom event type extending TEvent - event:'hook_executed' is not in standard set
    // This will be stored in artifact event log with custom metadata
    return {
      event: "hook_executed" as unknown as TEvent["event"],
      timestamp: now,
      actor,
      trigger: "hook_completed" as unknown as TEvent["trigger"],
      metadata: {
        hook: hookName,
        status,
        ...metadata,
      } as unknown as TEvent["metadata"],
    };
  }

  /**
   * Finds all hook execution events for a specific hook in the event log.
   *
   * @param events - Array of artifact events
   * @param hookName - Name of the hook to find
   * @returns Array of events with indices, sorted chronologically
   */
  private findHookExecutions(
    events: TEvent[],
    hookName: string,
  ): Array<{ event: TEvent; index: number }> {
    return events
      .map((event, index) => ({ event, index }))
      .filter((item) => {
        // Check if this is a hook execution event (custom event type)
        if (item.event.event !== "hook_executed") {
          return false;
        }

        // Check if metadata exists and is valid
        if (!item.event.metadata || typeof item.event.metadata !== "object") {
          return false;
        }

        // Check if it's for the hook we're looking for
        const metadata = item.event.metadata as HookExecutionMetadata;
        return metadata.hook === hookName;
      });
  }
}
