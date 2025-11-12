/**
 * Utility functions for executing shell commands
 */

import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";

const execPromise = promisify(exec);

/**
 * Result of executing a shell command
 */
export interface ExecResult {
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Exit code (0 for success) */
  exitCode: number;
}

/**
 * Execute a shell command asynchronously
 *
 * @param command - Command to execute
 * @param options - Execution options (passed to child_process.exec)
 * @returns Promise resolving to execution result
 *
 * @remarks
 * Unlike the standard exec, this function:
 * - Always resolves (never rejects on non-zero exit codes)
 * - Returns exitCode in the result for proper error handling
 * - Captures both stdout and stderr
 *
 * @example
 * ```typescript
 * const { stdout, stderr, exitCode } = await execAsync('git status');
 * if (exitCode !== 0) {
 *   console.error('Command failed:', stderr);
 * } else {
 *   console.log('Output:', stdout);
 * }
 * ```
 */
export async function execAsync(
  command: string,
  options?: Parameters<typeof exec>[1],
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execPromise(command, options);
    return {
      stdout: String(stdout).trim(),
      stderr: String(stderr).trim(),
      exitCode: 0,
    };
  } catch (error: unknown) {
    // exec throws on non-zero exit codes, but we want to return them
    if (error && typeof error === "object" && "code" in error) {
      const execError = error as {
        stdout?: string;
        stderr?: string;
        code?: number;
      };
      return {
        stdout: String(execError.stdout ?? "").trim(),
        stderr: String(execError.stderr ?? "").trim(),
        exitCode: execError.code ?? 1,
      };
    }
    // Re-throw unexpected errors
    throw error;
  }
}

/**
 * Execute a shell command with stdin input
 *
 * @param command - Command to execute (array of args)
 * @param stdin - Input to write to stdin
 * @returns Promise resolving to execution result
 *
 * @remarks
 * Uses spawn to properly handle stdin input without shell escaping issues.
 * Useful for commands that need multi-line input or special characters.
 *
 * @example
 * ```typescript
 * const result = await execWithStdin(['gh', 'pr', 'create', '--body-file', '-'], 'PR body\n\nWith newlines');
 * ```
 */
export async function execWithStdin(
  args: string[],
  stdin?: string,
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const [command, ...restArgs] = args;
    const child = spawn(command ?? "", restArgs);

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code: number | null) => {
      resolve({
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: code ?? 0,
      });
    });

    child.on("error", (error: Error) => {
      resolve({
        stdout: "",
        stderr: error.message,
        exitCode: 1,
      });
    });

    // Write stdin if provided
    if (stdin && child.stdin) {
      child.stdin.write(stdin);
    }
    child.stdin?.end();
  });
}
