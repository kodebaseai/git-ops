/**
 * Integration tests for the complete hook system
 * Tests the full lifecycle: install, execute, log, handle errors, uninstall
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { TEvent } from "@kodebase/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HookExecutor } from "./hook-executor.js";
import { HookInstaller } from "./hook-installer.js";
import { HookLogger } from "./hook-logger.js";
import { IdempotencyTracker } from "./idempotency-tracker.js";
import { CLogLevel } from "./logger-types.js";
import type { HookContext } from "./types.js";

describe("Hook System Integration Tests", () => {
  let tempDir: string;
  let gitRoot: string;
  let hooksDir: string;
  let logFile: string;
  let artifactPath: string;

  beforeEach(async () => {
    // Create temporary directory structure
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "hook-integration-"),
    );
    gitRoot = tempDir;
    hooksDir = path.join(gitRoot, ".git", "hooks");
    logFile = path.join(tempDir, "hooks.log");
    artifactPath = path.join(tempDir, ".kodebase", "artifacts", "test.yml");

    // Create necessary directories
    await fs.promises.mkdir(hooksDir, { recursive: true });
    await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });

    // Create a test artifact file with empty events
    await fs.promises.writeFile(
      artifactPath,
      `metadata:
  title: Test Artifact
  schema_version: "0.0.1"
events: []
`,
      "utf-8",
    );
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe("E2E: Install hooks in temp git repo", () => {
    it("installs hooks and verifies they are executable", async () => {
      const installer = new HookInstaller({ gitRoot });

      const result = await installer.installHooks();

      expect(result.success).toBe(true);
      expect(result.installed).toHaveLength(3);
      expect(result.installed).toContain("post-merge");
      expect(result.installed).toContain("post-commit");
      expect(result.installed).toContain("post-checkout");

      // Verify hook files exist
      for (const hookType of result.installed) {
        const hookPath = path.join(hooksDir, hookType);
        expect(fs.existsSync(hookPath)).toBe(true);

        // Verify hook is executable
        const stats = await fs.promises.stat(hookPath);
        expect(stats.mode & 0o111).toBeGreaterThan(0); // Has execute permission
      }
    });

    it("creates backup when existing hook present with force option", async () => {
      const installer = new HookInstaller({ gitRoot, force: true });

      // Create existing hook
      const existingHook = path.join(hooksDir, "post-merge");
      await fs.promises.writeFile(existingHook, "#!/bin/bash\necho 'old'");
      await fs.promises.chmod(existingHook, 0o755);

      const result = await installer.installHooks();

      expect(result.success).toBe(true);
      expect(result.backedUp).toContain("post-merge");
      expect(fs.existsSync(`${existingHook}.kodebase-backup`)).toBe(true);
    });
  });

  describe("E2E: Execute hook with idempotency check", () => {
    it("executes hook and logs to artifact events", async () => {
      const logger = new HookLogger({
        logFile,
        fileOutput: true,
        consoleOutput: false,
      });
      const tracker = new IdempotencyTracker();
      const executor = new HookExecutor({ logger, nonBlocking: true });

      const context: HookContext = {
        artifactId: "test.yml",
        eventType: "completed",
        timestamp: new Date().toISOString(),
      };

      // Read artifact events
      const _artifactContent = await fs.promises.readFile(
        artifactPath,
        "utf-8",
      );
      const events: TEvent[] = [];

      // Check if should execute (first time - should be true)
      const shouldExecute = tracker.shouldExecuteHook(events, "post-merge");
      expect(shouldExecute.shouldExecute).toBe(true);

      // Create a test hook script
      const hookPath = path.join(hooksDir, "post-merge");
      await fs.promises.writeFile(
        hookPath,
        '#!/bin/bash\necho "Hook executed successfully"',
      );
      await fs.promises.chmod(hookPath, 0o755);

      // Execute hook
      const result = await executor.executeHook("post-merge", context);

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);

      // Record execution in artifact by creating event and appending to artifact
      const executionEvent = tracker.createHookExecutionEvent(
        "post-merge",
        "success",
        "test-actor",
        { duration: result.duration },
      );

      // Manually append event to artifact file (in real use, would use ArtifactService)
      events.push(executionEvent);
      const artifactYaml = `metadata:
  title: Test Artifact
  schema_version: "0.0.1"
events:
  - event: ${executionEvent.event}
    timestamp: ${executionEvent.timestamp}
    actor: ${executionEvent.actor}
    trigger: ${executionEvent.trigger}
    metadata:
      hook: post-merge
      status: success
      duration: ${result.duration}
`;
      await fs.promises.writeFile(artifactPath, artifactYaml, "utf-8");

      // Verify log file contains execution
      const logContent = await fs.promises.readFile(logFile, "utf-8");
      expect(logContent).toContain('"hookName":"post-merge"');
      expect(logContent).toContain('"status":"success"');

      // Verify artifact events updated
      const updatedContent = await fs.promises.readFile(artifactPath, "utf-8");
      expect(updatedContent).toContain("hook_executed");
      expect(updatedContent).toContain("post-merge");
    });
  });

  describe("E2E: Hook execution never blocks git operation", () => {
    it("completes execution in non-blocking mode", async () => {
      const executor = new HookExecutor({
        nonBlocking: true,
        logErrors: false,
      });

      const context: HookContext = {
        artifactId: "test.yml",
        eventType: "completed",
        timestamp: new Date().toISOString(),
      };

      // Execute hook - should complete without throwing
      const result = await executor.executeHook("post-merge", context);

      // In non-blocking mode, execution always completes
      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
    });

    it("completes within timeout period", async () => {
      const executor = new HookExecutor({
        nonBlocking: true,
        timeout: 1000, // 1 second timeout
      });

      const context: HookContext = {
        artifactId: "test.yml",
        eventType: "completed",
        timestamp: new Date().toISOString(),
      };

      const startTime = performance.now();
      const result = await executor.executeHook("post-merge", context);
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(1500); // Should complete within timeout + buffer
    });
  });

  describe("E2E: Error logging integration", () => {
    it("logs execution with logger integration", async () => {
      const logger = new HookLogger({
        logFile,
        fileOutput: true,
        consoleOutput: false,
        logLevel: CLogLevel.INFO,
      });
      const executor = new HookExecutor({
        logger,
        nonBlocking: true,
        logErrors: false,
      });

      const context: HookContext = {
        artifactId: "test.yml",
        eventType: "completed",
        timestamp: new Date().toISOString(),
      };

      // Execute hook
      const result = await executor.executeHook("post-merge", context);

      expect(result.success).toBe(true);

      // Verify execution is logged
      const logContent = await fs.promises.readFile(logFile, "utf-8");
      expect(logContent).toContain('"hookName":"post-merge"');
      expect(logContent).toContain('"status":"started"');
      expect(logContent).toContain('"status":"success"');
    });
  });

  describe("E2E: Hook timeout configuration", () => {
    it("respects timeout configuration", async () => {
      const executor = new HookExecutor({
        timeout: 5000, // 5 second timeout
        nonBlocking: true,
      });

      const context: HookContext = {
        artifactId: "test.yml",
        eventType: "completed",
        timestamp: new Date().toISOString(),
      };

      const result = await executor.executeHook("post-merge", context);

      expect(result.success).toBe(true);
      expect(result.duration).toBeLessThan(5000);
    });
  });

  describe("E2E: Parallel hook execution", () => {
    it("executes multiple hooks in parallel", async () => {
      const executor = new HookExecutor({ nonBlocking: true });

      const hooks = ["post-merge", "post-commit", "post-checkout"];

      const context: HookContext = {
        artifactId: "test.yml",
        eventType: "completed",
        timestamp: new Date().toISOString(),
      };

      // Execute all hooks in parallel
      const startTime = performance.now();
      const results = await Promise.all(
        hooks.map((hook) => executor.executeHook(hook, context)),
      );
      const endTime = performance.now();

      // All should succeed
      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.success).toBe(true);
        expect(result.duration).toBeGreaterThan(0);
      }

      // Parallel execution completes efficiently
      expect(endTime - startTime).toBeLessThan(500);
    });
  });

  describe("E2E: Uninstall hooks and restore backups", () => {
    it("uninstalls hooks and removes hook files", async () => {
      const installer = new HookInstaller({ gitRoot });

      // Install hooks first
      await installer.installHooks();

      // Verify hooks are installed
      expect(fs.existsSync(path.join(hooksDir, "post-merge"))).toBe(true);

      // Uninstall hooks
      const result = await installer.uninstallHooks();

      expect(result.success).toBe(true);
      expect(result.removed).toContain("post-merge");
      expect(result.removed).toContain("post-commit");
      expect(result.removed).toContain("post-checkout");

      // Verify hooks are removed
      expect(fs.existsSync(path.join(hooksDir, "post-merge"))).toBe(false);
      expect(fs.existsSync(path.join(hooksDir, "post-commit"))).toBe(false);
      expect(fs.existsSync(path.join(hooksDir, "post-checkout"))).toBe(false);
    });

    it("restores backup when uninstalling with force option", async () => {
      const installer = new HookInstaller({ gitRoot, force: true });

      // Create existing hook
      const hookPath = path.join(hooksDir, "post-merge");
      const originalContent = "#!/bin/bash\necho 'original'";
      await fs.promises.writeFile(hookPath, originalContent);
      await fs.promises.chmod(hookPath, 0o755);

      // Install with force (creates backup)
      await installer.installHooks();

      // Verify backup exists
      expect(fs.existsSync(`${hookPath}.kodebase-backup`)).toBe(true);

      // Uninstall (restores backup)
      const result = await installer.uninstallHooks();

      expect(result.success).toBe(true);
      expect(result.restored).toContain("post-merge");

      // Verify original content is restored
      const restoredContent = await fs.promises.readFile(hookPath, "utf-8");
      expect(restoredContent).toBe(originalContent);
    });
  });

  describe("E2E: Idempotency prevents duplicate executions", () => {
    it("prevents duplicate hook execution for same event", async () => {
      const tracker = new IdempotencyTracker();
      const events: TEvent[] = [];

      // First check - should execute (no prior events)
      const shouldExecuteFirst = tracker.shouldExecuteHook(
        events,
        "post-merge",
      );
      expect(shouldExecuteFirst.shouldExecute).toBe(true);
      expect(shouldExecuteFirst.reason).toContain("never been executed");

      // Record successful execution
      const event1 = tracker.createHookExecutionEvent(
        "post-merge",
        "success",
        "test-actor",
      );
      events.push(event1);

      // Second check - should not execute (already succeeded)
      const shouldExecuteSecond = tracker.shouldExecuteHook(
        events,
        "post-merge",
      );
      expect(shouldExecuteSecond.shouldExecute).toBe(false);
      expect(shouldExecuteSecond.reason).toContain(
        "already executed successfully",
      );
    });

    it("allows retry after failure with retry timeout", async () => {
      const tracker = new IdempotencyTracker({ retryTimeout: 0 }); // Immediate retry allowed
      const events: TEvent[] = [];

      // First check - should execute
      const shouldExecuteFirst = tracker.shouldExecuteHook(
        events,
        "post-merge",
      );
      expect(shouldExecuteFirst.shouldExecute).toBe(true);

      // Record failed execution
      const event1 = tracker.createHookExecutionEvent(
        "post-merge",
        "failed",
        "test-actor",
      );
      events.push(event1);

      // Second check - should be allowed (retry after failure with 0 timeout)
      const shouldExecuteSecond = tracker.shouldExecuteHook(
        events,
        "post-merge",
      );
      expect(shouldExecuteSecond.shouldExecute).toBe(true);
      expect(shouldExecuteSecond.reason).toContain("retry timeout passed");
    });

    it("prevents retry before timeout expires", async () => {
      const tracker = new IdempotencyTracker({ retryTimeout: 60000 }); // 1 minute
      const events: TEvent[] = [];

      // Record failed execution
      const event1 = tracker.createHookExecutionEvent(
        "post-merge",
        "failed",
        "test-actor",
      );
      events.push(event1);

      // Check immediately - should be blocked (retry timeout not expired)
      const shouldExecute = tracker.shouldExecuteHook(events, "post-merge");
      expect(shouldExecute.shouldExecute).toBe(false);
      expect(shouldExecute.reason).toContain("retry timeout not reached");
    });
  });

  describe("E2E: Complete workflow integration", () => {
    it("runs complete workflow: install -> execute -> log -> uninstall", async () => {
      const installer = new HookInstaller({ gitRoot });
      const logger = new HookLogger({
        logFile,
        fileOutput: true,
        consoleOutput: false,
      });
      const tracker = new IdempotencyTracker();
      const executor = new HookExecutor({ logger, nonBlocking: true });

      // 1. Install hooks
      const installResult = await installer.installHooks();
      expect(installResult.success).toBe(true);
      expect(installResult.installed).toHaveLength(3);

      // 2. Check idempotency (should execute - no prior events)
      const context: HookContext = {
        artifactId: "test.yml",
        eventType: "completed",
        timestamp: new Date().toISOString(),
      };
      const events: TEvent[] = [];
      const shouldExecute = tracker.shouldExecuteHook(events, "post-merge");
      expect(shouldExecute.shouldExecute).toBe(true);

      // 3. Execute hook
      const execResult = await executor.executeHook("post-merge", context);
      expect(execResult.success).toBe(true);

      // 4. Record execution
      const executionEvent = tracker.createHookExecutionEvent(
        "post-merge",
        "success",
        "test-actor",
      );
      events.push(executionEvent);

      // 5. Verify logging
      const logContent = await fs.promises.readFile(logFile, "utf-8");
      expect(logContent).toContain('"hookName":"post-merge"');
      expect(logContent).toContain('"status":"started"');
      expect(logContent).toContain('"status":"success"');

      // 6. Verify idempotency (should not execute again)
      const shouldExecuteAgain = tracker.shouldExecuteHook(
        events,
        "post-merge",
      );
      expect(shouldExecuteAgain.shouldExecute).toBe(false);

      // 7. Uninstall hooks
      const uninstallResult = await installer.uninstallHooks();
      expect(uninstallResult.success).toBe(true);
      expect(uninstallResult.removed).toContain("post-merge");

      // 8. Verify hooks removed
      const hookPath = path.join(hooksDir, "post-merge");
      expect(fs.existsSync(hookPath)).toBe(false);
    });
  });
});
