/**
 * Tests for IdempotencyTracker
 */

import type { TEvent } from "@kodebase/core";
import { beforeEach, describe, expect, it } from "vitest";
import { IdempotencyTracker } from "./idempotency-tracker.js";

describe("IdempotencyTracker", () => {
  let tracker: IdempotencyTracker;

  beforeEach(() => {
    tracker = new IdempotencyTracker();
  });

  describe("shouldExecuteHook", () => {
    it("returns true when hook has never been executed", () => {
      const events: TEvent[] = [
        {
          event: "draft" as any,
          timestamp: "2025-11-05T10:00:00Z",
          actor: "Alice (alice@example.com)",
          trigger: "artifact_created" as any,
          metadata: {},
        },
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge");

      expect(result.shouldExecute).toBe(true);
      expect(result.reason).toBe("Hook has never been executed");
      expect(result.lastExecution).toBeUndefined();
    });

    it("returns false when hook was executed successfully", () => {
      const events: TEvent[] = [
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T10:00:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: {
            hook: "post-merge",
            status: "success",
            duration: 1000,
          },
        },
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge");

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toBe("Hook already executed successfully");
      expect(result.lastExecution).toBeDefined();
      expect(result.lastExecution?.status).toBe("success");
      expect(result.lastExecution?.timestamp).toBe("2025-11-05T10:00:00Z");
    });

    it("returns false when hook failed recently (within retry timeout)", () => {
      const now = "2025-11-05T10:03:00Z"; // 3 minutes after failure
      const events: TEvent[] = [
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T10:00:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: {
            hook: "post-merge",
            status: "failed",
            duration: 500,
            error: "Connection timeout",
          },
        },
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge", now);

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toContain("retry timeout not reached");
      expect(result.lastExecution?.status).toBe("failed");
    });

    it("returns true when hook failed and retry timeout has passed", () => {
      const now = "2025-11-05T10:10:00Z"; // 10 minutes after failure (> 5 min default)
      const events: TEvent[] = [
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T10:00:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: {
            hook: "post-merge",
            status: "failed",
            error: "Network error",
          },
        },
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
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T10:00:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: {
            hook: "post-merge",
            status: "failed",
          },
        },
      ];

      const result = customTracker.shouldExecuteHook(events, "post-merge", now);

      expect(result.shouldExecute).toBe(true);
      expect(result.reason).toContain("retry timeout passed");
    });

    it("returns false when retry is disabled and hook failed", () => {
      const noRetryTracker = new IdempotencyTracker({ allowRetry: false });
      const events: TEvent[] = [
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T10:00:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: {
            hook: "post-merge",
            status: "failed",
          },
        },
      ];

      const result = noRetryTracker.shouldExecuteHook(events, "post-merge");

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toBe("Hook failed and retry is disabled");
    });

    it("handles multiple executions and uses the most recent", () => {
      const now = "2025-11-05T10:10:00Z";
      const events: TEvent[] = [
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T09:00:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: {
            hook: "post-merge",
            status: "failed",
          },
        },
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T10:00:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: {
            hook: "post-merge",
            status: "success",
            duration: 1200,
          },
        },
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge", now);

      expect(result.shouldExecute).toBe(false);
      expect(result.reason).toBe("Hook already executed successfully");
      expect(result.lastExecution?.timestamp).toBe("2025-11-05T10:00:00Z");
    });

    it("ignores hooks with different names", () => {
      const events: TEvent[] = [
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T10:00:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: {
            hook: "pre-commit",
            status: "success",
          },
        },
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge");

      expect(result.shouldExecute).toBe(true);
      expect(result.reason).toBe("Hook has never been executed");
    });

    it("ignores non-hook events", () => {
      const events: TEvent[] = [
        {
          event: "draft" as any,
          timestamp: "2025-11-05T10:00:00Z",
          actor: "Alice (alice@example.com)",
          trigger: "artifact_created" as any,
          metadata: {},
        },
        {
          event: "in_progress" as any,
          timestamp: "2025-11-05T10:05:00Z",
          actor: "Bob (bob@example.com)",
          trigger: "work_started" as any,
          metadata: {},
        },
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

      expect(event.event).toBe("hook_executed");
      expect(event.actor).toBe("agent.hooks");
      expect(event.trigger).toBe("hook_completed");
      expect(event.timestamp).toBeDefined();
      expect((event.metadata as any).hook).toBe("post-merge");
      expect((event.metadata as any).status).toBe("success");
      expect((event.metadata as any).duration).toBe(1250);
      expect((event.metadata as any).artifactEvent).toBe("completed");
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

      expect((event.metadata as any).status).toBe("failed");
      expect((event.metadata as any).error).toBe("Validation failed");
    });

    it("creates event with minimal metadata", () => {
      const event = tracker.createHookExecutionEvent(
        "post-checkout",
        "success",
        "agent.hooks",
      );

      expect(event.event).toBe("hook_executed");
      expect((event.metadata as any).hook).toBe("post-checkout");
      expect((event.metadata as any).status).toBe("success");
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
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T10:00:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: {
            hook: "post-merge",
            status: "failed",
            error: "Timeout",
          },
        },
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T10:10:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: {
            hook: "post-merge",
            status: "failed",
            error: "Network error",
          },
        },
      ];

      const result = tracker.shouldExecuteHook(events, "post-merge", now);

      // Most recent failure is at 10:10, now is 10:15 (5 minutes), should allow retry
      expect(result.shouldExecute).toBe(true);
      expect(result.lastExecution?.timestamp).toBe("2025-11-05T10:10:00Z");
    });

    it("prevents execution if latest attempt succeeded after failure", () => {
      const events: TEvent[] = [
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T10:00:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: {
            hook: "post-merge",
            status: "failed",
          },
        },
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T10:10:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: {
            hook: "post-merge",
            status: "success",
          },
        },
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
        {
          event: "hook_executed" as any,
          timestamp: "2025-11-05T10:00:00Z",
          actor: "agent.hooks",
          trigger: "hook_completed" as any,
          metadata: null as any,
        },
      ];

      // Should not crash, treat as if hook never executed
      expect(() =>
        tracker.shouldExecuteHook(events, "post-merge"),
      ).not.toThrow();
    });
  });
});
