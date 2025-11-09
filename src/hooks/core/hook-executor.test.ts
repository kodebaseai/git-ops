/**
 * Tests for HookExecutor
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HookContext } from "../../utils/types.js";
import type { HookExecutionFunction } from "./hook-executor.js";
import { HookExecutor } from "./hook-executor.js";

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
    it("returns complete success payload when execution finishes cleanly", async () => {
      const result = await executor.executeHook("post-merge", mockContext);

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          duration: expect.any(Number),
          stdout: "",
          stderr: "",
        }),
      );
      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it("invokes lifecycle hooks with the same context used for execution", async () => {
      const beforeExecute = vi.fn();
      const afterExecute = vi.fn();
      const lifecycleExecutor = new HookExecutor({
        lifecycle: { beforeExecute, afterExecute },
      });

      await lifecycleExecutor.executeHook("post-merge", mockContext);

      expect(beforeExecute).toHaveBeenCalledWith("post-merge", mockContext);
      expect(afterExecute).toHaveBeenCalledWith("post-merge", mockContext);
    });

    it("bubbles stdout and stderr from the underlying hook execution", async () => {
      const hookOutput = { stdout: "hook output", stderr: "warnings" };
      const mockExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockResolvedValue(hookOutput);

      const customExecutor = new HookExecutor({}, mockExecutionFn);
      const result = await customExecutor.executeHook(
        "post-merge",
        mockContext,
      );

      expect(result.stdout).toBe("hook output");
      expect(result.stderr).toBe("warnings");
      expect(mockExecutionFn).toHaveBeenCalledWith("post-merge", mockContext);
    });

    it("reports deterministic duration based on performance.now()", async () => {
      const nowSpy = vi
        .spyOn(performance, "now")
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1600);

      const result = await executor.executeHook("post-merge", mockContext);

      expect(result.duration).toBe(600);
      nowSpy.mockRestore();
    });
  });

  describe("Non-blocking behavior", () => {
    it("catches errors in non-blocking mode (default)", async () => {
      const failingExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockRejectedValue(new Error("Hook failed"));
      const failingExecutor = new HookExecutor({}, failingExecutionFn);

      const result = await failingExecutor.executeHook(
        "failing-hook",
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Hook failed");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("captures failures as results in non-blocking mode", async () => {
      const failingExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockRejectedValue(new Error("Hook failed"));
      const failingExecutor = new HookExecutor(
        { nonBlocking: true },
        failingExecutionFn,
      );

      const result = await failingExecutor.executeHook(
        "failing-hook",
        mockContext,
      );

      expect(result).toEqual(
        expect.objectContaining({
          success: false,
          error: "Hook failed",
        }),
      );
    });

    it("throws errors in blocking mode", async () => {
      const failingExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockRejectedValue(new Error("Hook failed"));
      const blockingExecutor = new HookExecutor(
        { nonBlocking: false },
        failingExecutionFn,
      );

      await expect(
        blockingExecutor.executeHook("failing-hook", mockContext),
      ).rejects.toThrow("Hook failed");
    });
  });

  describe("Timeout support", () => {
    it("times out when hook exceeds configured timeout", async () => {
      const slowExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Hook timed out")), 150),
            ),
        );
      const timeoutExecutor = new HookExecutor(
        { timeout: 100 },
        slowExecutionFn,
      );

      const result = await timeoutExecutor.executeHook(
        "slow-hook",
        mockContext,
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe("Hook timed out");
    });

    it("completes successfully when hook finishes before timeout", async () => {
      const fastExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockResolvedValue({ stdout: "done", stderr: "" });
      const timeoutExecutor = new HookExecutor(
        { timeout: 5000 },
        fastExecutionFn,
      );

      const result = await timeoutExecutor.executeHook(
        "fast-hook",
        mockContext,
      );

      expect(result.success).toBe(true);
      expect(result.stdout).toBe("done");
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
      const failingExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockRejectedValue(new Error("Hook failed"));
      const lifecycleExecutor = new HookExecutor(
        { lifecycle: { onError } },
        failingExecutionFn,
      );

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
      const failingExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockRejectedValue(new Error("Hook failed"));
      const lifecycleExecutor = new HookExecutor(
        { lifecycle: { afterExecute } },
        failingExecutionFn,
      );

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
      const failingExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockRejectedValue(new Error("Hook failed"));
      const failingExecutor = new HookExecutor({}, failingExecutionFn);

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
      const failingExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockRejectedValue(new Error("Hook failed"));
      const failingExecutor = new HookExecutor(
        { logErrors: false },
        failingExecutionFn,
      );

      await failingExecutor.executeHook("failing-hook", mockContext);

      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });

    it("converts non-Error thrown values to Error", async () => {
      const failingExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockRejectedValue("String error");
      const failingExecutor = new HookExecutor({}, failingExecutionFn);

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
      const mockExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockImplementation((hookName: string) => {
          if (hookName === "failing-hook") {
            return Promise.reject(new Error("Hook failed"));
          }
          return Promise.resolve({ stdout: "", stderr: "" });
        });

      const parallelExecutor = new HookExecutor({}, mockExecutionFn);
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
      const mockExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockImplementation((hookName: string) => {
          if (hookName === "failing-hook") {
            return Promise.reject(new Error("Hook failed"));
          }
          return Promise.resolve({ stdout: "", stderr: "" });
        });

      const sequentialExecutor = new HookExecutor({}, mockExecutionFn);
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
      const mockExecutionFn: HookExecutionFunction = vi
        .fn()
        .mockImplementation((hookName: string) => {
          if (hookName === "failing-hook") {
            return Promise.reject(new Error("Hook failed"));
          }
          return Promise.resolve({ stdout: "", stderr: "" });
        });

      const blockingExecutor = new HookExecutor(
        { nonBlocking: false },
        mockExecutionFn,
      );
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
