/**
 * Types for git hook installation and management
 */

/**
 * Git hook types supported by kodebase
 */
export type GitHookType = "post-merge" | "post-commit" | "post-checkout";

/**
 * Information about an existing hook
 */
export interface HookInfo {
  /** Hook type */
  type: GitHookType;
  /** Whether this is a kodebase-managed hook */
  isKodebaseHook: boolean;
  /** Whether a backup exists */
  hasBackup: boolean;
  /** Full path to the hook file */
  path: string;
}

/**
 * Result of hook installation
 */
export interface InstallResult {
  /** Whether installation succeeded */
  success: boolean;
  /** Hooks that were installed */
  installed: GitHookType[];
  /** Hooks that were backed up */
  backedUp: GitHookType[];
  /** Hooks that were skipped due to conflicts */
  skipped: GitHookType[];
  /** Error message if installation failed */
  error?: string;
}

/**
 * Result of hook uninstallation
 */
export interface UninstallResult {
  /** Whether uninstallation succeeded */
  success: boolean;
  /** Hooks that were removed */
  removed: GitHookType[];
  /** Hooks that were restored from backup */
  restored: GitHookType[];
  /** Error message if uninstallation failed */
  error?: string;
}

/**
 * Configuration for hook installer
 */
export interface HookInstallerConfig {
  /** Path to git repository root (default: process.cwd()) */
  gitRoot?: string;
  /** Whether to overwrite existing non-kodebase hooks (default: false) */
  force?: boolean;
  /** Path to kodebase CLI executable (default: "kodebase") */
  cliPath?: string;
}
