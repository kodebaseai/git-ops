import {
  contractHookExecutor,
  type HookExecutorContractConfig,
  type HookExecutorContractSubject,
} from "@kodebase/test-utils/contracts";
import { describe, vi } from "vitest";
import type { HookContext } from "../../../utils/types.js";
import { HookExecutor } from "../hook-executor.js";

type ExecutorInternal = HookExecutorContractSubject & {
  executeWithTimeout: (
    hookName: string,
    context: HookContext,
  ) => Promise<{
    stdout?: string;
    stderr?: string;
  }>;
};

describe("HookExecutor Contract", () => {
  const context: HookContext = {
    artifactId: "A.1.2",
    eventType: "completed",
    timestamp: "2025-11-08T11:00:00Z",
  };

  contractHookExecutor<ExecutorInternal, HookExecutorContractConfig>(
    "HookExecutor",
    (config) => new HookExecutor(config),
    {
      contextFactory: () => context,
      configs: {
        default: {},
        nonBlocking: { nonBlocking: true },
        blocking: { nonBlocking: false },
      },
      simulateFailure: (executor, error) => {
        vi.spyOn(executor, "executeWithTimeout").mockRejectedValueOnce(error);
      },
    },
  );
});
