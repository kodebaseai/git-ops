/**
 * Structured logging system for hook execution with performance monitoring
 */

import * as fs from "node:fs";
import * as path from "node:path";
import {
  CLogLevel,
  type HookLogEntry,
  type HookLoggerConfig,
  type TLogLevel,
} from "./logger-types.js";

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<HookLoggerConfig> = {
  logLevel: (process.env.KODEBASE_LOG_LEVEL as TLogLevel) || CLogLevel.INFO,
  logFile: ".kodebase/logs/hooks.log",
  consoleOutput: true,
  fileOutput: true,
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
};

/**
 * Log level priorities for filtering
 */
const LOG_LEVEL_PRIORITY: Record<TLogLevel, number> = {
  [CLogLevel.DEBUG]: 0,
  [CLogLevel.INFO]: 1,
  [CLogLevel.WARN]: 2,
  [CLogLevel.ERROR]: 3,
};

/**
 * Structured logger for hook execution with performance monitoring and log rotation.
 *
 * Features:
 * - Structured JSON logging with configurable levels
 * - File-based logging with automatic rotation
 * - Performance metrics tracking
 * - Environment variable configuration
 *
 * @example
 * ```ts
 * const logger = new HookLogger({ logLevel: 'debug' });
 *
 * logger.logStart('post-merge', 'A.1.2');
 * // ... execute hook ...
 * logger.logSuccess('post-merge', 'A.1.2', 1250);
 * ```
 */
export class HookLogger {
  private readonly config: Required<HookLoggerConfig>;

  constructor(config: HookLoggerConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };

    // Ensure log directory exists
    if (this.config.fileOutput) {
      this.ensureLogDirectory();
    }
  }

  /**
   * Log hook execution start
   */
  logStart(hookName: string, artifactId: string): void {
    this.log({
      level: CLogLevel.INFO,
      hookName,
      artifactId,
      status: "started",
    });
  }

  /**
   * Log successful hook execution
   */
  logSuccess(
    hookName: string,
    artifactId: string,
    duration: number,
    metadata?: Record<string, unknown>,
  ): void {
    this.log({
      level: CLogLevel.INFO,
      hookName,
      artifactId,
      duration,
      status: "success",
      metadata,
    });
  }

  /**
   * Log failed hook execution
   */
  logError(
    hookName: string,
    artifactId: string,
    error: Error | string,
    duration?: number,
  ): void {
    this.log({
      level: CLogLevel.ERROR,
      hookName,
      artifactId,
      duration,
      status: "failed",
      error: error instanceof Error ? error.message : error,
    });
  }

  /**
   * Log debug message
   */
  debug(
    hookName: string,
    artifactId: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log({
      level: CLogLevel.DEBUG,
      hookName,
      artifactId,
      metadata,
    });
  }

  /**
   * Log warning message
   */
  warn(
    hookName: string,
    artifactId: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.log({
      level: CLogLevel.WARN,
      hookName,
      artifactId,
      metadata: { ...metadata, message },
    });
  }

  /**
   * Core logging method - writes structured log entry
   */
  private log(entry: Omit<HookLogEntry, "timestamp">): void {
    // Check if log level meets minimum threshold
    if (
      LOG_LEVEL_PRIORITY[entry.level] < LOG_LEVEL_PRIORITY[this.config.logLevel]
    ) {
      return;
    }

    // Create complete log entry with timestamp
    const logEntry: HookLogEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    // Output to console if enabled
    if (this.config.consoleOutput) {
      this.writeToConsole(logEntry);
    }

    // Output to file if enabled
    if (this.config.fileOutput) {
      this.writeToFile(logEntry);
    }
  }

  /**
   * Write log entry to console with color coding
   */
  private writeToConsole(entry: HookLogEntry): void {
    const logLine = JSON.stringify(entry);

    switch (entry.level) {
      case CLogLevel.ERROR:
        console.error(logLine);
        break;
      case CLogLevel.WARN:
        console.warn(logLine);
        break;
      default:
        console.log(logLine);
        break;
    }
  }

  /**
   * Write log entry to file with rotation support
   */
  private writeToFile(entry: HookLogEntry): void {
    try {
      const logLine = `${JSON.stringify(entry)}\n`;

      // Check if rotation is needed
      if (this.shouldRotate()) {
        this.rotateLogFile();
      }

      // Append to log file
      fs.appendFileSync(this.config.logFile, logLine, "utf-8");
    } catch (error) {
      // If file logging fails, output to stderr but don't throw
      console.error(
        `Failed to write to log file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if log file should be rotated based on size
   */
  private shouldRotate(): boolean {
    try {
      if (!fs.existsSync(this.config.logFile)) {
        return false;
      }

      const stats = fs.statSync(this.config.logFile);
      return stats.size >= this.config.maxFileSize;
    } catch {
      return false;
    }
  }

  /**
   * Rotate log file - move current to .1, .1 to .2, etc.
   */
  private rotateLogFile(): void {
    try {
      // Remove oldest log file if it exists
      const oldestLog = `${this.config.logFile}.${this.config.maxFiles}`;
      if (fs.existsSync(oldestLog)) {
        fs.unlinkSync(oldestLog);
      }

      // Rotate existing log files
      for (let i = this.config.maxFiles - 1; i >= 1; i--) {
        const currentLog = `${this.config.logFile}.${i}`;
        const nextLog = `${this.config.logFile}.${i + 1}`;

        if (fs.existsSync(currentLog)) {
          fs.renameSync(currentLog, nextLog);
        }
      }

      // Move current log to .1
      if (fs.existsSync(this.config.logFile)) {
        fs.renameSync(this.config.logFile, `${this.config.logFile}.1`);
      }
    } catch (error) {
      console.error(
        `Failed to rotate log file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Ensure log directory exists
   */
  private ensureLogDirectory(): void {
    try {
      const logDir = path.dirname(this.config.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    } catch (error) {
      console.error(
        `Failed to create log directory: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
