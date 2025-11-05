/**
 * Tests for GitPlatformAdapter interface and types
 */

import { describe, expect, it } from "vitest";
import type {
  AuthStatus,
  Branch,
  GitPlatformAdapter,
  PRCreateOptions,
  PRInfo,
} from "./adapter.js";
import { CGitPlatform, CMergeMethod, CReviewStatus } from "./constants.js";

describe("GitPlatformAdapter types", () => {
  it("should allow creating a mock adapter implementation", () => {
    const mockAdapter: GitPlatformAdapter = {
      platform: CGitPlatform.GITHUB,

      async createPR(options: PRCreateOptions): Promise<PRInfo> {
        return {
          number: 1,
          state: "open",
          title: options.title,
          body: options.body,
          url: "https://github.com/owner/repo/pull/1",
          sourceBranch: options.branch,
          targetBranch: options.baseBranch,
          isDraft: false,
        };
      },

      async createDraftPR(options: PRCreateOptions): Promise<PRInfo> {
        return {
          number: 2,
          state: "open",
          title: options.title,
          body: options.body,
          url: "https://github.com/owner/repo/pull/2",
          sourceBranch: options.branch,
          targetBranch: options.baseBranch,
          isDraft: true,
        };
      },

      async getPR(prIdentifier: string | number): Promise<PRInfo | null> {
        if (prIdentifier === 1 || prIdentifier === "1") {
          return {
            number: 1,
            state: "open",
            title: "Test PR",
            url: "https://github.com/owner/repo/pull/1",
          };
        }
        return null;
      },

      async mergePR(): Promise<void> {
        // Mock implementation
      },

      async enableAutoMerge(): Promise<void> {
        // Mock implementation
      },

      async validateAuth(): Promise<AuthStatus> {
        return {
          authenticated: true,
          user: "testuser",
          platform: CGitPlatform.GITHUB,
          authType: "token",
          scopes: ["repo", "user"],
        };
      },

      async getBranch(
        branchName: string,
        _repoPath: string,
      ): Promise<Branch | null> {
        return {
          name: branchName,
          sha: "abc123",
          protected: false,
          isDefault: branchName === "main",
        };
      },

      async getCurrentBranch(_repoPath: string): Promise<string> {
        return "main";
      },

      async getRemoteUrl(
        _repoPath: string,
        remoteName = "origin",
      ): Promise<string> {
        return `https://github.com/owner/repo.git (${remoteName})`;
      },

      async isAvailable(): Promise<boolean> {
        return true;
      },
    };

    expect(mockAdapter.platform).toBe(CGitPlatform.GITHUB);
  });

  it("should validate PR creation options type", () => {
    const options: PRCreateOptions = {
      title: "Test PR",
      body: "This is a test",
      branch: "feature/test",
      baseBranch: "main",
      repoPath: "/path/to/repo",
      labels: ["test", "feature"],
      reviewers: ["user1"],
    };

    expect(options.title).toBe("Test PR");
    expect(options.labels).toHaveLength(2);
  });

  it("should validate PRInfo type", () => {
    const prInfo: PRInfo = {
      number: 123,
      state: "open",
      title: "Feature: New component",
      body: "Adds a new component",
      url: "https://github.com/owner/repo/pull/123",
      sourceBranch: "feature/new-component",
      targetBranch: "main",
      author: "testuser",
      isDraft: false,
      mergeable: true,
      hasConflicts: false,
      reviewStatus: CReviewStatus.APPROVED,
      approvals: 2,
    };

    expect(prInfo.number).toBe(123);
    expect(prInfo.state).toBe("open");
    expect(prInfo.reviewStatus).toBe("approved");
  });

  it("should validate Branch type", () => {
    const branch: Branch = {
      name: "feature/test",
      sha: "abc123def456",
      ref: "refs/heads/feature/test",
      protected: false,
      isDefault: false,
      remote: "origin/feature/test",
      ahead: 5,
      behind: 2,
    };

    expect(branch.name).toBe("feature/test");
    expect(branch.ahead).toBe(5);
    expect(branch.behind).toBe(2);
  });

  it("should validate AuthStatus type", () => {
    const authStatus: AuthStatus = {
      authenticated: true,
      user: "testuser",
      platform: CGitPlatform.GITLAB,
      authType: "token",
      scopes: ["api", "read_user", "write_repository"],
    };

    expect(authStatus.authenticated).toBe(true);
    expect(authStatus.platform).toBe("gitlab");
    expect(authStatus.scopes).toContain("api");
  });

  it("should validate failed authentication", () => {
    const authStatus: AuthStatus = {
      authenticated: false,
      platform: CGitPlatform.GITHUB,
      error: "Invalid token",
    };

    expect(authStatus.authenticated).toBe(false);
    expect(authStatus.error).toBe("Invalid token");
  });

  it("should support all merge methods", () => {
    expect(CMergeMethod.MERGE).toBe("merge");
    expect(CMergeMethod.SQUASH).toBe("squash");
    expect(CMergeMethod.REBASE).toBe("rebase");
  });

  it("should support all platforms", () => {
    expect(CGitPlatform.GITHUB).toBe("github");
    expect(CGitPlatform.GITLAB).toBe("gitlab");
    expect(CGitPlatform.BITBUCKET).toBe("bitbucket");
  });
});
