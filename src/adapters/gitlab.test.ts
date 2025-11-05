/**
 * Tests for GitLab adapter stub
 */

import { describe, expect, it } from "vitest";
import { CGitPlatform } from "../types/constants.js";
import { GitLabAdapter, GitLabNotImplementedError } from "./gitlab.js";

describe("GitLabAdapter", () => {
  describe("constructor", () => {
    it("should initialize with gitlab platform", () => {
      const adapter = new GitLabAdapter();
      expect(adapter.platform).toBe(CGitPlatform.GITLAB);
    });

    it("should accept optional config", () => {
      const adapter = new GitLabAdapter({
        token: "glpat-test-token",
        baseUrl: "https://gitlab.example.com",
      });
      expect(adapter.platform).toBe(CGitPlatform.GITLAB);
    });
  });

  describe("validateAuth", () => {
    it("should return unauthenticated status with helpful error", async () => {
      const adapter = new GitLabAdapter();
      const result = await adapter.validateAuth();

      expect(result).toEqual({
        authenticated: false,
        platform: CGitPlatform.GITLAB,
        error: expect.stringContaining("GitLab support is not yet implemented"),
      });
      expect(result.error).toContain("v1.1");
      expect(result.error).toContain("github.com/kodebase-org/kodebase/issues");
    });
  });

  describe("stub methods throw NotImplementedError", () => {
    const adapter = new GitLabAdapter();

    it("createPR should throw GitLabNotImplementedError", async () => {
      await expect(
        adapter.createPR({
          title: "Test",
          repoPath: "/test",
        }),
      ).rejects.toThrow(GitLabNotImplementedError);

      await expect(
        adapter.createPR({
          title: "Test",
          repoPath: "/test",
        }),
      ).rejects.toThrow("createPR");
      await expect(
        adapter.createPR({
          title: "Test",
          repoPath: "/test",
        }),
      ).rejects.toThrow("v1.1");
    });

    it("createDraftPR should throw GitLabNotImplementedError", async () => {
      await expect(
        adapter.createDraftPR({
          title: "Test",
          repoPath: "/test",
        }),
      ).rejects.toThrow(GitLabNotImplementedError);

      await expect(
        adapter.createDraftPR({
          title: "Test",
          repoPath: "/test",
        }),
      ).rejects.toThrow("createDraftPR");
    });

    it("getPR should throw GitLabNotImplementedError", async () => {
      await expect(adapter.getPR(123)).rejects.toThrow(
        GitLabNotImplementedError,
      );

      await expect(adapter.getPR(123)).rejects.toThrow("getPR");
    });

    it("mergePR should throw GitLabNotImplementedError", async () => {
      await expect(adapter.mergePR(123)).rejects.toThrow(
        GitLabNotImplementedError,
      );

      await expect(adapter.mergePR(123)).rejects.toThrow("mergePR");
    });

    it("enableAutoMerge should throw GitLabNotImplementedError", async () => {
      await expect(adapter.enableAutoMerge(123)).rejects.toThrow(
        GitLabNotImplementedError,
      );

      await expect(adapter.enableAutoMerge(123)).rejects.toThrow(
        "enableAutoMerge",
      );
    });

    it("getBranch should throw GitLabNotImplementedError", async () => {
      await expect(adapter.getBranch("main", "/test")).rejects.toThrow(
        GitLabNotImplementedError,
      );

      await expect(adapter.getBranch("main", "/test")).rejects.toThrow(
        "getBranch",
      );
    });

    it("getCurrentBranch should throw GitLabNotImplementedError", async () => {
      await expect(adapter.getCurrentBranch("/test")).rejects.toThrow(
        GitLabNotImplementedError,
      );

      await expect(adapter.getCurrentBranch("/test")).rejects.toThrow(
        "getCurrentBranch",
      );
    });

    it("getRemoteUrl should throw GitLabNotImplementedError", async () => {
      await expect(adapter.getRemoteUrl("/test")).rejects.toThrow(
        GitLabNotImplementedError,
      );

      await expect(adapter.getRemoteUrl("/test")).rejects.toThrow(
        "getRemoteUrl",
      );
    });

    it("isAvailable should throw GitLabNotImplementedError", async () => {
      await expect(adapter.isAvailable()).rejects.toThrow(
        GitLabNotImplementedError,
      );

      await expect(adapter.isAvailable()).rejects.toThrow("isAvailable");
    });
  });

  describe("GitLabNotImplementedError", () => {
    it("should include method name in error message", () => {
      const error = new GitLabNotImplementedError("testMethod");

      expect(error.message).toContain("testMethod");
      expect(error.message).toContain("not yet implemented");
      expect(error.message).toContain("v1.1");
      expect(error.message).toContain(
        "https://github.com/kodebase-org/kodebase/issues",
      );
    });

    it("should have correct error name", () => {
      const error = new GitLabNotImplementedError("testMethod");
      expect(error.name).toBe("GitLabNotImplementedError");
    });

    it("should be instance of Error", () => {
      const error = new GitLabNotImplementedError("testMethod");
      expect(error).toBeInstanceOf(Error);
    });
  });
});
