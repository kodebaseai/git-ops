/**
 * Git hook installation and management utilities
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  GitHookType,
  HookInfo,
  HookInstallerConfig,
  InstallResult,
  UninstallResult,
} from "./hook-installer-types.js";

/** Marker comment to identify kodebase-managed hooks */
const KODEBASE_HOOK_MARKER = "# KODEBASE_MANAGED_HOOK";

/** Backup file suffix */
const BACKUP_SUFFIX = ".kodebase-backup";

/**
 * Hook installer for managing git hooks in .git/hooks/ directory
 */
export class HookInstaller {
  private readonly gitRoot: string;
  private readonly force: boolean;
  private readonly cliPath: string;
  private readonly hooksDir: string;

  constructor(config: HookInstallerConfig = {}) {
    this.gitRoot = config.gitRoot ?? process.cwd();
    this.force = config.force ?? false;
    this.cliPath = config.cliPath ?? "kodebase";
    this.hooksDir = path.join(this.gitRoot, ".git", "hooks");
  }

  /**
   * Install git hooks for the specified hook types
   */
  async installHooks(
    hookTypes: GitHookType[] = ["post-merge", "post-commit", "post-checkout"],
  ): Promise<InstallResult> {
    const result: InstallResult = {
      success: true,
      installed: [],
      backedUp: [],
      skipped: [],
    };

    try {
      // Ensure hooks directory exists
      await fs.promises.mkdir(this.hooksDir, { recursive: true });

      for (const hookType of hookTypes) {
        const hookPath = path.join(this.hooksDir, hookType);
        const backupPath = hookPath + BACKUP_SUFFIX;

        // Check if hook already exists
        const exists = await this.fileExists(hookPath);

        if (exists) {
          const isKodebase = await this.isKodebaseHook(hookPath);

          if (isKodebase) {
            // Update existing kodebase hook
            await this.writeHookScript(hookPath, hookType);
            result.installed.push(hookType);
          } else if (this.force) {
            // Force overwrite: backup first
            await this.backupHook(hookPath, backupPath);
            await this.writeHookScript(hookPath, hookType);
            result.backedUp.push(hookType);
            result.installed.push(hookType);
          } else {
            // Skip due to conflict
            result.skipped.push(hookType);
          }
        } else {
          // No existing hook, install directly
          await this.writeHookScript(hookPath, hookType);
          result.installed.push(hookType);
        }
      }
    } catch (error) {
      result.success = false;
      result.error =
        error instanceof Error ? error.message : "Unknown error occurred";
    }

    return result;
  }

  /**
   * Uninstall kodebase-managed hooks and restore backups
   */
  async uninstallHooks(
    hookTypes: GitHookType[] = ["post-merge", "post-commit", "post-checkout"],
  ): Promise<UninstallResult> {
    const result: UninstallResult = {
      success: true,
      removed: [],
      restored: [],
    };

    try {
      for (const hookType of hookTypes) {
        const hookPath = path.join(this.hooksDir, hookType);
        const backupPath = hookPath + BACKUP_SUFFIX;

        const exists = await this.fileExists(hookPath);
        if (!exists) {
          continue;
        }

        const isKodebase = await this.isKodebaseHook(hookPath);
        if (!isKodebase) {
          // Not a kodebase hook, skip
          continue;
        }

        // Remove kodebase hook
        await fs.promises.unlink(hookPath);
        result.removed.push(hookType);

        // Restore backup if it exists
        const backupExists = await this.fileExists(backupPath);
        if (backupExists) {
          await fs.promises.rename(backupPath, hookPath);
          result.restored.push(hookType);
        }
      }
    } catch (error) {
      result.success = false;
      result.error =
        error instanceof Error ? error.message : "Unknown error occurred";
    }

    return result;
  }

  /**
   * Detect existing hooks in the repository
   */
  async detectExistingHooks(
    hookTypes: GitHookType[] = ["post-merge", "post-commit", "post-checkout"],
  ): Promise<HookInfo[]> {
    const hooks: HookInfo[] = [];

    for (const hookType of hookTypes) {
      const hookPath = path.join(this.hooksDir, hookType);
      const backupPath = hookPath + BACKUP_SUFFIX;

      const exists = await this.fileExists(hookPath);
      if (!exists) {
        continue;
      }

      const isKodebase = await this.isKodebaseHook(hookPath);
      const hasBackup = await this.fileExists(backupPath);

      hooks.push({
        type: hookType,
        isKodebaseHook: isKodebase,
        hasBackup,
        path: hookPath,
      });
    }

    return hooks;
  }

  /**
   * Check if a hook file is kodebase-managed
   */
  private async isKodebaseHook(hookPath: string): Promise<boolean> {
    try {
      const content = await fs.promises.readFile(hookPath, "utf-8");
      return content.includes(KODEBASE_HOOK_MARKER);
    } catch {
      return false;
    }
  }

  /**
   * Backup an existing hook file
   */
  private async backupHook(
    hookPath: string,
    backupPath: string,
  ): Promise<void> {
    await fs.promises.copyFile(hookPath, backupPath);
  }

  /**
   * Write hook script to file
   */
  private async writeHookScript(
    hookPath: string,
    hookType: GitHookType,
  ): Promise<void> {
    const script = this.generateHookScript(hookType);
    await fs.promises.writeFile(hookPath, script, { mode: 0o755 });
  }

  /**
   * Generate hook script content
   */
  private generateHookScript(hookType: GitHookType): string {
    return `#!/usr/bin/env bash
${KODEBASE_HOOK_MARKER}
# This hook is managed by kodebase
# To uninstall: run 'kodebase hooks uninstall'

# Call kodebase CLI to handle ${hookType} event
${this.cliPath} hooks execute ${hookType} "$@"
`;
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a hook installer instance
 */
export function createHookInstaller(
  config: HookInstallerConfig = {},
): HookInstaller {
  return new HookInstaller(config);
}
