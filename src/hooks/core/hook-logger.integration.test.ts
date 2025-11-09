/**
 * Tests for HookLogger
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HookLogger } from "./hook-logger.js";
import { CLogLevel } from "./logger-types.js";

const createFakeConsole = () => {
  const logs: string[] = [];
  const warns: string[] = [];
  const errors: string[] = [];
  return {
    log: (line: string) => {
      logs.push(line);
    },
    warn: (line: string) => {
      warns.push(line);
    },
    error: (line: string) => {
      errors.push(line);
    },
    logs,
    warns,
    errors,
  };
};

describe("HookLogger", () => {
  let tempDir: string;
  let logFile: string;

  beforeEach(async () => {
    // Create temporary directory for test logs
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "logger-test-"));
    logFile = path.join(tempDir, "hooks.log");
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe("Constructor", () => {
    it("creates logger with default config", () => {
      const logger = new HookLogger();
      expect(logger).toBeInstanceOf(HookLogger);
    });

    it("creates log directory if file output enabled", () => {
      const logPath = path.join(tempDir, "nested", "dir", "hooks.log");
      new HookLogger({ logFile: logPath, fileOutput: true });

      const dirExists = fs.existsSync(path.dirname(logPath));
      expect(dirExists).toBe(true);
    });

    it("uses info log level by default when env var not set", () => {
      const originalEnv = process.env.KODEBASE_LOG_LEVEL;
      delete process.env.KODEBASE_LOG_LEVEL;

      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      // Debug should be filtered at info level
      logger.debug("test-hook", "A.1.2");
      expect(fakeConsole.logs).toHaveLength(0);

      // Info should log
      logger.logStart("test-hook", "A.1.2");
      expect(fakeConsole.logs).toHaveLength(1);

      if (originalEnv) {
        process.env.KODEBASE_LOG_LEVEL = originalEnv;
      }
    });
  });

  describe("Log levels", () => {
    it("logs debug messages when log level is debug", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        logLevel: CLogLevel.DEBUG,
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.debug("test-hook", "A.1.2", { foo: "bar" });

      expect(fakeConsole.logs).toHaveLength(1);
      expect(JSON.parse(fakeConsole.logs[0])).toMatchObject({
        level: "debug",
        hookName: "test-hook",
        artifactId: "A.1.2",
        metadata: { foo: "bar" },
      });
    });

    it("filters out debug messages when log level is info", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        logLevel: CLogLevel.INFO,
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.debug("test-hook", "A.1.2");

      expect(fakeConsole.logs).toHaveLength(0);
    });

    it("logs info messages when log level is info", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        logLevel: CLogLevel.INFO,
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logStart("test-hook", "A.1.2");

      expect(fakeConsole.logs).toHaveLength(1);
      expect(JSON.parse(fakeConsole.logs[0]).level).toBe("info");
    });

    it("logs warnings when log level is warn", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        logLevel: CLogLevel.WARN,
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.warn("test-hook", "A.1.2", "Test warning");

      expect(fakeConsole.warns).toHaveLength(1);
      expect(JSON.parse(fakeConsole.warns[0]).level).toBe("warn");
    });

    it("logs errors when log level is error", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        logLevel: CLogLevel.ERROR,
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logError("test-hook", "A.1.2", "Test error");

      expect(fakeConsole.errors).toHaveLength(1);
      expect(JSON.parse(fakeConsole.errors[0]).level).toBe("error");
    });

    it("filters out lower priority logs", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        logLevel: CLogLevel.WARN,
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logStart("test-hook", "A.1.2"); // info - should be filtered
      logger.debug("test-hook", "A.1.2"); // debug - should be filtered
      logger.warn("test-hook", "A.1.2", "Warning"); // warn - should log

      expect(fakeConsole.logs).toHaveLength(0);
      expect(fakeConsole.warns).toHaveLength(1);
    });
  });

  describe("Structured logging", () => {
    it("includes all required fields in log entry", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logSuccess("post-merge", "A.1.2", 1250);

      const logEntry = JSON.parse(fakeConsole.logs[0]);

      expect(logEntry).toMatchObject({
        level: "info",
        hookName: "post-merge",
        artifactId: "A.1.2",
        duration: 1250,
        status: "success",
      });
      expect(typeof logEntry.timestamp).toBe("string");
      expect(Number.isNaN(Date.parse(logEntry.timestamp))).toBe(false);
    });

    it("includes error message in failed execution", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logError("post-merge", "A.1.2", new Error("Test error"), 500);

      const logEntry = JSON.parse(fakeConsole.errors[0]);

      expect(logEntry).toMatchObject({
        level: "error",
        hookName: "post-merge",
        artifactId: "A.1.2",
        duration: 500,
        status: "failed",
        error: "Test error",
      });
    });

    it("handles string errors", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logError("post-merge", "A.1.2", "String error message");

      const logEntry = JSON.parse(fakeConsole.errors[0]);

      expect(logEntry.error).toBe("String error message");
    });

    it("includes metadata when provided", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logSuccess("post-merge", "A.1.2", 1250, { customField: "value" });

      const logEntry = JSON.parse(fakeConsole.logs[0]);

      expect(logEntry.metadata).toEqual({ customField: "value" });
    });
  });

  describe("Console output", () => {
    it("outputs to console when consoleOutput is true", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        consoleOutput: true,
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logStart("test-hook", "A.1.2");

      expect(fakeConsole.logs).toHaveLength(1);
    });

    it("does not output to console when consoleOutput is false", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        consoleOutput: false,
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logStart("test-hook", "A.1.2");

      expect(fakeConsole.logs).toHaveLength(0);
    });

    it("uses console.error for error level", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logError("test-hook", "A.1.2", "Error");

      expect(fakeConsole.errors).toHaveLength(1);
    });

    it("uses console.warn for warn level", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.warn("test-hook", "A.1.2", "Warning");

      expect(fakeConsole.warns).toHaveLength(1);
    });
  });

  describe("File output", () => {
    it("writes to log file when fileOutput is true", async () => {
      const logger = new HookLogger({
        logFile,
        fileOutput: true,
        consoleOutput: false,
      });

      logger.logStart("test-hook", "A.1.2");

      const content = await fs.promises.readFile(logFile, "utf-8");
      const logEntry = JSON.parse(content);

      expect(logEntry).toMatchObject({
        level: "info",
        hookName: "test-hook",
        artifactId: "A.1.2",
        status: "started",
      });
    });

    it("does not write to file when fileOutput is false", async () => {
      const logger = new HookLogger({
        logFile,
        fileOutput: false,
        consoleOutput: false,
      });

      logger.logStart("test-hook", "A.1.2");

      const fileExists = fs.existsSync(logFile);
      expect(fileExists).toBe(false);
    });

    it("appends multiple log entries", async () => {
      const logger = new HookLogger({
        logFile,
        fileOutput: true,
        consoleOutput: false,
      });

      logger.logStart("test-hook", "A.1.2");
      logger.logSuccess("test-hook", "A.1.2", 1250);

      const content = await fs.promises.readFile(logFile, "utf-8");
      const lines = content.trim().split("\n");

      expect(lines).toHaveLength(2);
      const entry1 = JSON.parse(lines[0]);
      const entry2 = JSON.parse(lines[1]);

      expect(entry1.status).toBe("started");
      expect(entry2.status).toBe("success");
    });

    it("handles file write errors gracefully", async () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        logFile: "/invalid/path/hooks.log",
        fileOutput: true,
        consoleOutput: false,
        consoleWriter: fakeConsole,
      });

      // Should not throw
      expect(() => {
        logger.logStart("test-hook", "A.1.2");
      }).not.toThrow();

      expect(fakeConsole.errors.length).toBeGreaterThan(0);
    });
  });

  describe("Log rotation", () => {
    it("rotates log file when max size exceeded", async () => {
      const logger = new HookLogger({
        logFile,
        fileOutput: true,
        consoleOutput: false,
        maxFileSize: 100, // Very small size to trigger rotation
        maxFiles: 3,
      });

      // Write enough logs to exceed max size
      for (let i = 0; i < 10; i++) {
        logger.logSuccess(`hook-${i}`, "A.1.2", 1000);
      }

      // Check that rotation occurred
      const rotatedFile = `${logFile}.1`;
      const rotatedExists = fs.existsSync(rotatedFile);
      expect(rotatedExists).toBe(true);
    });

    it("maintains max number of rotated files", async () => {
      const logger = new HookLogger({
        logFile,
        fileOutput: true,
        consoleOutput: false,
        maxFileSize: 50,
        maxFiles: 2,
      });

      // Write enough logs to trigger multiple rotations
      for (let i = 0; i < 20; i++) {
        logger.logSuccess(`hook-${i}`, "A.1.2", 1000);
      }

      // Should have at most 2 rotated files + current
      const file1 = `${logFile}.1`;
      const file2 = `${logFile}.2`;
      const file3 = `${logFile}.3`;

      expect(fs.existsSync(logFile)).toBe(true);
      expect(fs.existsSync(file1)).toBe(true);
      expect(fs.existsSync(file2)).toBe(true);
      expect(fs.existsSync(file3)).toBe(false);
    });

    it("handles rotation when log file doesn't exist", () => {
      const logger = new HookLogger({
        logFile,
        fileOutput: true,
        consoleOutput: false,
      });

      // First write should not trigger rotation
      logger.logStart("test-hook", "A.1.2");

      const rotatedFile = `${logFile}.1`;
      expect(fs.existsSync(rotatedFile)).toBe(false);
    });
  });

  describe("Hook lifecycle logging", () => {
    it("logs hook start", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logStart("post-merge", "A.1.2");

      const logEntry = JSON.parse(fakeConsole.logs[0]);

      expect(logEntry).toMatchObject({
        level: "info",
        hookName: "post-merge",
        artifactId: "A.1.2",
        status: "started",
      });
    });

    it("logs hook success with duration", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logSuccess("post-merge", "A.1.2", 1250);

      const logEntry = JSON.parse(fakeConsole.logs[0]);

      expect(logEntry).toMatchObject({
        level: "info",
        hookName: "post-merge",
        artifactId: "A.1.2",
        duration: 1250,
        status: "success",
      });
    });

    it("logs hook error with duration", () => {
      const fakeConsole = createFakeConsole();
      const logger = new HookLogger({
        fileOutput: false,
        consoleWriter: fakeConsole,
      });

      logger.logError("post-merge", "A.1.2", new Error("Hook failed"), 500);

      const logEntry = JSON.parse(fakeConsole.errors[0]);

      expect(logEntry).toMatchObject({
        level: "error",
        hookName: "post-merge",
        artifactId: "A.1.2",
        duration: 500,
        status: "failed",
        error: "Hook failed",
      });
    });
  });
});
