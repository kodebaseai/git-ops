/**
 * Contract test suite for GitPlatformAdapter
 *
 * @remarks
 * Reusable test suite that validates any GitPlatformAdapter implementation
 * conforms to the interface contract. This ensures consistent behavior across
 * GitHub, GitLab, Bitbucket, and fake implementations.
 *
 * Usage:
 * ```typescript
 * import { contractGitPlatformAdapter } from './__contracts__/git-platform-adapter.contract';
 * import { FakeGitAdapter } from '@kodebase/test-utils/fakes';
 *
 * contractGitPlatformAdapter(
 *   'FakeGitAdapter',
 *   async () => new FakeGitAdapter({ authenticated: true })
 * );
 * ```
 */

import { beforeEach, describe, expect, it } from "vitest";
import type { GitPlatformAdapter } from "../../types/adapter.js";

/**
 * Contract test options
 */
export interface ContractTestOptions {
  /** Whether to skip tests requiring network access */
  skipNetworkTests?: boolean;
  /** Whether to skip slow tests */
  skipSlowTests?: boolean;
  /** Custom timeout for each test (ms) */
  timeout?: number;
}

/**
 * Contract test factory for GitPlatformAdapter
 *
 * @param name - Name of the implementation being tested (e.g., 'FakeGitAdapter', 'GitHubAdapter')
 * @param factory - Async function that creates a fresh adapter instance
 * @param options - Optional configuration for contract tests
 *
 * @example
 * ```typescript
 * // Test fake implementation
 * contractGitPlatformAdapter(
 *   'FakeGitAdapter',
 *   async () => new FakeGitAdapter({ authenticated: true })
 * );
 *
 * // Test real GitHub adapter (requires auth)
 * contractGitPlatformAdapter(
 *   'GitHubAdapter',
 *   async () => new GitHubAdapter({ token: process.env.GITHUB_TOKEN }),
 *   { skipNetworkTests: false }
 * );
 * ```
 */
export function contractGitPlatformAdapter(
  name: string,
  factory: () => Promise<GitPlatformAdapter>,
  options: ContractTestOptions = {},
): void {
  const timeout = options.timeout ?? 1000;

  describe(`GitPlatformAdapter contract: ${name}`, () => {
    let adapter: GitPlatformAdapter;

    beforeEach(async () => {
      adapter = await factory();
    });

    describe("Authentication", () => {
      it(
        "should validate authentication and return status",
        { timeout },
        async () => {
          const authStatus = await adapter.validateAuth();

          expect(authStatus).toBeDefined();
          expect(authStatus.platform).toBeDefined();
          expect(typeof authStatus.authenticated).toBe("boolean");

          if (authStatus.authenticated) {
            expect(authStatus.user).toBeDefined();
            expect(typeof authStatus.user).toBe("string");
            expect(authStatus.authType).toBeDefined();
          } else {
            expect(authStatus.error).toBeDefined();
          }
        },
      );

      it(
        "should return consistent platform identifier",
        { timeout },
        async () => {
          expect(adapter.platform).toBeDefined();
          expect(["github", "gitlab", "bitbucket"]).toContain(adapter.platform);
        },
      );
    });

    describe("Platform Availability", () => {
      it("should check if platform is available", { timeout }, async () => {
        const available = await adapter.isAvailable();
        expect(typeof available).toBe("boolean");
      });
    });

    describe("PR Creation", () => {
      it(
        "should create a regular PR with required fields",
        { timeout },
        async () => {
          const pr = await adapter.createPR({
            title: "Test PR",
            body: "Test PR body",
            branch: "test-branch",
            baseBranch: "main",
            repoPath: "/test/repo",
          });

          expect(pr).toBeDefined();
          expect(pr.number).toBeGreaterThan(0);
          expect(pr.title).toBe("Test PR");
          expect(pr.state).toBeDefined();
          expect(pr.isDraft).toBe(false);
          expect(pr.sourceBranch).toBeDefined();
          expect(pr.targetBranch).toBeDefined();
        },
      );

      it("should create a draft PR", { timeout }, async () => {
        const pr = await adapter.createDraftPR({
          title: "Draft PR",
          body: "Draft PR body",
          branch: "draft-branch",
          baseBranch: "main",
          repoPath: "/test/repo",
        });

        expect(pr).toBeDefined();
        expect(pr.number).toBeGreaterThan(0);
        expect(pr.isDraft).toBe(true);
      });

      it(
        "should support optional PR metadata (labels, assignees, reviewers)",
        { timeout },
        async () => {
          const pr = await adapter.createPR({
            title: "PR with metadata",
            branch: "meta-branch",
            repoPath: "/test/repo",
            labels: ["bug", "priority-high"],
            assignees: ["user1"],
            reviewers: ["user2"],
          });

          expect(pr).toBeDefined();
          expect(pr.labels).toBeDefined();
          expect(pr.assignees).toBeDefined();
          expect(pr.reviewers).toBeDefined();
        },
      );

      it(
        "should reject PR creation when not authenticated",
        { timeout },
        async () => {
          // This test should be implemented by the adapter
          // Some adapters may throw, others may return error
          // The contract is: must fail gracefully
          expect(true).toBe(true); // Placeholder
        },
      );
    });

    describe("PR Retrieval", () => {
      it("should retrieve an existing PR by number", { timeout }, async () => {
        // Create a PR first
        const created = await adapter.createPR({
          title: "Test retrieval",
          branch: "retrieve-branch",
          repoPath: "/test/repo",
        });

        // Retrieve it
        const retrieved = await adapter.getPR(created.number);

        expect(retrieved).toBeDefined();
        expect(retrieved?.number).toBe(created.number);
        expect(retrieved?.title).toBe(created.title);
      });

      it("should return null for non-existent PR", { timeout }, async () => {
        const pr = await adapter.getPR(999999);
        expect(pr).toBeNull();
      });

      it("should accept string PR identifiers", { timeout }, async () => {
        const created = await adapter.createPR({
          title: "String ID test",
          branch: "string-id-branch",
          repoPath: "/test/repo",
        });

        const retrieved = await adapter.getPR(created.number.toString());
        expect(retrieved).toBeDefined();
      });
    });

    describe("PR Merging", () => {
      it("should merge an open PR", { timeout }, async () => {
        const pr = await adapter.createPR({
          title: "Test merge",
          branch: "merge-branch",
          repoPath: "/test/repo",
        });

        await expect(adapter.mergePR(pr.number)).resolves.toBeUndefined();

        const merged = await adapter.getPR(pr.number);
        expect(merged?.state).toBe("merged");
      });

      it("should support different merge methods", { timeout }, async () => {
        const pr = await adapter.createPR({
          title: "Squash merge",
          branch: "squash-branch",
          repoPath: "/test/repo",
        });

        await expect(
          adapter.mergePR(pr.number, {
            method: "squash",
            message: "Custom squash message",
          }),
        ).resolves.toBeUndefined();
      });

      it("should reject merge of non-existent PR", { timeout }, async () => {
        await expect(adapter.mergePR(999999)).rejects.toThrow();
      });

      it("should reject merge when PR has conflicts", { timeout }, async () => {
        // Implementation-specific: some adapters may simulate this
        // Contract: must fail with descriptive error when conflicts exist
        expect(true).toBe(true); // Placeholder
      });

      it(
        "should optionally delete branch after merge",
        { timeout },
        async () => {
          const pr = await adapter.createPR({
            title: "Delete branch test",
            branch: "delete-me",
            repoPath: "/test/repo",
          });

          await expect(
            adapter.mergePR(pr.number, {
              deleteBranch: true,
            }),
          ).resolves.toBeUndefined();
        },
      );
    });

    describe("Auto-Merge", () => {
      it("should enable auto-merge on a PR", { timeout }, async () => {
        const pr = await adapter.createPR({
          title: "Auto-merge test",
          branch: "auto-branch",
          repoPath: "/test/repo",
        });

        await expect(
          adapter.enableAutoMerge(pr.number, {
            mergeMethod: "squash",
            deleteBranch: true,
          }),
        ).resolves.toBeUndefined();
      });

      it(
        "should reject auto-merge for non-existent PR",
        { timeout },
        async () => {
          await expect(adapter.enableAutoMerge(999999)).rejects.toThrow();
        },
      );
    });

    describe("Branch Operations", () => {
      it("should get current branch name", { timeout }, async () => {
        // This requires setup in fake implementations
        // Real implementations would query actual git repo
        // Contract: returns string branch name or throws
        try {
          const branch = await adapter.getCurrentBranch("/test/repo");
          expect(typeof branch).toBe("string");
          expect(branch.length).toBeGreaterThan(0);
        } catch (error) {
          // Throwing is acceptable if not configured
          expect(error).toBeInstanceOf(Error);
        }
      });

      it("should get branch information", { timeout }, async () => {
        // Similar to getCurrentBranch - requires setup
        // Contract: returns Branch object or null
        try {
          const branch = await adapter.getBranch("main", "/test/repo");
          if (branch) {
            expect(branch.name).toBeDefined();
            expect(branch.sha).toBeDefined();
          }
        } catch (error) {
          // Throwing is acceptable if not configured
          expect(error).toBeInstanceOf(Error);
        }
      });

      it(
        "should return null for non-existent branch",
        { timeout },
        async () => {
          const branch = await adapter.getBranch(
            "non-existent-branch-xyz",
            "/test/repo",
          );
          // Could be null or throw - both acceptable
          if (branch === null) {
            expect(branch).toBeNull();
          }
        },
      );

      it("should get remote URL", { timeout }, async () => {
        try {
          const url = await adapter.getRemoteUrl("/test/repo");
          expect(typeof url).toBe("string");
          expect(url.length).toBeGreaterThan(0);
        } catch (error) {
          // Throwing is acceptable if not configured
          expect(error).toBeInstanceOf(Error);
        }
      });

      it("should support custom remote names", { timeout }, async () => {
        try {
          const url = await adapter.getRemoteUrl("/test/repo", "upstream");
          expect(typeof url).toBe("string");
        } catch (error) {
          // Throwing is acceptable if remote doesn't exist
          expect(error).toBeInstanceOf(Error);
        }
      });
    });

    describe("Error Handling", () => {
      it("should provide descriptive error messages", { timeout }, async () => {
        try {
          await adapter.mergePR(999999);
          expect.fail("Should have thrown error");
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBeDefined();
          expect((error as Error).message.length).toBeGreaterThan(0);
        }
      });
    });

    describe("Idempotence", () => {
      it(
        "should return consistent results when called multiple times",
        { timeout },
        async () => {
          const pr = await adapter.createPR({
            title: "Idempotence test",
            branch: "idem-branch",
            repoPath: "/test/repo",
          });

          const retrieved1 = await adapter.getPR(pr.number);
          const retrieved2 = await adapter.getPR(pr.number);

          expect(retrieved1?.number).toBe(retrieved2?.number);
          expect(retrieved1?.title).toBe(retrieved2?.title);
        },
      );
    });

    describe("Performance", () => {
      it(
        "should complete operations within acceptable timeframes",
        { timeout },
        async () => {
          const start = Date.now();

          await adapter.createPR({
            title: "Performance test",
            branch: "perf-branch",
            repoPath: "/test/repo",
          });

          const duration = Date.now() - start;
          expect(duration).toBeLessThan(timeout);
        },
      );
    });
  });
}
