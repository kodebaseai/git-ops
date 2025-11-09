import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HookInstaller } from "./hook-installer.js";
import type { GitHookType } from "./hook-installer-types.js";

type FileEntry = { content: string; isDir?: boolean };

const fileStore = vi.hoisted(() => new Map<string, FileEntry>());

const mkdirMock = vi.hoisted(() =>
  vi.fn(async (dir: string) => {
    fileStore.set(dir, { content: "", isDir: true });
  }),
);

const accessMock = vi.hoisted(() =>
  vi.fn(async (filePath: string) => {
    if (!fileStore.has(filePath)) {
      const error = new Error("not found") as NodeJS.ErrnoException;
      error.code = "ENOENT";
      throw error;
    }
  }),
);

const readFileMock = vi.hoisted(() =>
  vi.fn(async (filePath: string) => {
    return fileStore.get(filePath)?.content ?? "";
  }),
);

const writeFileMock = vi.hoisted(() =>
  vi.fn(async (filePath: string, content: string) => {
    fileStore.set(filePath, { content });
  }),
);

const copyFileMock = vi.hoisted(() =>
  vi.fn(async (src: string, dest: string) => {
    const source = fileStore.get(src);
    if (!source) throw new Error("source missing");
    fileStore.set(dest, { content: source.content });
  }),
);

const unlinkMock = vi.hoisted(() =>
  vi.fn(async (filePath: string) => {
    fileStore.delete(filePath);
  }),
);

const renameMock = vi.hoisted(() =>
  vi.fn(async (src: string, dest: string) => {
    const entry = fileStore.get(src);
    if (!entry) throw new Error("missing");
    fileStore.set(dest, entry);
    fileStore.delete(src);
  }),
);

vi.mock("node:fs", () => ({
  promises: {
    mkdir: mkdirMock,
    access: accessMock,
    readFile: readFileMock,
    writeFile: writeFileMock,
    copyFile: copyFileMock,
    unlink: unlinkMock,
    rename: renameMock,
  },
}));

const gitRoot = "/repo";
const hookPath = (hook: GitHookType) =>
  path.join(gitRoot, ".git", "hooks", hook);

describe("HookInstaller (unit)", () => {
  beforeEach(() => {
    fileStore.clear();
    mkdirMock.mockClear();
    accessMock.mockClear();
    readFileMock.mockClear();
    writeFileMock.mockClear();
    copyFileMock.mockClear();
    unlinkMock.mockClear();
    renameMock.mockClear();
  });

  it("installs hooks when none exist", async () => {
    const installer = new HookInstaller({ gitRoot });

    const result = await installer.installHooks(["post-merge"]);

    expect(result.installed).toEqual(["post-merge"]);
    expect(writeFileMock).toHaveBeenCalledWith(
      hookPath("post-merge"),
      expect.stringContaining("# KODEBASE_MANAGED_HOOK"),
      { mode: 0o755 },
    );
  });

  it("backs up and overwrites conflicting hooks when forced", async () => {
    fileStore.set(hookPath("post-merge"), { content: "#!/bin/sh\necho hello" });

    const installer = new HookInstaller({ gitRoot, force: true });
    const result = await installer.installHooks(["post-merge"]);

    expect(result.backedUp).toEqual(["post-merge"]);
    expect(
      fileStore.get(`${hookPath("post-merge")}.kodebase-backup`)?.content,
    ).toContain("echo hello");
  });

  it("uninstalls kodebase hooks and restores backups", async () => {
    fileStore.set(hookPath("post-merge"), {
      content: "# KODEBASE_MANAGED_HOOK\nkodebase hooks execute post-merge",
    });
    fileStore.set(`${hookPath("post-merge")}.kodebase-backup`, {
      content: "#!/bin/sh\necho legacy",
    });

    const installer = new HookInstaller({ gitRoot });
    const result = await installer.uninstallHooks(["post-merge"]);

    expect(result.removed).toEqual(["post-merge"]);
    expect(result.restored).toEqual(["post-merge"]);
    expect(fileStore.get(hookPath("post-merge"))?.content).toContain("legacy");
  });

  it("detects existing hooks with backup info", async () => {
    fileStore.set(hookPath("post-merge"), {
      content: "# KODEBASE_MANAGED_HOOK",
    });
    fileStore.set(`${hookPath("post-merge")}.kodebase-backup`, {
      content: "legacy",
    });

    const installer = new HookInstaller({ gitRoot });
    const hooks = await installer.detectExistingHooks(["post-merge"]);

    expect(hooks).toEqual([
      expect.objectContaining({
        type: "post-merge",
        isKodebaseHook: true,
        hasBackup: true,
      }),
    ]);
  });
});
