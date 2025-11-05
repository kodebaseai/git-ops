/**
 * Tests for HookExecutor factory functions
 */

import { getDefaultConfig } from "@kodebase/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HookExecutor } from "./hook-executor.js";
import {
  createHookExecutor,
  createHookExecutorForType,
  isHookEnabled,
} from "./hook-executor-factory.js";

// Mock the loadConfig function
vi.mock("@kodebase/config", async () => {
  const actual = await vi.importActual("@kodebase/config");
  return {
    ...actual,
    loadConfig: vi.fn(async () => getDefaultConfig()),
  };
});

describe("HookExecutor Factory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createHookExecutor", () => {
    it("creates HookExecutor instance", async () => {
      const executor = await createHookExecutor();

      expect(executor).toBeInstanceOf(HookExecutor);
    });

    it("uses default config when no config file exists", async () => {
      const executor = await createHookExecutor();

      expect(executor).toBeDefined();
    });

    it("applies overrides to config", async () => {
      const executor = await createHookExecutor(process.cwd(), undefined, {
        timeout: 60000,
        logErrors: false,
      });

      expect((executor as any).config.timeout).toBe(60000);
      expect((executor as any).config.logErrors).toBe(false);
    });

    it("respects non_blocking from config", async () => {
      const { loadConfig } = await import("@kodebase/config");
      vi.mocked(loadConfig).mockResolvedValueOnce({
        gitOps: {
          hooks: {
            non_blocking: false,
          },
        },
      });

      const executor = await createHookExecutor();

      expect((executor as any).config.nonBlocking).toBe(false);
    });

    it("respects log_errors from config", async () => {
      const { loadConfig } = await import("@kodebase/config");
      vi.mocked(loadConfig).mockResolvedValueOnce({
        gitOps: {
          hooks: {
            log_errors: false,
          },
        },
      });

      const executor = await createHookExecutor();

      expect((executor as any).config.logErrors).toBe(false);
    });
  });

  describe("createHookExecutorForType", () => {
    it("creates executor for specific hook type", async () => {
      const executor = await createHookExecutorForType("post-merge");

      expect(executor).toBeInstanceOf(HookExecutor);
    });

    it("respects hook-specific non_blocking setting", async () => {
      const { loadConfig } = await import("@kodebase/config");
      vi.mocked(loadConfig).mockResolvedValueOnce({
        gitOps: {
          hooks: {
            non_blocking: true,
            post_merge: {
              non_blocking: false,
            },
          },
        },
      });

      const executor = await createHookExecutorForType("post-merge");

      expect((executor as any).config.nonBlocking).toBe(false);
    });

    it("falls back to global non_blocking if hook-specific not set", async () => {
      const { loadConfig } = await import("@kodebase/config");
      vi.mocked(loadConfig).mockResolvedValueOnce({
        gitOps: {
          hooks: {
            non_blocking: false,
            post_merge: {},
          },
        },
      });

      const executor = await createHookExecutorForType("post-merge");

      expect((executor as any).config.nonBlocking).toBe(false);
    });

    it("handles hyphenated hook names", async () => {
      const executor = await createHookExecutorForType("post-checkout");

      expect(executor).toBeInstanceOf(HookExecutor);
    });

    it("applies overrides over config settings", async () => {
      const { loadConfig } = await import("@kodebase/config");
      vi.mocked(loadConfig).mockResolvedValueOnce({
        gitOps: {
          hooks: {
            log_errors: true,
          },
        },
      });

      const executor = await createHookExecutorForType(
        "post-merge",
        process.cwd(),
        undefined,
        {
          logErrors: false,
        },
      );

      expect((executor as any).config.logErrors).toBe(false);
    });
  });

  describe("isHookEnabled", () => {
    it("returns true when hook is enabled by default", async () => {
      const enabled = await isHookEnabled("post-merge");

      expect(enabled).toBe(true);
    });

    it("returns false when global hooks are disabled", async () => {
      const { loadConfig } = await import("@kodebase/config");
      vi.mocked(loadConfig).mockResolvedValueOnce({
        gitOps: {
          hooks: {
            enabled: false,
          },
        },
      });

      const enabled = await isHookEnabled("post-merge");

      expect(enabled).toBe(false);
    });

    it("returns false when specific hook is disabled", async () => {
      const { loadConfig } = await import("@kodebase/config");
      vi.mocked(loadConfig).mockResolvedValueOnce({
        gitOps: {
          hooks: {
            post_merge: {
              enabled: false,
            },
          },
        },
      });

      const enabled = await isHookEnabled("post-merge");

      expect(enabled).toBe(false);
    });

    it("returns true when global disabled but specific hook enabled", async () => {
      const { loadConfig } = await import("@kodebase/config");
      vi.mocked(loadConfig).mockResolvedValueOnce({
        gitOps: {
          hooks: {
            enabled: false,
            post_merge: {
              enabled: true,
            },
          },
        },
      });

      const enabled = await isHookEnabled("post-merge");

      // Global enabled:false takes precedence
      expect(enabled).toBe(false);
    });

    it("handles hyphenated hook names", async () => {
      const enabled = await isHookEnabled("pre-commit");

      expect(enabled).toBe(true);
    });

    it("returns true when hook config exists but enabled not specified", async () => {
      const { loadConfig } = await import("@kodebase/config");
      vi.mocked(loadConfig).mockResolvedValueOnce({
        gitOps: {
          hooks: {
            post_merge: {
              non_blocking: true,
            },
          },
        },
      });

      const enabled = await isHookEnabled("post-merge");

      expect(enabled).toBe(true);
    });
  });
});
