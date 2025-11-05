/**
 * Tests for GitHub adapter
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CGitPlatform } from "../types/constants.js";
import { GitHubAdapter } from "./github.js";

// Mock fetch globally
const originalFetch = global.fetch;

// Mock execAsync
vi.mock("../utils/exec.js", () => ({
  execAsync: vi.fn(),
}));

import { execAsync } from "../utils/exec.js";

describe("GitHubAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env vars
    delete process.env.GITHUB_TOKEN;
    // Restore fetch
    global.fetch = originalFetch;
  });

  describe("constructor", () => {
    it("should initialize with github platform", () => {
      const adapter = new GitHubAdapter();
      expect(adapter.platform).toBe(CGitPlatform.GITHUB);
    });

    it("should accept optional config", () => {
      const adapter = new GitHubAdapter({ token: "test-token" });
      expect(adapter.platform).toBe(CGitPlatform.GITHUB);
    });
  });

  describe("validateAuth", () => {
    describe("with GITHUB_TOKEN env var", () => {
      it("should validate token successfully", async () => {
        process.env.GITHUB_TOKEN = "ghp_validtoken";

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: {
            get: (name: string) => {
              if (name === "x-oauth-scopes") return "repo, workflow";
              return null;
            },
          },
          json: async () => ({ login: "testuser" }),
        });

        const adapter = new GitHubAdapter();
        const result = await adapter.validateAuth();

        expect(result).toEqual({
          authenticated: true,
          platform: CGitPlatform.GITHUB,
          user: "testuser",
          authType: "token",
          scopes: ["repo", "workflow"],
        });

        expect(global.fetch).toHaveBeenCalledWith(
          "https://api.github.com/user",
          {
            headers: {
              Authorization: "Bearer ghp_validtoken",
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
          },
        );
      });

      it("should handle invalid token (401)", async () => {
        process.env.GITHUB_TOKEN = "ghp_invalidtoken";

        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
        });

        const adapter = new GitHubAdapter();
        const result = await adapter.validateAuth();

        expect(result).toEqual({
          authenticated: false,
          platform: CGitPlatform.GITHUB,
          error: "Token is invalid or expired",
        });
      });

      it("should handle expired token (401)", async () => {
        process.env.GITHUB_TOKEN = "ghp_expiredtoken";

        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: "Unauthorized",
        });

        const adapter = new GitHubAdapter();
        const result = await adapter.validateAuth();

        expect(result.authenticated).toBe(false);
        expect(result.error).toContain("invalid or expired");
      });

      it("should handle API errors (non-401)", async () => {
        process.env.GITHUB_TOKEN = "ghp_validtoken";

        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
        });

        const adapter = new GitHubAdapter();
        const result = await adapter.validateAuth();

        expect(result).toEqual({
          authenticated: false,
          platform: CGitPlatform.GITHUB,
          error: "GitHub API error: 500 Internal Server Error",
        });
      });

      it("should handle network errors", async () => {
        process.env.GITHUB_TOKEN = "ghp_validtoken";

        global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

        const adapter = new GitHubAdapter();
        const result = await adapter.validateAuth();

        expect(result.authenticated).toBe(false);
        expect(result.error).toContain("Failed to validate token");
        expect(result.error).toContain("Network error");
      });

      it("should handle empty scopes", async () => {
        process.env.GITHUB_TOKEN = "ghp_validtoken";

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: {
            get: () => null,
          },
          json: async () => ({ login: "testuser" }),
        });

        const adapter = new GitHubAdapter();
        const result = await adapter.validateAuth();

        expect(result.authenticated).toBe(true);
        expect(result.scopes).toEqual([]);
      });

      it("should prefer config token over env var", async () => {
        process.env.GITHUB_TOKEN = "ghp_envtoken";

        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: {
            get: () => null,
          },
          json: async () => ({ login: "testuser" }),
        });

        const adapter = new GitHubAdapter({ token: "ghp_configtoken" });
        await adapter.validateAuth();

        expect(global.fetch).toHaveBeenCalledWith(
          "https://api.github.com/user",
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: "Bearer ghp_configtoken",
            }),
          }),
        );
      });
    });

    describe("with gh CLI fallback", () => {
      it("should validate gh CLI authentication successfully", async () => {
        const mockExecAsync = vi.mocked(execAsync);
        mockExecAsync.mockResolvedValue({
          stdout: "✓ Logged in to github.com account testuser (keyring)",
          stderr: "",
          exitCode: 0,
        });

        const adapter = new GitHubAdapter();
        const result = await adapter.validateAuth();

        expect(result).toEqual({
          authenticated: true,
          platform: CGitPlatform.GITHUB,
          user: "testuser",
          authType: "oauth",
        });

        expect(mockExecAsync).toHaveBeenCalledWith("gh auth status");
      });

      it("should handle gh CLI not authenticated", async () => {
        const mockExecAsync = vi.mocked(execAsync);
        mockExecAsync.mockResolvedValue({
          stdout: "",
          stderr:
            "You are not logged into any GitHub hosts. Run gh auth login to authenticate.",
          exitCode: 1,
        });

        const adapter = new GitHubAdapter();
        const result = await adapter.validateAuth();

        expect(result).toEqual({
          authenticated: false,
          platform: CGitPlatform.GITHUB,
          error:
            "gh CLI not authenticated. Run 'gh auth login' to authenticate.",
        });
      });

      it("should handle gh CLI not installed", async () => {
        const mockExecAsync = vi.mocked(execAsync);
        mockExecAsync.mockRejectedValue(new Error("Command not found: gh"));

        const adapter = new GitHubAdapter();
        const result = await adapter.validateAuth();

        expect(result.authenticated).toBe(false);
        expect(result.error).toContain("gh CLI check failed");
        expect(result.error).toContain("Command not found");
      });

      it("should handle gh CLI parsing without username", async () => {
        const mockExecAsync = vi.mocked(execAsync);
        mockExecAsync.mockResolvedValue({
          stdout: "✓ Logged in to github.com",
          stderr: "",
          exitCode: 0,
        });

        const adapter = new GitHubAdapter();
        const result = await adapter.validateAuth();

        expect(result.authenticated).toBe(true);
        expect(result.user).toBeUndefined();
      });
    });
  });

  describe("unimplemented methods", () => {
    const adapter = new GitHubAdapter();

    it("createPR should throw", async () => {
      await expect(
        adapter.createPR({
          title: "Test",
          repoPath: "/test",
        }),
      ).rejects.toThrow("Not implemented");
    });

    it("createDraftPR should throw", async () => {
      await expect(
        adapter.createDraftPR({
          title: "Test",
          repoPath: "/test",
        }),
      ).rejects.toThrow("Not implemented");
    });

    it("getPR should throw", async () => {
      await expect(adapter.getPR(123)).rejects.toThrow("Not implemented");
    });

    it("mergePR should throw", async () => {
      await expect(adapter.mergePR(123)).rejects.toThrow("Not implemented");
    });

    it("enableAutoMerge should throw", async () => {
      await expect(adapter.enableAutoMerge(123)).rejects.toThrow(
        "Not implemented",
      );
    });

    it("getBranch should throw", async () => {
      await expect(adapter.getBranch("main", "/test")).rejects.toThrow(
        "Not implemented",
      );
    });

    it("getCurrentBranch should throw", async () => {
      await expect(adapter.getCurrentBranch("/test")).rejects.toThrow(
        "Not implemented",
      );
    });

    it("getRemoteUrl should throw", async () => {
      await expect(adapter.getRemoteUrl("/test")).rejects.toThrow(
        "Not implemented",
      );
    });

    it("isAvailable should throw", async () => {
      await expect(adapter.isAvailable()).rejects.toThrow("Not implemented");
    });
  });
});
