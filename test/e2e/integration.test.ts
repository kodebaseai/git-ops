/**
 * Integration tests for git-ops package
 * Tests end-to-end workflows with mocked CLI commands
 */

import type { KodebaseConfig } from "@kodebase/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubAdapter } from "../../src/adapters/github.js";
import { GitLabAdapter } from "../../src/adapters/gitlab.js";
import {
  createAdapter,
  getMergeDefaults,
  getPRCreationDefaults,
} from "../../src/factory.js";
import { CGitPlatform, CReviewStatus } from "../../src/types/constants.js";

// Mock execAsync for CLI integration
vi.mock("../../src/utils/exec.js", () => ({
  execAsync: vi.fn(),
}));

import { execAsync } from "../../src/utils/exec.js";

describe("Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITLAB_TOKEN;
  });

  describe("E2E: Create PR via GitHub adapter", () => {
    it("should create a PR with all metadata", async () => {
      const mockExecAsync = vi.mocked(execAsync);

      // Mock git remote
      mockExecAsync.mockResolvedValueOnce({
        stdout: "https://github.com/owner/repo.git",
        stderr: "",
        exitCode: 0,
      });

      // Mock gh pr create - returns URL
      mockExecAsync.mockResolvedValueOnce({
        stdout: "https://github.com/owner/repo/pull/123",
        stderr: "",
        exitCode: 0,
      });

      // Mock gh pr view for getPR
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({
          number: 123,
          url: "https://github.com/owner/repo/pull/123",
          title: "Test PR",
          body: "Test description",
          state: "OPEN",
          isDraft: false,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          author: { login: "testuser" },
          baseRefName: "main",
          headRefName: "feature-branch",
          reviewDecision: null,
          labels: [],
          assignees: [],
          reviewRequests: [],
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
        }),
        stderr: "",
        exitCode: 0,
      });

      const adapter = new GitHubAdapter();
      const result = await adapter.createPR({
        repoPath: "/test/repo",
        title: "Test PR",
        body: "Test description",
        baseBranch: "main",
        branch: "feature-branch",
      });

      expect(result.number).toBe(123);
      expect(result.title).toBe("Test PR");
      expect(result.state).toBe("OPEN");
      expect(result.author).toBe("testuser");

      expect(mockExecAsync).toHaveBeenCalledTimes(3);
      expect(mockExecAsync).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("gh pr create"),
      );
    });

    it("should handle PR creation with labels and reviewers", async () => {
      const mockExecAsync = vi.mocked(execAsync);

      // Mock git remote
      mockExecAsync.mockResolvedValueOnce({
        stdout: "https://github.com/owner/repo.git",
        stderr: "",
        exitCode: 0,
      });

      // Mock gh pr create - returns URL
      mockExecAsync.mockResolvedValueOnce({
        stdout: "https://github.com/owner/repo/pull/124",
        stderr: "",
        exitCode: 0,
      });

      // Mock gh pr view
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({
          number: 124,
          url: "https://github.com/owner/repo/pull/124",
          title: "Feature: Add validation",
          body: "Adds validation logic",
          state: "OPEN",
          isDraft: false,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          author: { login: "testuser" },
          baseRefName: "main",
          headRefName: "feature-validation",
          reviewDecision: null,
          labels: [{ name: "enhancement" }, { name: "ready" }],
          assignees: [],
          reviewRequests: [],
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
        }),
        stderr: "",
        exitCode: 0,
      });

      const adapter = new GitHubAdapter();
      const result = await adapter.createPR({
        repoPath: "/test/repo",
        title: "Feature: Add validation",
        body: "Adds validation logic",
        baseBranch: "main",
        branch: "feature-validation",
        labels: ["enhancement", "ready"],
        reviewers: ["reviewer1", "reviewer2"],
      });

      expect(result.number).toBe(124);
      expect(result.title).toBe("Feature: Add validation");

      // Verify command includes labels and reviewers
      const createCommand = mockExecAsync.mock.calls[1][0];
      expect(createCommand).toContain("--label");
      expect(createCommand).toContain("enhancement");
      expect(createCommand).toContain("--reviewer");
      expect(createCommand).toContain("reviewer1");
    });
  });

  describe("E2E: Create draft PR and convert to ready", () => {
    it("should create draft PR successfully", async () => {
      const mockExecAsync = vi.mocked(execAsync);

      // Mock git remote
      mockExecAsync.mockResolvedValueOnce({
        stdout: "https://github.com/owner/repo.git",
        stderr: "",
        exitCode: 0,
      });

      // Mock gh pr create --draft - returns URL
      mockExecAsync.mockResolvedValueOnce({
        stdout: "https://github.com/owner/repo/pull/125",
        stderr: "",
        exitCode: 0,
      });

      // Mock gh pr view
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({
          number: 125,
          url: "https://github.com/owner/repo/pull/125",
          title: "WIP: New feature",
          body: "Work in progress",
          state: "OPEN",
          isDraft: true,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          author: { login: "testuser" },
          baseRefName: "main",
          headRefName: "wip-feature",
          reviewDecision: null,
          labels: [],
          assignees: [],
          reviewRequests: [],
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
        }),
        stderr: "",
        exitCode: 0,
      });

      const adapter = new GitHubAdapter();
      const result = await adapter.createDraftPR({
        repoPath: "/test/repo",
        title: "WIP: New feature",
        body: "Work in progress",
        baseBranch: "main",
        branch: "wip-feature",
      });

      expect(result.isDraft).toBe(true);
      expect(result.number).toBe(125);

      // Verify --draft flag was used
      const createCommand = mockExecAsync.mock.calls[1][0];
      expect(createCommand).toContain("--draft");
    });

    it("should handle draft to ready workflow", async () => {
      const mockExecAsync = vi.mocked(execAsync);

      // Step 1: Create draft PR
      mockExecAsync.mockResolvedValueOnce({
        stdout: "https://github.com/owner/repo.git",
        stderr: "",
        exitCode: 0,
      });

      mockExecAsync.mockResolvedValueOnce({
        stdout: "https://github.com/owner/repo/pull/126",
        stderr: "",
        exitCode: 0,
      });

      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({
          number: 126,
          url: "https://github.com/owner/repo/pull/126",
          title: "WIP: Feature",
          body: "Work in progress",
          state: "OPEN",
          isDraft: true,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:00:00Z",
          author: { login: "testuser" },
          baseRefName: "main",
          headRefName: "wip-feature",
          reviewDecision: null,
          labels: [],
          assignees: [],
          reviewRequests: [],
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
        }),
        stderr: "",
        exitCode: 0,
      });

      const adapter = new GitHubAdapter();
      const draft = await adapter.createDraftPR({
        repoPath: "/test/repo",
        title: "WIP: Feature",
        body: "Work in progress",
        baseBranch: "main",
        branch: "wip-feature",
      });

      expect(draft.isDraft).toBe(true);

      // Step 2: Get PR info (simulate checking status)
      mockExecAsync.mockResolvedValueOnce({
        stdout: JSON.stringify({
          number: 126,
          url: "https://github.com/owner/repo/pull/126",
          title: "Feature Complete",
          body: "Ready for review",
          state: "OPEN",
          isDraft: false,
          createdAt: "2024-01-01T00:00:00Z",
          updatedAt: "2024-01-01T00:01:00Z",
          author: { login: "testuser" },
          baseRefName: "main",
          headRefName: "wip-feature",
          reviewDecision: "REVIEW_REQUIRED",
          labels: [],
          assignees: [],
          reviewRequests: [],
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
        }),
        stderr: "",
        exitCode: 0,
      });

      const ready = await adapter.getPR(126);

      expect(ready?.isDraft).toBe(false);
      expect(ready?.reviewStatus).toBe(CReviewStatus.REVIEW_REQUIRED);
    });
  });

  describe("E2E: Enable auto-merge with CI checks", () => {
    it("should enable auto-merge successfully", async () => {
      const mockExecAsync = vi.mocked(execAsync);

      // Mock gh pr merge --auto
      mockExecAsync.mockResolvedValueOnce({
        stdout: "Auto-merge enabled for pull request #127",
        stderr: "",
        exitCode: 0,
      });

      const adapter = new GitHubAdapter();
      await adapter.enableAutoMerge(127, {
        mergeMethod: "squash",
      });

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("gh pr merge 127 --auto --squash"),
      );
    });

    it("should handle auto-merge with checks requirement", async () => {
      const mockExecAsync = vi.mocked(execAsync);

      // Mock auto-merge enable
      mockExecAsync.mockResolvedValueOnce({
        stdout: "Auto-merge enabled, waiting for checks",
        stderr: "",
        exitCode: 0,
      });

      const adapter = new GitHubAdapter();
      await adapter.enableAutoMerge(128, {
        mergeMethod: "merge",
      });

      expect(mockExecAsync).toHaveBeenCalledWith(
        expect.stringContaining("gh pr merge 128 --auto --merge"),
      );
    });

    it("should handle auto-merge failure", async () => {
      const mockExecAsync = vi.mocked(execAsync);

      // Mock failed auto-merge
      mockExecAsync.mockResolvedValueOnce({
        stdout: "",
        stderr: "Pull request is not in a state to enable auto-merge",
        exitCode: 1,
      });

      const adapter = new GitHubAdapter();

      await expect(
        adapter.enableAutoMerge(129, {
          mergeMethod: "squash",
        }),
      ).rejects.toThrow("not in a state to enable auto-merge");
    });
  });

  describe("E2E: Authentication validation (token + gh CLI)", () => {
    it("should authenticate with token successfully", async () => {
      process.env.GITHUB_TOKEN = "ghp_validtoken";

      // Mock fetch for token validation
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
    });

    it("should use gh CLI when no token is available", async () => {
      // No token in env
      delete process.env.GITHUB_TOKEN;

      const mockExecAsync = vi.mocked(execAsync);

      // Mock gh auth status success
      mockExecAsync.mockResolvedValueOnce({
        stdout:
          "github.com\n  ✓ Logged in to github.com account testuser (keyring)\n  ✓ Git operations protocol: https\n  ✓ Token: gho_****\n  ✓ Token scopes: 'gist', 'read:org', 'repo', 'workflow'",
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
    });

    it("should handle no authentication available", async () => {
      // No token
      delete process.env.GITHUB_TOKEN;

      // Mock gh CLI not authenticated
      const mockExecAsync = vi.mocked(execAsync);
      mockExecAsync.mockResolvedValueOnce({
        stdout: "",
        stderr:
          "You are not logged into any GitHub hosts. Run gh auth login to authenticate.",
        exitCode: 1,
      });

      const adapter = new GitHubAdapter();
      const result = await adapter.validateAuth();

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain("gh CLI not authenticated");
    });
  });

  describe("Error handling tests", () => {
    it("should handle expired token gracefully", async () => {
      process.env.GITHUB_TOKEN = "ghp_expiredtoken";

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      const adapter = new GitHubAdapter();
      const result = await adapter.validateAuth();

      expect(result.authenticated).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle API failures with fetch errors", async () => {
      process.env.GITHUB_TOKEN = "ghp_token";

      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const adapter = new GitHubAdapter();
      const result = await adapter.validateAuth();

      expect(result.authenticated).toBe(false);
      expect(result.error).toContain("Network error");
    });

    it("should handle PR creation failure", async () => {
      const mockExecAsync = vi.mocked(execAsync);

      // Mock git remote success
      mockExecAsync.mockResolvedValueOnce({
        stdout: "https://github.com/owner/repo.git",
        stderr: "",
        exitCode: 0,
      });

      // Mock gh pr create failure
      mockExecAsync.mockResolvedValueOnce({
        stdout: "",
        stderr:
          "pull request create failed: GraphQL: A pull request already exists",
        exitCode: 1,
      });

      const adapter = new GitHubAdapter();

      await expect(
        adapter.createPR({
          repoPath: "/test/repo",
          title: "Duplicate PR",
          body: "This PR already exists",
          baseBranch: "main",
          branch: "feature",
        }),
      ).rejects.toThrow("pull request already exists");
    });

    it("should handle merge failure when PR has conflicts", async () => {
      const mockExecAsync = vi.mocked(execAsync);

      mockExecAsync.mockResolvedValueOnce({
        stdout: "",
        stderr: "pull request merge failed: Pull request has conflicts",
        exitCode: 1,
      });

      const adapter = new GitHubAdapter();

      await expect(
        adapter.mergePR(999, {
          method: "merge",
        }),
      ).rejects.toThrow("has conflicts");
    });

    it("should handle invalid repo path", async () => {
      const mockExecAsync = vi.mocked(execAsync);

      // Mock git remote failure
      mockExecAsync.mockResolvedValueOnce({
        stdout: "",
        stderr: "fatal: not a git repository",
        exitCode: 128,
      });

      const adapter = new GitHubAdapter();

      await expect(
        adapter.createPR({
          repoPath: "/invalid/path",
          title: "Test",
          body: "Test",
          baseBranch: "main",
          branch: "feature",
        }),
      ).rejects.toThrow("Failed to get remote URL from repository");
    });
  });

  describe("Platform selection logic", () => {
    it("should create GitHub adapter by default", () => {
      const config: KodebaseConfig = {};
      const adapter = createAdapter(config);

      expect(adapter).toBeInstanceOf(GitHubAdapter);
      expect(adapter.platform).toBe(CGitPlatform.GITHUB);
    });

    it("should create GitHub adapter when explicitly configured", () => {
      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITHUB,
          },
        },
      };
      const adapter = createAdapter(config);

      expect(adapter).toBeInstanceOf(GitHubAdapter);
    });

    it("should create GitLab adapter when configured", () => {
      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITLAB,
          },
        },
      };
      const adapter = createAdapter(config);

      expect(adapter).toBeInstanceOf(GitLabAdapter);
      expect(adapter.platform).toBe(CGitPlatform.GITLAB);
    });

    it("should detect platform from config and apply platform-specific settings", () => {
      process.env.CUSTOM_GH_TOKEN = "ghp_custom";

      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITHUB,
            auth_strategy: "token",
            github: {
              token_env_var: "CUSTOM_GH_TOKEN",
            },
          },
        },
      };

      const adapter = createAdapter(config);
      expect(adapter).toBeInstanceOf(GitHubAdapter);
    });

    it("should handle platform selection with PR creation defaults", () => {
      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITHUB,
          },
          pr_creation: {
            auto_assign: true,
            auto_add_labels: true,
            default_reviewers: ["user1", "user2"],
            additional_labels: ["automated"],
          },
        },
      };

      const adapter = createAdapter(config);
      const prDefaults = getPRCreationDefaults(config);

      expect(adapter.platform).toBe(CGitPlatform.GITHUB);
      expect(prDefaults.autoAssign).toBe(true);
      expect(prDefaults.defaultReviewers).toEqual(["user1", "user2"]);
    });

    it("should handle platform selection with merge defaults", () => {
      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITHUB,
          },
          post_merge: {
            cascade_pr: {
              auto_merge: true,
              require_checks: true,
              labels: ["cascade"],
            },
          },
        },
      };

      const adapter = createAdapter(config);
      const mergeDefaults = getMergeDefaults(config);

      expect(adapter.platform).toBe(CGitPlatform.GITHUB);
      expect(mergeDefaults.autoMerge).toBe(true);
      expect(mergeDefaults.requireChecks).toBe(true);
    });
  });
});
