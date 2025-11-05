/**
 * Tests for exec utility
 */

import { describe, expect, it } from "vitest";
import { execAsync } from "./exec.js";

describe("execAsync", () => {
  it("should execute command successfully and return stdout", async () => {
    const result = await execAsync("echo hello");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello");
    expect(result.stderr).toBe("");
  });

  it("should return non-zero exit code on command failure", async () => {
    const result = await execAsync("exit 1");

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
  });

  it("should capture stderr", async () => {
    const result = await execAsync("echo error >&2");

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("error");
  });

  it("should trim whitespace from output", async () => {
    const result = await execAsync("echo '  hello  '");

    // Echo output will be "  hello  " but trim() removes leading/trailing whitespace
    expect(result.stdout).toBe("hello");
  });

  it("should handle command not found", async () => {
    const result = await execAsync("nonexistentcommand123");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("not found");
  });

  it("should pass options to exec", async () => {
    const result = await execAsync("echo $TEST_VAR", {
      env: { ...process.env, TEST_VAR: "testvalue" },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("testvalue");
  });
});
