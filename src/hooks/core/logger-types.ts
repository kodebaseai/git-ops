/**
 * Types for structured logging system
 */

/**
 * Log levels in order of severity
 */
export const CLogLevel = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
} as const;

export type TLogLevel = (typeof CLogLevel)[keyof typeof CLogLevel];

/**
 * Structured log entry for hook execution
 */
export type HookLogEntry = {
  /** ISO timestamp of log entry */
  timestamp: string;
  /** Log level */
  level: TLogLevel;
  /** Hook name */
  hookName: string;
  /** Artifact ID being processed */
  artifactId: string;
  /** Execution duration in milliseconds */
  duration?: number;
  /** Execution status */
  status?: "success" | "failed" | "started";
  /** Error message if execution failed */
  error?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
};

/**
 * Configuration for HookLogger
 */
export type HookLoggerConfig = {
  /** Minimum log level to output (default: 'info') */
  logLevel?: TLogLevel;
  /** Path to log file (default: '.kodebase/logs/hooks.log') */
  logFile?: string;
  /** Enable console output (default: true) */
  consoleOutput?: boolean;
  /** Enable file output (default: true) */
  fileOutput?: boolean;
  /** Maximum log file size in bytes before rotation (default: 10MB) */
  maxFileSize?: number;
  /** Maximum number of rotated log files to keep (default: 5) */
  maxFiles?: number;
  /** Optional console writer implementation (defaults to process console) */
  consoleWriter?: {
    log: (line: string) => void;
    warn: (line: string) => void;
    error: (line: string) => void;
  };
};
