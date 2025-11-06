/**
 * @vitest-environment node
 */

import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { GitPlatformAdapter, PRInfo } from "../types/adapter.js";
import { DraftPRService } from "./draft-pr-service.js";

// Mock the artifact-loader module
vi.mock("./artifact-loader.js", () => ({
  loadArtifactMetadata: vi.fn(),
}));

describe("DraftPRService", () => {
  let mockAdapter: GitPlatformAdapter;
  let service: DraftPRService;

  beforeEach(() => {
    // Create mock adapter
    mockAdapter = {
      platform: "github" as const,
      createPR: vi.fn(),
      createDraftPR: vi.fn(),
      getPR: vi.fn(),
      mergePR: vi.fn(),
      enableAutoMerge: vi.fn(),
      validateAuth: vi.fn(),
      isAvailable: vi.fn(),
      getBranch: vi.fn(),
      getCurrentBranch: vi.fn(),
      getRemoteUrl: vi.fn(),
    };

    // Reset service for each test
    service = new DraftPRService(mockAdapter, {
      enabled: true,
      gitRoot: "/test/repo",
      artifactsDir: ".kodebase/artifacts",
    });
  });

  describe("createDraftPR", () => {
    it("should return disabled message when draft PR creation is disabled", async () => {
      const disabledService = new DraftPRService(mockAdapter, {
        enabled: false,
      });

      const result = await disabledService.createDraftPR("C.6.3", "C.6.3-test");

      expect(result.created).toBe(false);
      expect(result.reason).toBe("Draft PR creation is disabled");
      expect(mockAdapter.createDraftPR).not.toHaveBeenCalled();
    });

    it("should create draft PR successfully with artifact metadata", async () => {
      const mockPR: PRInfo = {
        number: 123,
        url: "https://github.com/org/repo/pull/123",
        title: "[C.6.3] Draft PR Creation",
        state: "open",
        draft: true,
      };

      (mockAdapter.createDraftPR as Mock).mockResolvedValue(mockPR);

      // Mock artifact loader
      const { loadArtifactMetadata } = await import("./artifact-loader.js");
      (loadArtifactMetadata as Mock).mockResolvedValue({
        metadata: {
          title: "Draft PR Creation",
        },
        content: {
          summary: "Create draft PRs automatically",
          acceptance_criteria: [
            "Reads draft_pr.enabled from config",
            "Creates draft PR using GitPlatformAdapter",
          ],
        },
      });

      const result = await service.createDraftPR(
        "C.6.3",
        "C.6.3-draft-pr",
        "main",
      );

      expect(result.created).toBe(true);
      expect(result.prNumber).toBe(123);
      expect(result.prUrl).toBe("https://github.com/org/repo/pull/123");
      expect(result.reason).toBe("Draft PR created successfully");

      expect(mockAdapter.createDraftPR).toHaveBeenCalledWith({
        branch: "C.6.3-draft-pr",
        title: "[C.6.3] Draft PR Creation",
        body: expect.stringContaining("## Summary"),
        draft: true,
        repoPath: "/test/repo",
        baseBranch: "main",
      });
    });

    it("should handle PR creation errors gracefully", async () => {
      (mockAdapter.createDraftPR as Mock).mockRejectedValue(
        new Error("PR creation failed"),
      );

      // Mock artifact loader to succeed
      const { loadArtifactMetadata } = await import("./artifact-loader.js");
      (loadArtifactMetadata as Mock).mockResolvedValue({
        metadata: {
          title: "Draft PR Creation",
        },
        content: {
          summary: "Test summary",
          acceptance_criteria: ["Test criteria"],
        },
      });

      const result = await service.createDraftPR("C.6.3", "C.6.3-draft-pr");

      expect(result.created).toBe(false);
      expect(result.reason).toContain("Failed to create draft PR");
      expect(result.error).toBeInstanceOf(Error);
    });

    it("should use fallback content when artifact loading fails", async () => {
      const mockPR: PRInfo = {
        number: 456,
        url: "https://github.com/org/repo/pull/456",
        title: "[C.6.3] Work in progress",
        state: "open",
        draft: true,
      };

      (mockAdapter.createDraftPR as Mock).mockResolvedValue(mockPR);

      // Mock artifact loader to fail
      const { loadArtifactMetadata } = await import("./artifact-loader.js");
      (loadArtifactMetadata as Mock).mockRejectedValue(
        new Error("Artifact not found"),
      );

      const result = await service.createDraftPR("C.99.99", "C.99.99-test");

      expect(result.created).toBe(true);
      expect(result.prNumber).toBe(456);

      // Should have used fallback title and body
      expect(mockAdapter.createDraftPR).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "[C.99.99] Work in progress",
          body: expect.stringContaining("Automated draft PR for artifact"),
        }),
      );
    });

    it("should handle initiative artifacts (vision + success_criteria)", async () => {
      const mockPR: PRInfo = {
        number: 789,
        url: "https://github.com/org/repo/pull/789",
        title: "[C] Git Operations Package",
        state: "open",
        draft: true,
      };

      (mockAdapter.createDraftPR as Mock).mockResolvedValue(mockPR);

      // Mock initiative artifact
      const { loadArtifactMetadata } = await import("./artifact-loader.js");
      (loadArtifactMetadata as Mock).mockResolvedValue({
        metadata: {
          title: "Git Operations Package",
        },
        content: {
          vision: "Automate git operations for artifact management",
          scope: {
            in: ["Hook execution", "PR creation"],
            out: ["Manual git operations"],
          },
          success_criteria: [
            "Hooks installed successfully",
            "PRs created automatically",
          ],
        },
      });

      const result = await service.createDraftPR("C", "C-git-ops", "main");

      expect(result.created).toBe(true);
      expect(mockAdapter.createDraftPR).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "[C] Git Operations Package",
          body: expect.stringContaining("## Summary"),
        }),
      );

      // Verify vision is used as summary
      const callArgs = (mockAdapter.createDraftPR as Mock).mock.calls[0][0];
      expect(callArgs.body).toContain(
        "Automate git operations for artifact management",
      );
    });

    it("should handle milestone artifacts (summary + validation)", async () => {
      const mockPR: PRInfo = {
        number: 101,
        url: "https://github.com/org/repo/pull/101",
        title: "[C.6] Post-Checkout Hook",
        state: "open",
        draft: true,
      };

      (mockAdapter.createDraftPR as Mock).mockResolvedValue(mockPR);

      // Mock milestone artifact
      const { loadArtifactMetadata } = await import("./artifact-loader.js");
      (loadArtifactMetadata as Mock).mockResolvedValue({
        metadata: {
          title: "Post-Checkout Hook",
        },
        content: {
          summary: "Implement post-checkout hook functionality",
          deliverables: ["Hook detector", "Draft PR service"],
          validation: ["All hooks tests pass", "Coverage >= 90%"],
        },
      });

      const result = await service.createDraftPR(
        "C.6",
        "C.6-post-checkout",
        "main",
      );

      expect(result.created).toBe(true);
      expect(mockAdapter.createDraftPR).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "[C.6] Post-Checkout Hook",
          body: expect.stringContaining("## Acceptance Criteria"),
        }),
      );

      // Verify validation criteria are used
      const callArgs = (mockAdapter.createDraftPR as Mock).mock.calls[0][0];
      expect(callArgs.body).toContain("All hooks tests pass");
    });

    it("should use default base branch (main) when not specified", async () => {
      const mockPR: PRInfo = {
        number: 111,
        url: "https://github.com/org/repo/pull/111",
        title: "[C.6.3] Test",
        state: "open",
        draft: true,
      };

      (mockAdapter.createDraftPR as Mock).mockResolvedValue(mockPR);

      // Mock artifact loader
      const { loadArtifactMetadata } = await import("./artifact-loader.js");
      (loadArtifactMetadata as Mock).mockResolvedValue({
        metadata: { title: "Test" },
        content: { summary: "Test summary", acceptance_criteria: [] },
      });

      await service.createDraftPR("C.6.3", "C.6.3-test");

      expect(mockAdapter.createDraftPR).toHaveBeenCalledWith(
        expect.objectContaining({
          baseBranch: "main",
        }),
      );
    });

    it("should format PR body with proper markdown structure", async () => {
      const mockPR: PRInfo = {
        number: 222,
        url: "https://github.com/org/repo/pull/222",
        title: "[C.6.3] Test",
        state: "open",
        draft: true,
      };

      (mockAdapter.createDraftPR as Mock).mockResolvedValue(mockPR);

      // Mock artifact loader
      const { loadArtifactMetadata } = await import("./artifact-loader.js");
      (loadArtifactMetadata as Mock).mockResolvedValue({
        metadata: { title: "Test Artifact" },
        content: {
          summary: "This is a test summary",
          acceptance_criteria: ["Criterion 1", "Criterion 2", "Criterion 3"],
        },
      });

      await service.createDraftPR("C.6.3", "C.6.3-test");

      const callArgs = (mockAdapter.createDraftPR as Mock).mock.calls[0][0];
      const body = callArgs.body;

      // Check structure
      expect(body).toContain("## Summary\n");
      expect(body).toContain("This is a test summary");
      expect(body).toContain("## Acceptance Criteria\n");
      expect(body).toContain("- [ ] Criterion 1");
      expect(body).toContain("- [ ] Criterion 2");
      expect(body).toContain("- [ ] Criterion 3");
      expect(body).toContain("---");
      expect(body).toContain("*This draft PR was created automatically.*");
    });
  });
});
