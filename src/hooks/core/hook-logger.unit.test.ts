import { beforeEach, describe, expect, it, vi } from "vitest";
import { HookLogger } from "./hook-logger.js";
import { CLogLevel } from "./logger-types.js";

const appendFileSync = vi.hoisted(() => vi.fn());
const existsSync = vi.hoisted(() => vi.fn());
const statSync = vi.hoisted(() => vi.fn());
const renameSync = vi.hoisted(() => vi.fn());
const unlinkSync = vi.hoisted(() => vi.fn());
const mkdirSync = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({
  appendFileSync,
  existsSync,
  statSync,
  renameSync,
  unlinkSync,
  mkdirSync,
}));

describe("HookLogger (unit)", () => {
  const consoleWriter = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    appendFileSync.mockReset();
    existsSync.mockReset();
    statSync.mockReset();
    renameSync.mockReset();
    unlinkSync.mockReset();
    mkdirSync.mockReset();
    consoleWriter.log.mockReset();
    consoleWriter.warn.mockReset();
    consoleWriter.error.mockReset();
  });

  const createLogger = (overrides = {}) =>
    new HookLogger({
      logLevel: CLogLevel.INFO,
      consoleOutput: true,
      fileOutput: true,
      logFile: "/tmp/hooks.log",
      consoleWriter,
      ...overrides,
    });

  it("writes structured entries to console and file", () => {
    existsSync.mockReturnValue(true);
    const logger = createLogger();

    logger.logStart("post-merge", "C.1.2");

    expect(consoleWriter.log).toHaveBeenCalledWith(
      expect.stringContaining("post-merge"),
    );
    expect(appendFileSync).toHaveBeenCalledWith(
      "/tmp/hooks.log",
      expect.stringContaining("post-merge"),
      "utf-8",
    );
  });

  it("honors log level thresholds", () => {
    existsSync.mockReturnValue(true);
    const logger = createLogger({ logLevel: CLogLevel.WARN });

    logger.debug("post-merge", "C.1.2");

    expect(consoleWriter.log).not.toHaveBeenCalled();
    expect(appendFileSync).not.toHaveBeenCalled();
  });

  it("rotates log files when size threshold is reached", () => {
    existsSync.mockImplementation((filePath: string) =>
      filePath.startsWith("/tmp"),
    );
    statSync.mockReturnValue({ size: 20 });

    const logger = createLogger({
      maxFileSize: 1,
      maxFiles: 2,
    });

    logger.logSuccess("post-merge", "C.1.2", 100);

    expect(renameSync).toHaveBeenCalled();
    expect(appendFileSync).toHaveBeenCalled();
  });

  it("reports file output errors to console", () => {
    existsSync.mockReturnValue(true);
    appendFileSync.mockImplementation(() => {
      throw new Error("disk full");
    });

    const logger = createLogger();
    logger.logError("post-merge", "C.1.2", "boom");

    expect(consoleWriter.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to write to log file"),
    );
  });
});
