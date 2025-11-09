import { describe, expect, it, vi } from "vitest";
import { PostMergeDetector } from "./post-merge-detector.js";

type ExecResponse =
  | {
      command?: string | RegExp;
      stdout?: string;
      stderr?: string;
    }
  | {
      command?: string | RegExp;
      error: Error;
    };

const createExecStub = (responses: ExecResponse[]) =>
  vi.fn(async (command: string) => {
    const next = responses.shift();
    if (!next) {
      throw new Error(`Unexpected command: ${command}`);
    }

    if (next.command) {
      if (typeof next.command === "string") {
        expect(command).toContain(next.command);
      } else {
        expect(command).toMatch(next.command);
      }
    }

    if ("error" in next) {
      throw next.error;
    }

    return {
      stdout: next.stdout ?? "",
      stderr: next.stderr ?? "",
    };
  });

type DetectorInternals = PostMergeDetector & {
  getSourceBranch(): Promise<string | null>;
  getPRNumber(): Promise<number | null>;
};

describe("PostMergeDetector (unit)", () => {
  it("reads source branch from reflog before falling back to commit message", async () => {
    const execStub = createExecStub([
      {
        command: "git reflog",
        stdout: "merge origin/feature/A.1.5 into main",
      },
    ]);

    const detector = new PostMergeDetector(
      { gitRoot: "/repo" },
      execStub as never,
    ) as DetectorInternals;

    const branch = await detector.getSourceBranch();

    expect(branch).toBe("feature/A.1.5");
    expect(execStub).toHaveBeenCalledTimes(1);
  });

  it("falls back to commit message when reflog lacks merge hints", async () => {
    const execStub = createExecStub([
      {
        command: "git reflog",
        stdout: "checkout: moving from feature/A.1.5 to main",
      },
      {
        command: "%B HEAD",
        stdout: "Merge branch 'feature/B.2.3' into main",
      },
    ]);

    const detector = new PostMergeDetector(
      { gitRoot: "/repo" },
      execStub as never,
    ) as DetectorInternals;

    const branch = await detector.getSourceBranch();

    expect(branch).toBe("feature/B.2.3");
    expect(execStub).toHaveBeenCalledTimes(2);
  });

  it("returns null source branch when git commands fail", async () => {
    const execStub = createExecStub([
      {
        command: "git reflog",
        error: new Error("git unavailable"),
      },
    ]);

    const detector = new PostMergeDetector(
      { gitRoot: "/repo" },
      execStub as never,
    ) as DetectorInternals;

    await expect(detector.getSourceBranch()).resolves.toBeNull();
  });

  it("parses PR numbers from git log subject", async () => {
    const execStub = createExecStub([
      {
        command: "%s HEAD",
        stdout: "Merge pull request #77 from feature/A.1.5",
      },
    ]);

    const detector = new PostMergeDetector(
      { gitRoot: "/repo" },
      execStub as never,
    ) as DetectorInternals;

    await expect(detector.getPRNumber()).resolves.toBe(77);
  });

  it("returns null PR number when git log lacks references or errors", async () => {
    const execStub = createExecStub([
      {
        command: "%s HEAD",
        stdout: "chore: bump deps",
      },
      {
        command: "%s HEAD",
        error: new Error("git log missing"),
      },
    ]);

    const detector = new PostMergeDetector(
      { gitRoot: "/repo" },
      execStub as never,
    ) as DetectorInternals;

    await expect(detector.getPRNumber()).resolves.toBeNull();
    await expect(detector.getPRNumber()).resolves.toBeNull();
  });
});
