/**
 * Types for hook idempotency tracking via artifact event logs
 */

/**
 * Hook execution status stored in event metadata
 */
export type HookExecutionStatus = "success" | "failed";

/**
 * Metadata for hook execution events stored in artifact event log
 */
export interface HookExecutionMetadata {
  /** Name of the hook that was executed */
  hook: string;
  /** Execution status */
  status: HookExecutionStatus;
  /** Execution duration in milliseconds */
  duration?: number;
  /** Error message if status is 'failed' */
  error?: string;
  /** Artifact event type that triggered this hook (e.g., 'completed', 'in_progress') */
  artifactEvent?: string;
}

/**
 * Configuration for idempotency tracker
 */
export interface IdempotencyConfig {
  /** Retry timeout in milliseconds (default: 5 minutes) */
  retryTimeout?: number;
  /** Whether to allow retries for failed hooks (default: true) */
  allowRetry?: boolean;
}

/**
 * Result of shouldExecuteHook check
 */
export interface ShouldExecuteResult {
  /** Whether the hook should be executed */
  shouldExecute: boolean;
  /** Reason for the decision */
  reason: string;
  /** Last execution metadata if available */
  lastExecution?: HookExecutionMetadata & { timestamp: string };
}
