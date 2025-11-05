/**
 * Tests for HookInstaller
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HookInstaller } from "./hook-installer.js";
import type { GitHookType } from "./hook-installer-types.js";

describe("HookInstaller", () => {
  let tempDir: string;
  let gitRoot: string;
  let hooksDir: string;
  let installer: HookInstaller;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "hook-test-"));
    gitRoot = tempDir;
    hooksDir = path.join(gitRoot, ".git", "hooks");

    // Create .git/hooks directory
    await fs.promises.mkdir(hooksDir, { recursive: true });

    installer = new HookInstaller({ gitRoot });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe("installHooks", () => {
    it("installs hooks when no existing hooks present", async () => {
      const result = await installer.installHooks();

      expect(result.success).toBe(true);
      expect(result.installed).toEqual([
        "post-merge",
        "post-commit",
        "post-checkout",
      ]);
      expect(result.backedUp).toEqual([]);
      expect(result.skipped).toEqual([]);

      // Verify hook files exist and are executable
      const hookTypes: GitHookType[] = [
        "post-merge",
        "post-commit",
        "post-checkout",
      ];
      for (const hookType of hookTypes) {
        const hookPath = path.join(hooksDir, hookType);
        const stats = await fs.promises.stat(hookPath);
        expect(stats.mode & 0o111).toBeGreaterThan(0); // Has execute permission
      }
    });

    it("installs only specified hook types", async () => {
      const result = await installer.installHooks(["post-merge"]);

      expect(result.success).toBe(true);
      expect(result.installed).toEqual(["post-merge"]);

      const postMergeExists = await fileExists(
        path.join(hooksDir, "post-merge"),
      );
      const postCommitExists = await fileExists(
        path.join(hooksDir, "post-commit"),
      );

      expect(postMergeExists).toBe(true);
      expect(postCommitExists).toBe(false);
    });

    it("creates hook scripts with proper shebang", async () => {
      await installer.installHooks(["post-merge"]);

      const hookPath = path.join(hooksDir, "post-merge");
      const content = await fs.promises.readFile(hookPath, "utf-8");

      expect(content).toMatch(/^#!\/usr\/bin\/env bash/);
    });

    it("creates hook scripts with kodebase marker", async () => {
      await installer.installHooks(["post-merge"]);

      const hookPath = path.join(hooksDir, "post-merge");
      const content = await fs.promises.readFile(hookPath, "utf-8");

      expect(content).toContain("# KODEBASE_MANAGED_HOOK");
    });

    it("creates hook scripts that call kodebase CLI", async () => {
      await installer.installHooks(["post-merge"]);

      const hookPath = path.join(hooksDir, "post-merge");
      const content = await fs.promises.readFile(hookPath, "utf-8");

      expect(content).toContain("kodebase hooks execute post-merge");
    });

    it("uses custom CLI path when configured", async () => {
      const customInstaller = new HookInstaller({
        gitRoot,
        cliPath: "/usr/local/bin/kodebase",
      });

      await customInstaller.installHooks(["post-merge"]);

      const hookPath = path.join(hooksDir, "post-merge");
      const content = await fs.promises.readFile(hookPath, "utf-8");

      expect(content).toContain("/usr/local/bin/kodebase hooks execute");
    });

    it("updates existing kodebase hooks", async () => {
      // Install hooks first
      await installer.installHooks(["post-merge"]);

      // Modify the hook
      const hookPath = path.join(hooksDir, "post-merge");
      let content = await fs.promises.readFile(hookPath, "utf-8");
      content += "\n# Modified\n";
      await fs.promises.writeFile(hookPath, content);

      // Install again - should update
      const result = await installer.installHooks(["post-merge"]);

      expect(result.success).toBe(true);
      expect(result.installed).toEqual(["post-merge"]);
      expect(result.backedUp).toEqual([]);
      expect(result.skipped).toEqual([]);

      // Verify hook was updated (no "Modified" comment)
      const newContent = await fs.promises.readFile(hookPath, "utf-8");
      expect(newContent).not.toContain("# Modified");
      expect(newContent).toContain("# KODEBASE_MANAGED_HOOK");
    });

    it("skips non-kodebase hooks when force is false", async () => {
      // Create a non-kodebase hook
      const hookPath = path.join(hooksDir, "post-merge");
      await fs.promises.writeFile(
        hookPath,
        "#!/bin/bash\necho 'custom hook'\n",
        { mode: 0o755 },
      );

      const result = await installer.installHooks(["post-merge"]);

      expect(result.success).toBe(true);
      expect(result.installed).toEqual([]);
      expect(result.skipped).toEqual(["post-merge"]);

      // Verify original hook is unchanged
      const content = await fs.promises.readFile(hookPath, "utf-8");
      expect(content).toContain("custom hook");
      expect(content).not.toContain("KODEBASE_MANAGED_HOOK");
    });

    it("backs up and overwrites non-kodebase hooks when force is true", async () => {
      const forceInstaller = new HookInstaller({ gitRoot, force: true });

      // Create a non-kodebase hook
      const hookPath = path.join(hooksDir, "post-merge");
      const originalContent = "#!/bin/bash\necho 'custom hook'\n";
      await fs.promises.writeFile(hookPath, originalContent, { mode: 0o755 });

      const result = await forceInstaller.installHooks(["post-merge"]);

      expect(result.success).toBe(true);
      expect(result.installed).toEqual(["post-merge"]);
      expect(result.backedUp).toEqual(["post-merge"]);
      expect(result.skipped).toEqual([]);

      // Verify backup exists with original content
      const backupPath = `${hookPath}.kodebase-backup`;
      const backupContent = await fs.promises.readFile(backupPath, "utf-8");
      expect(backupContent).toBe(originalContent);

      // Verify hook is now kodebase-managed
      const newContent = await fs.promises.readFile(hookPath, "utf-8");
      expect(newContent).toContain("KODEBASE_MANAGED_HOOK");
    });

    it("handles missing .git/hooks directory", async () => {
      // Remove hooks directory
      await fs.promises.rm(hooksDir, { recursive: true, force: true });

      const result = await installer.installHooks(["post-merge"]);

      expect(result.success).toBe(true);
      expect(result.installed).toEqual(["post-merge"]);

      // Verify directory was created
      const dirExists = await fileExists(hooksDir);
      expect(dirExists).toBe(true);
    });

    it("returns error when installation fails", async () => {
      // Make hooks directory read-only to trigger error
      await fs.promises.chmod(hooksDir, 0o444);

      const result = await installer.installHooks(["post-merge"]);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Restore permissions for cleanup
      await fs.promises.chmod(hooksDir, 0o755);
    });
  });

  describe("uninstallHooks", () => {
    it("removes kodebase-managed hooks", async () => {
      // Install hooks first
      await installer.installHooks();

      const result = await installer.uninstallHooks();

      expect(result.success).toBe(true);
      expect(result.removed).toEqual([
        "post-merge",
        "post-commit",
        "post-checkout",
      ]);
      expect(result.restored).toEqual([]);

      // Verify hooks are removed
      const hookTypes: GitHookType[] = [
        "post-merge",
        "post-commit",
        "post-checkout",
      ];
      for (const hookType of hookTypes) {
        const hookPath = path.join(hooksDir, hookType);
        const exists = await fileExists(hookPath);
        expect(exists).toBe(false);
      }
    });

    it("uninstalls only specified hook types", async () => {
      // Install hooks first
      await installer.installHooks();

      const result = await installer.uninstallHooks(["post-merge"]);

      expect(result.success).toBe(true);
      expect(result.removed).toEqual(["post-merge"]);

      const postMergeExists = await fileExists(
        path.join(hooksDir, "post-merge"),
      );
      const postCommitExists = await fileExists(
        path.join(hooksDir, "post-commit"),
      );

      expect(postMergeExists).toBe(false);
      expect(postCommitExists).toBe(true);
    });

    it("restores backed-up hooks", async () => {
      const forceInstaller = new HookInstaller({ gitRoot, force: true });

      // Create a non-kodebase hook
      const hookPath = path.join(hooksDir, "post-merge");
      const originalContent = "#!/bin/bash\necho 'custom hook'\n";
      await fs.promises.writeFile(hookPath, originalContent, { mode: 0o755 });

      // Install with force (creates backup)
      await forceInstaller.installHooks(["post-merge"]);

      // Uninstall
      const result = await forceInstaller.uninstallHooks(["post-merge"]);

      expect(result.success).toBe(true);
      expect(result.removed).toEqual(["post-merge"]);
      expect(result.restored).toEqual(["post-merge"]);

      // Verify original hook is restored
      const content = await fs.promises.readFile(hookPath, "utf-8");
      expect(content).toBe(originalContent);
      expect(content).not.toContain("KODEBASE_MANAGED_HOOK");

      // Verify backup is removed
      const backupPath = `${hookPath}.kodebase-backup`;
      const backupExists = await fileExists(backupPath);
      expect(backupExists).toBe(false);
    });

    it("skips non-kodebase hooks", async () => {
      // Create a non-kodebase hook
      const hookPath = path.join(hooksDir, "post-merge");
      const originalContent = "#!/bin/bash\necho 'custom hook'\n";
      await fs.promises.writeFile(hookPath, originalContent, { mode: 0o755 });

      const result = await installer.uninstallHooks(["post-merge"]);

      expect(result.success).toBe(true);
      expect(result.removed).toEqual([]);
      expect(result.restored).toEqual([]);

      // Verify hook is unchanged
      const content = await fs.promises.readFile(hookPath, "utf-8");
      expect(content).toBe(originalContent);
    });

    it("handles missing hooks gracefully", async () => {
      const result = await installer.uninstallHooks();

      expect(result.success).toBe(true);
      expect(result.removed).toEqual([]);
      expect(result.restored).toEqual([]);
    });
  });

  describe("detectExistingHooks", () => {
    it("returns empty array when no hooks exist", async () => {
      const hooks = await installer.detectExistingHooks();

      expect(hooks).toEqual([]);
    });

    it("detects kodebase-managed hooks", async () => {
      // Install hooks
      await installer.installHooks(["post-merge", "post-commit"]);

      const hooks = await installer.detectExistingHooks();

      expect(hooks).toHaveLength(2);
      expect(hooks[0]).toMatchObject({
        type: "post-merge",
        isKodebaseHook: true,
        hasBackup: false,
      });
      expect(hooks[1]).toMatchObject({
        type: "post-commit",
        isKodebaseHook: true,
        hasBackup: false,
      });
    });

    it("detects non-kodebase hooks", async () => {
      // Create a non-kodebase hook
      const hookPath = path.join(hooksDir, "post-merge");
      await fs.promises.writeFile(
        hookPath,
        "#!/bin/bash\necho 'custom hook'\n",
        { mode: 0o755 },
      );

      const hooks = await installer.detectExistingHooks();

      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toMatchObject({
        type: "post-merge",
        isKodebaseHook: false,
        hasBackup: false,
        path: hookPath,
      });
    });

    it("detects hooks with backups", async () => {
      const forceInstaller = new HookInstaller({ gitRoot, force: true });

      // Create a non-kodebase hook
      const hookPath = path.join(hooksDir, "post-merge");
      await fs.promises.writeFile(
        hookPath,
        "#!/bin/bash\necho 'custom hook'\n",
        { mode: 0o755 },
      );

      // Install with force (creates backup)
      await forceInstaller.installHooks(["post-merge"]);

      const hooks = await forceInstaller.detectExistingHooks();

      expect(hooks).toHaveLength(1);
      expect(hooks[0]).toMatchObject({
        type: "post-merge",
        isKodebaseHook: true,
        hasBackup: true,
      });
    });

    it("detects only specified hook types", async () => {
      // Install all hooks
      await installer.installHooks();

      const hooks = await installer.detectExistingHooks([
        "post-merge",
        "post-commit",
      ]);

      expect(hooks).toHaveLength(2);
      expect(hooks.map((h) => h.type)).toEqual(["post-merge", "post-commit"]);
    });

    it("handles mixed kodebase and non-kodebase hooks", async () => {
      // Install kodebase hook
      await installer.installHooks(["post-merge"]);

      // Create non-kodebase hook
      const postCommitPath = path.join(hooksDir, "post-commit");
      await fs.promises.writeFile(
        postCommitPath,
        "#!/bin/bash\necho 'custom'\n",
        { mode: 0o755 },
      );

      const hooks = await installer.detectExistingHooks();

      expect(hooks).toHaveLength(2);
      const postMergeHook = hooks.find((h) => h.type === "post-merge");
      const postCommitHook = hooks.find((h) => h.type === "post-commit");

      expect(postMergeHook?.isKodebaseHook).toBe(true);
      expect(postCommitHook?.isKodebaseHook).toBe(false);
    });
  });
});

/**
 * Helper function to check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}
