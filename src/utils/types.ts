/**
 * Hook system types for git operations
 */

import type { HookLogger } from "../hooks/core/hook-logger.js";

/**
 * Context passed to hook executors
 */
export interface HookContext {
  /** Artifact ID associated with the hook execution */
  artifactId: string;
  /** Event type that triggered the hook */
  eventType: string;
  /** ISO-8601 timestamp of the event */
  timestamp: string;
  /** Git-related data for the event */
  gitData?: {
    /** Current branch name */
    branch?: string;
    /** Commit SHA */
    commit?: string;
    /** Remote repository URL */
    remote?: string;
    /** Pull request number */
    prNumber?: number;
    /** Additional git metadata */
    [key: string]: unknown;
  };
  /** Additional custom context data */
  [key: string]: unknown;
}

/**
 * Result of hook execution
 */
export interface HookResult {
  /** Whether the hook executed successfully */
  success: boolean;
  /** Duration of hook execution in milliseconds */
  duration: number;
  /** Error message if execution failed */
  error?: string;
  /** stdout from hook execution */
  stdout?: string;
  /** stderr from hook execution */
  stderr?: string;
}

/**
 * Hook lifecycle callback
 */
export type HookLifecycleCallback = (
  hookName: string,
  context: HookContext,
) => void | Promise<void>;

/**
 * Hook error callback
 */
export type HookErrorCallback = (
  hookName: string,
  context: HookContext,
  error: Error,
) => void | Promise<void>;

/**
 * Configuration for hook execution
 */
export interface HookExecutorConfig {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Whether hooks should be non-blocking (default: true) */
  nonBlocking?: boolean;
  /** Log errors to console (default: true) */
  logErrors?: boolean;
  /** Optional logger instance for structured logging */
  logger?: HookLogger;
  /** Lifecycle callbacks */
  lifecycle?: {
    /** Called before hook execution */
    beforeExecute?: HookLifecycleCallback;
    /** Called after successful hook execution */
    afterExecute?: HookLifecycleCallback;
    /** Called when hook execution fails */
    onError?: HookErrorCallback;
  };
}
