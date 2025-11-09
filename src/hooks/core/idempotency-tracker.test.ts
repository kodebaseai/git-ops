/**
 * Tests for IdempotencyTracker
 */

import type { TEvent } from "@kodebase/core";
import { beforeEach, describe, expect, it } from "vitest";
import { CHookEvent, CHookTrigger } from "../../utils/constants.js";
import { IdempotencyTracker } from "./idempotency-tracker.js";
import type { HookExecutionMetadata } from "./idempotency-types.js";

/**
 * Helper to create a test event with custom event type
 * Uses unknown as TEvent["event"] to bypass strict union type checking in tests
 */
function createTestEvent(
  event: string,
  timestamp: string,
  actor: string,
  trigger: string,
  metadata: Record<string, unknown> | null = {},
): TEvent {
  return {
    event: event as unknown as TEvent["event"],
    timestamp,
    actor,
    trigger: trigger as unknown as TEvent["trigger"],
    metadata: metadata as unknown as TEvent["metadata"],
  };
}

/**
 * Helper to create a hook execution event for tests
 * Uses hook-specific constants instead of string literals
 */
function createHookExecutionEvent(
  hookName: string,
  status: "success" | "failed",
  timestamp: string,
  additionalMetadata: Partial<HookExecutionMetadata> = {},
): TEvent {
  return createTestEvent(
    CHookEvent.HOOK_EXECUTED,
    timestamp,
    "agent.hooks",
    CHookTrigger.HOOK_COMPLETED,
    {
      hook: hookName,
      status,
      ...additionalMetadata,
    },
  );
}

describe("IdempotencyTracker", () => {
  let tracker: IdempotencyTracker;

  beforeEach(() => {
    tracker = new IdempotencyTracker();
  });

  describe("shouldExecuteHook", () => {
    it("returns true when hook has never been executed", () => {
      const events: TEvent[] = [
        createTestEvent(
          "draft",
          "2025-11-05T10:00:00Z",
          "Alice (alice@example.com)",
          "artifact_created",
        ),
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge");

      expect(result.shouldExecute).toBe(true);
      expect(result.reason).toBe("Hook has never been executed");
      expect(result.lastExecution).toBeUndefined();
    });

    it("returns false when hook was executed successfully", () => {
      const events: TEvent[] = [
        createHookExecutionEvent(
          "post-merge",
          "success",
          "2025-11-05T10:00:00Z",
          { duration: 1000 },
        ),
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge");

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toBe("Hook already executed successfully");
      expect(result.lastExecution).toEqual({
        hook: "post-merge",
        status: "success",
        duration: 1000,
        timestamp: "2025-11-05T10:00:00Z",
      });
    });

    it("returns false when hook failed recently (within retry timeout)", () => {
      const now = "2025-11-05T10:03:00Z"; // 3 minutes after failure
      const events: TEvent[] = [
        createHookExecutionEvent(
          "post-merge",
          "failed",
          "2025-11-05T10:00:00Z",
          {
            duration: 500,
            error: "Connection timeout",
          },
        ),
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge", now);

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toBe(
        "Hook failed recently (180s ago), retry timeout not reached",
      );
      expect(result.lastExecution).toMatchObject({
        status: "failed",
        error: "Connection timeout",
      });
    });

    it("returns true when hook failed and retry timeout has passed", () => {
      const now = "2025-11-05T10:10:00Z"; // 10 minutes after failure (> 5 min default)
      const events: TEvent[] = [
        createHookExecutionEvent(
          "post-merge",
          "failed",
          "2025-11-05T10:00:00Z",
          {
            error: "Network error",
          },
        ),
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge", now);

      expect(result.shouldExecute).toBe(true);
      expect(result.reason).toContain("retry timeout passed");
      expect(result.lastExecution?.status).toBe("failed");
    });

    it("respects custom retry timeout", () => {
      const customTracker = new IdempotencyTracker({ retryTimeout: 60000 }); // 1 minute
      const now = "2025-11-05T10:02:00Z"; // 2 minutes after failure
      const events: TEvent[] = [
        createHookExecutionEvent(
          "post-merge",
          "failed",
          "2025-11-05T10:00:00Z",
        ),
      ];

      const result = customTracker.shouldExecuteHook(events, "post-merge", now);

      expect(result.shouldExecute).toBe(true);
      expect(result.reason).toContain("retry timeout passed");
    });

    it("returns false when retry is disabled and hook failed", () => {
      const noRetryTracker = new IdempotencyTracker({ allowRetry: false });
      const events: TEvent[] = [
        createHookExecutionEvent(
          "post-merge",
          "failed",
          "2025-11-05T10:00:00Z",
        ),
      ];

      const result = noRetryTracker.shouldExecuteHook(events, "post-merge");

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toBe("Hook failed and retry is disabled");
    });

    it("handles multiple executions and uses the most recent", () => {
      const now = "2025-11-05T10:10:00Z";
      const events: TEvent[] = [
        createHookExecutionEvent(
          "post-merge",
          "failed",
          "2025-11-05T09:00:00Z",
        ),
        createHookExecutionEvent(
          "post-merge",
          "success",
          "2025-11-05T10:00:00Z",
          { duration: 1200 },
        ),
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge", now);

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toBe("Hook already executed successfully");
      expect(result.lastExecution?.timestamp).toBe("2025-11-05T10:00:00Z");
    });

    it("ignores hooks with different names", () => {
      const events: TEvent[] = [
        createHookExecutionEvent(
          "pre-commit",
          "success",
          "2025-11-05T10:00:00Z",
        ),
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge");

      expect(result.shouldExecute).toBe(true);
      expect(result.reason).toBe("Hook has never been executed");
    });

    it("ignores non-hook events", () => {
      const events: TEvent[] = [
        createTestEvent(
          "draft",
          "2025-11-05T10:00:00Z",
          "Alice (alice@example.com)",
          "artifact_created",
        ),
        createTestEvent(
          "in_progress",
          "2025-11-05T10:05:00Z",
          "Bob (bob@example.com)",
          "work_started",
        ),
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge");

      expect(result.shouldExecute).toBe(true);
      expect(result.reason).toBe("Hook has never been executed");
    });
  });

  describe("createHookExecutionEvent", () => {
    it("creates event with success status", () => {
      const event = tracker.createHookExecutionEvent(
        "post-merge",
        "success",
        "agent.hooks",
        {
          duration: 1250,
          artifactEvent: "completed",
        },
      );

      expect(event.event).toBe(CHookEvent.HOOK_EXECUTED);
      expect(event.actor).toBe("agent.hooks");
      expect(event.trigger).toBe(CHookTrigger.HOOK_COMPLETED);
      const parsedTimestamp = Date.parse(event.timestamp);
      expect(Number.isNaN(parsedTimestamp)).toBe(false);
      expect(new Date(parsedTimestamp).toISOString()).toBe(event.timestamp);

      const metadata = event.metadata as unknown as HookExecutionMetadata;
      expect(metadata.hook).toBe("post-merge");
      expect(metadata.status).toBe("success");
      expect(metadata.duration).toBe(1250);
      expect(metadata.artifactEvent).toBe("completed");
    });

    it("creates event with failed status and error", () => {
      const event = tracker.createHookExecutionEvent(
        "pre-commit",
        "failed",
        "agent.hooks",
        {
          error: "Validation failed",
          duration: 500,
        },
      );

      const metadata = event.metadata as unknown as HookExecutionMetadata;
      expect(metadata.status).toBe("failed");
      expect(metadata.error).toBe("Validation failed");
    });

    it("creates event with minimal metadata", () => {
      const event = tracker.createHookExecutionEvent(
        "post-checkout",
        "success",
        "agent.hooks",
      );

      expect(event.event).toBe(CHookEvent.HOOK_EXECUTED);

      const metadata = event.metadata as unknown as HookExecutionMetadata;
      expect(metadata.hook).toBe("post-checkout");
      expect(metadata.status).toBe("success");
    });

    it("generates ISO timestamp", () => {
      const event = tracker.createHookExecutionEvent(
        "post-merge",
        "success",
        "agent.hooks",
      );

      // Check that timestamp is valid ISO format
      expect(() => new Date(event.timestamp)).not.toThrow();
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe("Partial failure handling", () => {
    it("tracks multiple attempts and uses most recent status", () => {
      const now = "2025-11-05T10:15:00Z";
      const events: TEvent[] = [
        createHookExecutionEvent(
          "post-merge",
          "failed",
          "2025-11-05T10:00:00Z",
          { error: "Timeout" },
        ),
        createHookExecutionEvent(
          "post-merge",
          "failed",
          "2025-11-05T10:10:00Z",
          { error: "Network error" },
        ),
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge", now);

      // Most recent failure is at 10:10, now is 10:15 (5 minutes), should allow retry
      expect(result.shouldExecute).toBe(true);
      expect(result.lastExecution?.timestamp).toBe("2025-11-05T10:10:00Z");
    });

    it("prevents execution if latest attempt succeeded after failure", () => {
      const events: TEvent[] = [
        createHookExecutionEvent(
          "post-merge",
          "failed",
          "2025-11-05T10:00:00Z",
        ),
        createHookExecutionEvent(
          "post-merge",
          "success",
          "2025-11-05T10:10:00Z",
        ),
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge");

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toBe("Hook already executed successfully");
    });
  });

  describe("Edge cases", () => {
    it("handles empty event array", () => {
      const result = tracker.shouldExecuteHook([], "post-merge");

      expect(result.shouldExecute).toBe(true);
      expect(result.reason).toBe("Hook has never been executed");
    });

    it("handles invalid event metadata gracefully", () => {
      const events: TEvent[] = [
        createTestEvent(
          CHookEvent.HOOK_EXECUTED,
          "2025-11-05T10:00:00Z",
          "agent.hooks",
          CHookTrigger.HOOK_COMPLETED,
          null,
        ),
      ];

      // Should not crash, treat as if hook never executed
      expect(() =>
        tracker.shouldExecuteHook(events, "post-merge"),
      ).not.toThrow();
    });
  });
});
