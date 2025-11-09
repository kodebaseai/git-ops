import {
  contractHookExecutor,
  type HookExecutorContractConfig,
  type HookExecutorContractSubject,
} from "@kodebase/test-utils/contracts";
import { describe, vi } from "vitest";
import type { HookContext } from "../../../utils/types.js";
import { type HookExecutionFunction, HookExecutor } from "../hook-executor.js";

type TestableExecutor = HookExecutorContractSubject & {
  _setExecutionFn: (fn: HookExecutionFunction) => void;
};

type HookExecutorInternal = HookExecutor & {
  executionFn: HookExecutionFunction;
};

describe("HookExecutor Contract", () => {
  const context: HookContext = {
    artifactId: "A.1.2",
    eventType: "completed",
    timestamp: "2025-11-08T11:00:00Z",
  };

  contractHookExecutor<TestableExecutor, HookExecutorContractConfig>(
    "HookExecutor",
    (config) => {
      const executor = new HookExecutor(config) as TestableExecutor;
      executor._setExecutionFn = (fn: HookExecutionFunction) => {
        (executor as HookExecutorInternal).executionFn = fn;
      };
      return executor;
    },
    {
      contextFactory: () => context,
      configs: {
        default: {},
        nonBlocking: { nonBlocking: true },
        blocking: { nonBlocking: false },
      },
      simulateFailure: (executor, error) => {
        executor._setExecutionFn(vi.fn().mockRejectedValue(error));
      },
    },
  );
});
