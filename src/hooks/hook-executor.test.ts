/**
 * Tests for HookExecutor
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { HookExecutor } from "./hook-executor.js";
import type { HookContext } from "./types.js";

describe("HookExecutor", () => {
  let executor: HookExecutor;
  let mockContext: HookContext;

  beforeEach(() => {
    executor = new HookExecutor();
    mockContext = {
      artifactId: "A.1.2",
      eventType: "completed",
      timestamp: "2025-11-05T14:00:00Z",
      gitData: {
        branch: "main",
        commit: "abc123",
      },
    };
  });

  describe("executeHook", () => {
    it("executes hook successfully with default config", async () => {
      const result = await executor.executeHook("post-merge", mockContext);

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it("includes hook context in execution", async () => {
      const result = await executor.executeHook("post-merge", mockContext);

      expect(result.success).toBe(true);
      // Context is available during execution
    });

    it("returns result with stdout and stderr", async () => {
      const result = await executor.executeHook("post-merge", mockContext);

      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();
    });

    it("measures execution duration", async () => {
      const result = await executor.executeHook("post-merge", mockContext);

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.duration).toBe("number");
    });
  });

  describe("Non-blocking behavior", () => {
    it("catches errors in non-blocking mode (default)", async () => {
      // Temporarily override executeWithTimeout to simulate failure
      const failingExecutor = new HookExecutor();
      vi.spyOn(failingExecutor as any, "executeWithTimeout").mockRejectedValue(
        new Error("Hook failed"),
      );

      const result = await failingExecutor.executeHook(
        "failing-hook",
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Hook failed");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("does not throw errors in non-blocking mode", async () => {
      const failingExecutor = new HookExecutor({ nonBlocking: true });
      vi.spyOn(failingExecutor as any, "executeWithTimeout").mockRejectedValue(
        new Error("Hook failed"),
      );

      await expect(
        failingExecutor.executeHook("failing-hook", mockContext),
      ).resolves.toBeDefined();
    });

    it("throws errors in blocking mode", async () => {
      const blockingExecutor = new HookExecutor({ nonBlocking: false });
      vi.spyOn(blockingExecutor as any, "executeWithTimeout").mockRejectedValue(
        new Error("Hook failed"),
      );

      await expect(
        blockingExecutor.executeHook("failing-hook", mockContext),
      ).rejects.toThrow("Hook failed");
    });
  });

  describe("Timeout support", () => {
    it("uses default timeout of 30 seconds", async () => {
      const defaultExecutor = new HookExecutor();
      expect((defaultExecutor as any).config.timeout).toBe(30000);
    });

    it("uses custom timeout when provided", async () => {
      const customExecutor = new HookExecutor({ timeout: 5000 });
      expect((customExecutor as any).config.timeout).toBe(5000);
    });

    it("times out when hook exceeds timeout", async () => {
      const timeoutExecutor = new HookExecutor({ timeout: 100 });
      vi.spyOn(timeoutExecutor as any, "executeWithTimeout").mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 150),
          ),
      );

      const result = await timeoutExecutor.executeHook(
        "slow-hook",
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("Timeout");
    });
  });

  describe("Lifecycle callbacks", () => {
    it("calls beforeExecute before hook execution", async () => {
      const beforeExecute = vi.fn();
      const lifecycleExecutor = new HookExecutor({
        lifecycle: { beforeExecute },
      });

      await lifecycleExecutor.executeHook("test-hook", mockContext);

      expect(beforeExecute).toHaveBeenCalledWith("test-hook", mockContext);
      expect(beforeExecute).toHaveBeenCalledTimes(1);
    });

    it("calls afterExecute after successful execution", async () => {
      const afterExecute = vi.fn();
      const lifecycleExecutor = new HookExecutor({
        lifecycle: { afterExecute },
      });

      await lifecycleExecutor.executeHook("test-hook", mockContext);

      expect(afterExecute).toHaveBeenCalledWith("test-hook", mockContext);
      expect(afterExecute).toHaveBeenCalledTimes(1);
    });

    it("calls onError when hook execution fails", async () => {
      const onError = vi.fn();
      const lifecycleExecutor = new HookExecutor({
        lifecycle: { onError },
      });
      vi.spyOn(
        lifecycleExecutor as any,
        "executeWithTimeout",
      ).mockRejectedValue(new Error("Hook failed"));

      await lifecycleExecutor.executeHook("failing-hook", mockContext);

      expect(onError).toHaveBeenCalledWith(
        "failing-hook",
        mockContext,
        expect.any(Error),
      );
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it("does not call afterExecute when hook fails", async () => {
      const afterExecute = vi.fn();
      const lifecycleExecutor = new HookExecutor({
        lifecycle: { afterExecute },
      });
      vi.spyOn(
        lifecycleExecutor as any,
        "executeWithTimeout",
      ).mockRejectedValue(new Error("Hook failed"));

      await lifecycleExecutor.executeHook("failing-hook", mockContext);

      expect(afterExecute).not.toHaveBeenCalled();
    });

    it("calls all lifecycle hooks in correct order", async () => {
      const callOrder: string[] = [];
      const lifecycleExecutor = new HookExecutor({
        lifecycle: {
          beforeExecute: async () => {
            callOrder.push("before");
          },
          afterExecute: async () => {
            callOrder.push("after");
          },
        },
      });

      await lifecycleExecutor.executeHook("test-hook", mockContext);

      expect(callOrder).toEqual(["before", "after"]);
    });
  });

  describe("Error handling", () => {
    it("logs errors when logErrors is true (default)", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const failingExecutor = new HookExecutor();
      vi.spyOn(failingExecutor as any, "executeWithTimeout").mockRejectedValue(
        new Error("Hook failed"),
      );

      await failingExecutor.executeHook("failing-hook", mockContext);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Hook "failing-hook" failed:',
        "Hook failed",
      );

      consoleErrorSpy.mockRestore();
    });

    it("does not log errors when logErrors is false", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const failingExecutor = new HookExecutor({ logErrors: false });
      vi.spyOn(failingExecutor as any, "executeWithTimeout").mockRejectedValue(
        new Error("Hook failed"),
      );

      await failingExecutor.executeHook("failing-hook", mockContext);

      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("converts non-Error thrown values to Error", async () => {
      const failingExecutor = new HookExecutor();
      vi.spyOn(failingExecutor as any, "executeWithTimeout").mockRejectedValue(
        "String error",
      );

      const result = await failingExecutor.executeHook(
        "failing-hook",
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("String error");
    });
  });

  describe("executeHooksParallel", () => {
    it("executes multiple hooks in parallel", async () => {
      const hooks = ["hook1", "hook2", "hook3"];
      const results = await executor.executeHooksParallel(hooks, mockContext);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.success).toBe(true);
      });
    });

    it("executes hooks independently - one failure doesn't affect others", async () => {
      const parallelExecutor = new HookExecutor();
      const originalMethod = (parallelExecutor as any).executeWithTimeout.bind(
        parallelExecutor,
      );
      vi.spyOn(
        parallelExecutor as any,
        "executeWithTimeout",
      ).mockImplementation((hookName: string) => {
        if (hookName === "failing-hook") {
          return Promise.reject(new Error("Hook failed"));
        }
        return originalMethod(hookName, mockContext);
      });

      const hooks = ["success-hook", "failing-hook", "another-success"];
      const results = await parallelExecutor.executeHooksParallel(
        hooks,
        mockContext,
      );

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });

    it("returns all results when all hooks succeed", async () => {
      const hooks = ["hook1", "hook2"];
      const results = await executor.executeHooksParallel(hooks, mockContext);

      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe("executeHooksSequential", () => {
    it("executes multiple hooks sequentially", async () => {
      const callOrder: string[] = [];
      const sequentialExecutor = new HookExecutor({
        lifecycle: {
          beforeExecute: async (hookName) => {
            callOrder.push(hookName);
          },
        },
      });

      const hooks = ["hook1", "hook2", "hook3"];
      await sequentialExecutor.executeHooksSequential(hooks, mockContext);

      expect(callOrder).toEqual(["hook1", "hook2", "hook3"]);
    });

    it("continues execution after failure in non-blocking mode", async () => {
      const sequentialExecutor = new HookExecutor();
      const originalMethod = (
        sequentialExecutor as any
      ).executeWithTimeout.bind(sequentialExecutor);
      vi.spyOn(
        sequentialExecutor as any,
        "executeWithTimeout",
      ).mockImplementation((hookName: string) => {
        if (hookName === "failing-hook") {
          return Promise.reject(new Error("Hook failed"));
        }
        return originalMethod(hookName, mockContext);
      });

      const hooks = ["hook1", "failing-hook", "hook3"];
      const results = await sequentialExecutor.executeHooksSequential(
        hooks,
        mockContext,
      );

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });

    it("stops execution after failure in blocking mode", async () => {
      const blockingExecutor = new HookExecutor({ nonBlocking: false });
      const originalMethod = (blockingExecutor as any).executeWithTimeout.bind(
        blockingExecutor,
      );
      vi.spyOn(
        blockingExecutor as any,
        "executeWithTimeout",
      ).mockImplementation((hookName: string) => {
        if (hookName === "failing-hook") {
          return Promise.reject(new Error("Hook failed"));
        }
        return originalMethod(hookName, mockContext);
      });

      const hooks = ["hook1", "failing-hook", "hook3"];

      // In blocking mode, the method should throw
      await expect(
        blockingExecutor.executeHooksSequential(hooks, mockContext),
      ).rejects.toThrow("Hook failed");
    });
  });

  describe("Hook context", () => {
    it("accepts required context fields", async () => {
      const minimalContext: HookContext = {
        artifactId: "B.2.3",
        eventType: "in_progress",
        timestamp: "2025-11-05T15:00:00Z",
      };

      const result = await executor.executeHook("test-hook", minimalContext);

      expect(result.success).toBe(true);
    });

    it("accepts optional gitData in context", async () => {
      const contextWithGit: HookContext = {
        artifactId: "C.1.1",
        eventType: "completed",
        timestamp: "2025-11-05T16:00:00Z",
        gitData: {
          branch: "feature/test",
          commit: "def456",
          remote: "origin",
          prNumber: 42,
        },
      };

      const result = await executor.executeHook("test-hook", contextWithGit);

      expect(result.success).toBe(true);
    });

    it("accepts additional custom context fields", async () => {
      const customContext: HookContext = {
        artifactId: "A.1.1",
        eventType: "ready",
        timestamp: "2025-11-05T17:00:00Z",
        customField: "custom-value",
        anotherField: 123,
      };

      const result = await executor.executeHook("test-hook", customContext);

      expect(result.success).toBe(true);
    });
  });
});
