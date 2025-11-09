/**
 * Tests for adapter factory functions
 */

import type { KodebaseConfig } from "@kodebase/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GitHubAdapter, type GitHubAdapterConfig } from "./adapters/github.js";
import { GitLabAdapter } from "./adapters/gitlab.js";
import {
  AdapterCreateError,
  createAdapter,
  getMergeDefaults,
  getPRCreationDefaults,
} from "./factory.js";
import { CGitPlatform } from "./types/constants.js";

const getGitHubInternalConfig = (
  adapter: GitHubAdapter,
): GitHubAdapterConfig | undefined =>
  (adapter as unknown as { config?: GitHubAdapterConfig }).config;

describe("AdapterCreateError", () => {
  it("should retain provided cause for debugging", () => {
    const cause = new Error("boom");
    const error = new AdapterCreateError("failed", cause);

    expect(error.cause).toBe(cause);
    expect(error.name).toBe("AdapterCreateError");
  });
});

describe("createAdapter", () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    // Clear GitHub/GitLab tokens
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITLAB_TOKEN;
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
  });

  describe("GitHub adapter creation", () => {
    it("should create GitHub adapter with default config", () => {
      const config: KodebaseConfig = {};
      const adapter = createAdapter(config);

      expect(adapter).toBeInstanceOf(GitHubAdapter);
      expect(adapter.platform).toBe(CGitPlatform.GITHUB);
    });

    it("should default to GitHub even when gitOps block lacks platform config", () => {
      const config: KodebaseConfig = {
        gitOps: {},
      };

      const adapter = createAdapter(config);

      expect(adapter).toBeInstanceOf(GitHubAdapter);
      expect(adapter.platform).toBe(CGitPlatform.GITHUB);
    });

    it("should create GitHub adapter when platform type is github", () => {
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

    it("should use GITHUB_TOKEN env var with auto strategy", () => {
      process.env.GITHUB_TOKEN = "ghp_test_token";

      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITHUB,
            auth_strategy: "auto",
          },
        },
      };

      const adapter = createAdapter(config);
      expect(adapter).toBeInstanceOf(GitHubAdapter);
      expect(getGitHubInternalConfig(adapter as GitHubAdapter)?.token).toBe(
        "ghp_test_token",
      );
    });

    it("should use custom token env var when configured", () => {
      process.env.CUSTOM_GH_TOKEN = "ghp_custom_token";

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
      expect(getGitHubInternalConfig(adapter as GitHubAdapter)?.token).toBe(
        "ghp_custom_token",
      );
    });

    it("should throw when token strategy used but token missing", () => {
      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITHUB,
            auth_strategy: "token",
          },
        },
      };

      expect(() => createAdapter(config)).toThrow(AdapterCreateError);
      expect(() => createAdapter(config)).toThrow("GITHUB_TOKEN");
      expect(() => createAdapter(config)).toThrow(
        'change auth_strategy to "auto" or "cli"',
      );
    });

    it("should throw with custom env var name in error", () => {
      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITHUB,
            auth_strategy: "token",
            github: {
              token_env_var: "MY_CUSTOM_TOKEN",
            },
          },
        },
      };

      expect(() => createAdapter(config)).toThrow("MY_CUSTOM_TOKEN");
    });

    it("should create adapter with cli strategy", () => {
      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITHUB,
            auth_strategy: "cli",
          },
        },
      };

      const adapter = createAdapter(config);
      expect(adapter).toBeInstanceOf(GitHubAdapter);
    });
  });

  describe("GitLab adapter creation", () => {
    it("should create GitLab adapter when platform type is gitlab", () => {
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

    it("should use GITLAB_TOKEN env var with auto strategy", () => {
      process.env.GITLAB_TOKEN = "glpat_test_token";

      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITLAB,
            auth_strategy: "auto",
          },
        },
      };

      const adapter = createAdapter(config);
      expect(adapter).toBeInstanceOf(GitLabAdapter);
    });

    it("should use custom token env var for GitLab", () => {
      process.env.CUSTOM_GL_TOKEN = "glpat_custom_token";

      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITLAB,
            auth_strategy: "token",
            gitlab: {
              token_env_var: "CUSTOM_GL_TOKEN",
            },
          },
        },
      };

      const adapter = createAdapter(config);
      expect(adapter).toBeInstanceOf(GitLabAdapter);
    });

    it("should throw when GitLab token strategy used but token missing", () => {
      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITLAB,
            auth_strategy: "token",
          },
        },
      };

      expect(() => createAdapter(config)).toThrow(AdapterCreateError);
      expect(() => createAdapter(config)).toThrow("GITLAB_TOKEN");
    });

    it("should use custom GitLab API URL", () => {
      process.env.GITLAB_TOKEN = "glpat_test_token";

      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.GITLAB,
            gitlab: {
              api_url: "https://gitlab.example.com",
            },
          },
        },
      };

      const adapter = createAdapter(config);
      expect(adapter).toBeInstanceOf(GitLabAdapter);
    });
  });

  describe("Bitbucket adapter", () => {
    it("should throw for Bitbucket platform (not yet implemented)", () => {
      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            type: CGitPlatform.BITBUCKET,
          },
        },
      };

      expect(() => createAdapter(config)).toThrow(AdapterCreateError);
      expect(() => createAdapter(config)).toThrow("Bitbucket support");
      expect(() => createAdapter(config)).toThrow("v2.0");
    });
  });

  describe("Invalid platform", () => {
    it("should throw for unsupported platform type", () => {
      const config: KodebaseConfig = {
        gitOps: {
          platform: {
            // @ts-expect-error - Testing invalid platform
            type: "invalid-platform",
          },
        },
      };

      expect(() => createAdapter(config)).toThrow(AdapterCreateError);
      expect(() => createAdapter(config)).toThrow("Unsupported platform");
    });
  });
});

describe("getPRCreationDefaults", () => {
  it("should return defaults when config is empty", () => {
    const config: KodebaseConfig = {};
    const defaults = getPRCreationDefaults(config);

    expect(defaults).toEqual({
      titleTemplate: undefined,
      bodyTemplate: undefined,
      autoAssign: false,
      autoAddLabels: false,
      defaultReviewers: [],
      additionalLabels: [],
      createDraft: false,
    });
  });

  it("should extract PR creation settings from config", () => {
    const config: KodebaseConfig = {
      gitOps: {
        pr_creation: {
          title_template: "{artifact_id}: {title}",
          body_template: "## {title}\n\n{body}",
          auto_assign: true,
          auto_add_labels: true,
          default_reviewers: ["user1", "user2"],
          additional_labels: ["enhancement", "documentation"],
        },
      },
    };

    const defaults = getPRCreationDefaults(config);

    expect(defaults).toEqual({
      titleTemplate: "{artifact_id}: {title}",
      bodyTemplate: "## {title}\n\n{body}",
      autoAssign: true,
      autoAddLabels: true,
      defaultReviewers: ["user1", "user2"],
      additionalLabels: ["enhancement", "documentation"],
      createDraft: false,
    });
  });

  it("should use post_checkout create_draft_pr setting", () => {
    const config: KodebaseConfig = {
      gitOps: {
        post_checkout: {
          create_draft_pr: true,
        },
      },
    };

    const defaults = getPRCreationDefaults(config);
    expect(defaults.createDraft).toBe(true);
  });

  it("should prefer pr_creation auto_assign over post_checkout", () => {
    const config: KodebaseConfig = {
      gitOps: {
        pr_creation: {
          auto_assign: true,
        },
        post_checkout: {
          auto_assign: false,
        },
      },
    };

    const defaults = getPRCreationDefaults(config);
    expect(defaults.autoAssign).toBe(true);
  });

  it("should fallback to post_checkout auto_assign", () => {
    const config: KodebaseConfig = {
      gitOps: {
        post_checkout: {
          auto_assign: true,
        },
      },
    };

    const defaults = getPRCreationDefaults(config);
    expect(defaults.autoAssign).toBe(true);
  });
});

describe("getMergeDefaults", () => {
  it("should return defaults when config is empty", () => {
    const config: KodebaseConfig = {};
    const defaults = getMergeDefaults(config);

    expect(defaults).toEqual({
      autoMerge: false,
      deleteBranch: false,
      requireChecks: true,
      labels: [],
    });
  });

  it("should extract merge settings from config", () => {
    const config: KodebaseConfig = {
      gitOps: {
        post_merge: {
          cascade_pr: {
            auto_merge: true,
            require_checks: false,
            labels: ["cascade", "automated"],
            delete_branch: true,
          },
        },
      },
    };

    const defaults = getMergeDefaults(config);

    expect(defaults).toEqual({
      autoMerge: true,
      deleteBranch: true,
      requireChecks: false,
      labels: ["cascade", "automated"],
    });
  });

  it("should use branches.delete_after_merge setting", () => {
    const config: KodebaseConfig = {
      gitOps: {
        branches: {
          delete_after_merge: true,
        },
      },
    };

    const defaults = getMergeDefaults(config);
    expect(defaults.deleteBranch).toBe(true);
  });

  it("should prefer branches.delete_after_merge over cascade_pr.delete_branch", () => {
    const config: KodebaseConfig = {
      gitOps: {
        branches: {
          delete_after_merge: true,
        },
        post_merge: {
          cascade_pr: {
            delete_branch: false,
          },
        },
      },
    };

    const defaults = getMergeDefaults(config);
    expect(defaults.deleteBranch).toBe(true);
  });

  it("should fallback to cascade_pr.delete_branch", () => {
    const config: KodebaseConfig = {
      gitOps: {
        post_merge: {
          cascade_pr: {
            delete_branch: true,
          },
        },
      },
    };

    const defaults = getMergeDefaults(config);
    expect(defaults.deleteBranch).toBe(true);
  });
});
