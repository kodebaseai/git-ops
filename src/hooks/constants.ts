/**
 * Hook-specific event constants
 *
 * These events extend the core artifact event system with git-ops specific
 * hook execution tracking events.
 */

/**
 * Hook-related event types that extend TEvent from @kodebase/core
 */
export const CHookEvent = {
  /** Hook execution completed (success or failure) */
  HOOK_EXECUTED: "hook_executed",
} as const;

/**
 * Hook-related event triggers
 */
export const CHookTrigger = {
  /** Hook execution finished */
  HOOK_COMPLETED: "hook_completed",
} as const;

/**
 * Union type of hook event types
 */
export type THookEvent = (typeof CHookEvent)[keyof typeof CHookEvent];

/**
 * Union type of hook event triggers
 */
export type THookTrigger = (typeof CHookTrigger)[keyof typeof CHookTrigger];
