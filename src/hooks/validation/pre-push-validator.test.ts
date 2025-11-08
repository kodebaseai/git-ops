/**
 * Tests for pre-push validator.
 */

import type { TAnyArtifact } from "@kodebase/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as exec from "../../utils/exec.js";
import { validatePrePush } from "./pre-push-validator.js";

// Mock dependencies
vi.mock("../../utils/exec.js");

const createQueryServiceMock = (artifacts: Record<string, TAnyArtifact>) => ({
  findArtifacts: vi
    .fn()
    .mockResolvedValue(
      Object.entries(artifacts).map(([id, artifact]) => ({ id, artifact })),
    ),
});

const createDraftArtifact = (): TAnyArtifact =>
  ({
    metadata: {
      title: "Draft Artifact",
      priority: "high",
      schema_version: "0.0.1",
      relationships: {
        blocks: [],
        blocked_by: [],
      },
      events: [
        {
          event: "draft",
          timestamp: "2025-11-06T12:00:00Z",
          actor: "test",
          trigger: "artifact_created",
        },
      ],
    },
    content: {
      summary: "Test artifact in draft",
    },
  }) as TAnyArtifact;

const createBlockedArtifact = (): TAnyArtifact =>
  ({
    metadata: {
      title: "Blocked Artifact",
      priority: "high",
      schema_version: "0.0.1",
      relationships: {
        blocks: [],
        blocked_by: ["A.1.1"],
      },
      events: [
        {
          event: "draft",
          timestamp: "2025-11-06T12:00:00Z",
          actor: "test",
          trigger: "artifact_created",
        },
        {
          event: "blocked",
          timestamp: "2025-11-06T12:05:00Z",
          actor: "test",
          trigger: "has_dependencies",
        },
      ],
    },
    content: {
      summary: "Test artifact that is blocked",
    },
  }) as TAnyArtifact;

const createInProgressArtifact = (): TAnyArtifact =>
  ({
    metadata: {
      title: "Valid Artifact",
      priority: "high",
      schema_version: "0.0.1",
      relationships: {
        blocks: [],
        blocked_by: [],
      },
      events: [
        {
          event: "draft",
          timestamp: "2025-11-06T12:00:00Z",
          actor: "test",
          trigger: "artifact_created",
        },
        {
          event: "in_progress",
          timestamp: "2025-11-06T12:05:00Z",
          actor: "test",
          trigger: "branch_created",
        },
      ],
    },
    content: {
      summary: "Test artifact in progress",
    },
  }) as TAnyArtifact;

describe("pre-push-validator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("validatePrePush", () => {
    test("should return no warnings for clean branch", async () => {
      // Branch contains no artifact IDs
      // Mock: no uncommitted changes
      vi.mocked(exec.execAsync).mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      const result = await validatePrePush("feature/clean-branch");

      expect(result.hasWarnings).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    test("should detect uncommitted changes", async () => {
      // Branch contains no artifact IDs
      // Mock: uncommitted changes in artifacts directory
      vi.mocked(exec.execAsync).mockResolvedValue({
        stdout:
          " M .kodebase/artifacts/A/A.1/A.1.1.yml\n ?? .kodebase/artifacts/B/B.1/B.1.1.yml\n",
        stderr: "",
        exitCode: 0,
      });

      const result = await validatePrePush("feature/some-work");

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].type).toBe("UNCOMMITTED_CHANGES");
      expect(result.warnings[0].message).toContain(
        "2 uncommitted artifact file(s)",
      );
    });

    test("should warn about draft artifacts", async () => {
      // Branch embeds artifact ID
      // Mock: no uncommitted changes
      vi.mocked(exec.execAsync).mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      const queryService = createQueryServiceMock({
        "A.1.1": createDraftArtifact(),
      });

      const result = await validatePrePush("A.1.1", { queryService });

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === "DRAFT_ARTIFACT")).toBe(
        true,
      );
      expect(
        result.warnings.find((w) => w.type === "DRAFT_ARTIFACT")?.artifactId,
      ).toBe("A.1.1");
    });

    test("should warn about blocked artifacts", async () => {
      // Branch embeds artifact ID
      // Mock: no uncommitted changes
      vi.mocked(exec.execAsync).mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      const queryService = createQueryServiceMock({
        "A.1.2": createBlockedArtifact(),
      });

      const result = await validatePrePush("A.1.2", { queryService });

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.some((w) => w.type === "BLOCKED_ARTIFACT")).toBe(
        true,
      );
    });

    test("should handle artifacts with no warnings", async () => {
      // Branch embeds artifact ID
      // Mock: no uncommitted changes
      vi.mocked(exec.execAsync).mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      const queryService = createQueryServiceMock({
        "A.1.3": createInProgressArtifact(),
      });

      const result = await validatePrePush("A.1.3", { queryService });

      expect(result.hasWarnings).toBe(false);
      expect(result.warnings).toHaveLength(0);
    });

    test("should handle multiple warnings", async () => {
      // Branch embeds artifact ID
      // Mock: uncommitted changes
      vi.mocked(exec.execAsync).mockResolvedValue({
        stdout: " M .kodebase/artifacts/A/A.1/A.1.1.yml\n",
        stderr: "",
        exitCode: 0,
      });

      const queryService = createQueryServiceMock({
        "A.1.1": createDraftArtifact(),
      });

      const result = await validatePrePush("A.1.1", { queryService });

      expect(result.hasWarnings).toBe(true);
      expect(result.warnings.length).toBeGreaterThanOrEqual(2); // Uncommitted + Draft
    });

    test("should support disabling checks", async () => {
      // Branch embeds artifact ID
      vi.mocked(exec.execAsync).mockResolvedValue({
        stdout: " M .kodebase/artifacts/A/A.1/A.1.1.yml\n",
        stderr: "",
        exitCode: 0,
      });

      const queryService = createQueryServiceMock({
        "A.1.1": createDraftArtifact(),
      });

      const result = await validatePrePush("A.1.1", {
        checkUncommitted: false,
        queryService,
      });

      // Should not have uncommitted changes warning
      expect(
        result.warnings.some((w) => w.type === "UNCOMMITTED_CHANGES"),
      ).toBe(false);
    });

    test("should handle artifact loading errors gracefully", async () => {
      // Branch embeds artifact ID
      vi.mocked(exec.execAsync).mockResolvedValue({
        stdout: "",
        stderr: "",
        exitCode: 0,
      });

      const queryService = {
        findArtifacts: vi.fn().mockRejectedValue(new Error("File not found")),
      };

      const result = await validatePrePush("A.1.1", { queryService });

      // Should not crash, just no state warnings
      expect(result.hasWarnings).toBe(false);
    });

    test("should handle git command errors gracefully", async () => {
      // Branch contains no artifact IDs
      // Mock: git command fails
      vi.mocked(exec.execAsync).mockResolvedValue({
        stdout: "",
        stderr: "fatal: not a git repository",
        exitCode: 128,
      });

      const result = await validatePrePush("feature/test");

      // Should not crash, just no uncommitted warnings
      expect(
        result.warnings.some((w) => w.type === "UNCOMMITTED_CHANGES"),
      ).toBe(false);
    });

    test("should limit files shown in uncommitted changes warning", async () => {
      // Branch contains no artifact IDs
      // Mock: many uncommitted files
      const manyFiles = Array.from(
        { length: 10 },
        (_, i) => ` M .kodebase/artifacts/A/A.${i}/A.${i}.1.yml`,
      ).join("\n");

      vi.mocked(exec.execAsync).mockResolvedValue({
        stdout: manyFiles,
        stderr: "",
        exitCode: 0,
      });

      const result = await validatePrePush("feature/test");

      expect(result.hasWarnings).toBe(true);
      const warning = result.warnings.find(
        (w) => w.type === "UNCOMMITTED_CHANGES",
      );
      expect(warning?.message).toContain("10 uncommitted artifact file(s)");
      expect(warning?.details).toContain("... and 5 more"); // Shows first 5
    });
  });
});
