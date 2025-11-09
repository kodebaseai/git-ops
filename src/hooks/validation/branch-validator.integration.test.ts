/**
 * Tests for branch validation and artifact extraction
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BranchValidator } from "./branch-validator.js";

describe("BranchValidator", () => {
  let tempDir: string;
  let artifactsRoot: string;

  beforeEach(async () => {
    // Create temporary directory structure
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "branch-validator-"),
    );
    artifactsRoot = path.join(tempDir, ".kodebase", "artifacts");
    await fs.promises.mkdir(artifactsRoot, { recursive: true });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a test artifact
   */
  async function createArtifact(id: string): Promise<void> {
    const segments = id.split(".");
    const letter = segments[0];
    const slug = `${letter}.test`;

    if (segments.length === 1) {
      // Initiative: A.yml
      const dir = path.join(artifactsRoot, slug);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(
        path.join(dir, `${letter}.yml`),
        `metadata:\n  title: Test ${id}\n`,
      );
    } else if (segments.length === 2) {
      // Milestone: A.1.yml
      const initiativeDir = path.join(artifactsRoot, slug);
      const milestoneSlug = `${id}.test`;
      const milestoneDir = path.join(initiativeDir, milestoneSlug);
      await fs.promises.mkdir(milestoneDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(milestoneDir, `${id}.yml`),
        `metadata:\n  title: Test ${id}\n`,
      );
    } else {
      // Issue: A.1.2.test.yml
      const initiativeSlug = `${letter}.test`;
      const milestoneId = `${letter}.${segments[1]}`;
      const milestoneSlug = `${milestoneId}.test`;
      const milestoneDir = path.join(
        artifactsRoot,
        initiativeSlug,
        milestoneSlug,
      );
      await fs.promises.mkdir(milestoneDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(milestoneDir, `${id}.test.yml`),
        `metadata:\n  title: Test ${id}\n`,
      );
    }
  }

  describe("extractArtifactId", () => {
    it("should extract artifact ID from simple branch name", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactId("C.1.2")).toBe("C.1.2");
      expect(validator.extractArtifactId("A.1.5")).toBe("A.1.5");
      expect(validator.extractArtifactId("B.2.3")).toBe("B.2.3");
    });

    it("should extract artifact ID with prefix", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactId("feature/C.1.2")).toBe("C.1.2");
      expect(validator.extractArtifactId("feature-C.1.2")).toBe("C.1.2");
      expect(validator.extractArtifactId("bugfix/C.1.2")).toBe("C.1.2");
    });

    it("should extract artifact ID with suffix", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactId("C.1.2-description")).toBe("C.1.2");
      expect(validator.extractArtifactId("C.1.2-fix-bug")).toBe("C.1.2");
      expect(validator.extractArtifactId("C.1.2-feature")).toBe("C.1.2");
    });

    it("should extract artifact ID with prefix and suffix", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactId("feature/C.1.2-description")).toBe(
        "C.1.2",
      );
      expect(validator.extractArtifactId("feature-C.1.2-fix")).toBe("C.1.2");
    });

    it("should extract nested artifact IDs", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactId("C.4.1.2")).toBe("C.4.1.2");
      expect(validator.extractArtifactId("A.1.2.3.4")).toBe("A.1.2.3.4");
    });

    it("should return first artifact ID when multiple present", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactId("C.1.2-C.1.3")).toBe("C.1.2");
    });

    it("should return null for non-artifact branches", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactId("main")).toBeNull();
      expect(validator.extractArtifactId("develop")).toBeNull();
      expect(validator.extractArtifactId("master")).toBeNull();
      expect(validator.extractArtifactId("hotfix/fix-login")).toBeNull();
      expect(validator.extractArtifactId("feature-branch")).toBeNull();
    });
  });

  describe("extractArtifactIds", () => {
    it("should extract single artifact ID", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactIds("C.1.2")).toEqual(["C.1.2"]);
      expect(validator.extractArtifactIds("feature-C.1.2")).toEqual(["C.1.2"]);
    });

    it("should extract multiple artifact IDs", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactIds("C.1.2-C.1.3")).toEqual([
        "C.1.2",
        "C.1.3",
      ]);
      expect(validator.extractArtifactIds("A.1.2-B.2.3-C.3.4")).toEqual([
        "A.1.2",
        "B.2.3",
        "C.3.4",
      ]);
    });

    it("should return unique and sorted artifact IDs", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      // Duplicates removed and sorted
      expect(validator.extractArtifactIds("C.2.1-C.1.5-C.2.1")).toEqual([
        "C.1.5",
        "C.2.1",
      ]);
    });

    it("always returns sorted unique artifact IDs", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      fc.assert(
        fc.property(fc.string(), (branchName) => {
          const ids = validator.extractArtifactIds(branchName);
          const uniqueSorted = Array.from(new Set(ids)).sort();
          expect(ids).toEqual(uniqueSorted);
        }),
        { numRuns: 200 },
      );
    });

    it("should return empty array for non-artifact branches", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactIds("main")).toEqual([]);
      expect(validator.extractArtifactIds("develop")).toEqual([]);
      expect(validator.extractArtifactIds("feature-branch")).toEqual([]);
    });
  });

  describe("validateArtifactExists", () => {
    it("should return true for existing artifact", async () => {
      await createArtifact("C.1.2");

      const validator = new BranchValidator({ baseDir: tempDir });
      const exists = await validator.validateArtifactExists("C.1.2");

      expect(exists).toBe(true);
    });

    it("should return false for non-existent artifact", async () => {
      const validator = new BranchValidator({ baseDir: tempDir });
      const exists = await validator.validateArtifactExists("Z.99.99");

      expect(exists).toBe(false);
    });

    it("should validate initiative artifacts", async () => {
      await createArtifact("C");

      const validator = new BranchValidator({ baseDir: tempDir });
      const exists = await validator.validateArtifactExists("C");

      expect(exists).toBe(true);
    });

    it("should validate milestone artifacts", async () => {
      await createArtifact("C");
      await createArtifact("C.1");

      const validator = new BranchValidator({ baseDir: tempDir });
      const exists = await validator.validateArtifactExists("C.1");

      expect(exists).toBe(true);
    });

    it("should validate issue artifacts", async () => {
      await createArtifact("C");
      await createArtifact("C.1");
      await createArtifact("C.1.2");

      const validator = new BranchValidator({ baseDir: tempDir });
      const exists = await validator.validateArtifactExists("C.1.2");

      expect(exists).toBe(true);
    });
  });

  describe("validateBranch", () => {
    it("should validate branch with existing artifact", async () => {
      await createArtifact("C");
      await createArtifact("C.1");
      await createArtifact("C.1.2");

      const validator = new BranchValidator({ baseDir: tempDir });
      const result = await validator.validateBranch("C.1.2-feature");

      expect(result.validArtifactIds).toEqual(["C.1.2"]);
      expect(result.invalidArtifactIds).toEqual([]);
      expect(result.allValid).toBe(true);
    });

    it("should validate branch with non-existent artifact", async () => {
      const validator = new BranchValidator({ baseDir: tempDir });
      const result = await validator.validateBranch("Z.99.99-feature");

      expect(result.validArtifactIds).toEqual([]);
      expect(result.invalidArtifactIds).toEqual(["Z.99.99"]);
      expect(result.allValid).toBe(false);
    });

    it("should validate branch with mixed valid and invalid artifacts", async () => {
      await createArtifact("C");
      await createArtifact("C.1");
      await createArtifact("C.1.2");

      const validator = new BranchValidator({ baseDir: tempDir });
      const result = await validator.validateBranch("C.1.2-Z.99.99");

      expect(result.validArtifactIds).toEqual(["C.1.2"]);
      expect(result.invalidArtifactIds).toEqual(["Z.99.99"]);
      expect(result.allValid).toBe(false);
    });

    it("should validate non-artifact branch as valid (no artifacts to check)", async () => {
      const validator = new BranchValidator({ baseDir: tempDir });
      const result = await validator.validateBranch("main");

      expect(result.validArtifactIds).toEqual([]);
      expect(result.invalidArtifactIds).toEqual([]);
      expect(result.allValid).toBe(true);
    });

    it("should validate branch with multiple valid artifacts", async () => {
      await createArtifact("C");
      await createArtifact("C.1");
      await createArtifact("C.1.2");
      await createArtifact("C.1.3");

      const validator = new BranchValidator({ baseDir: tempDir });
      const result = await validator.validateBranch("C.1.2-C.1.3");

      expect(result.validArtifactIds).toEqual(["C.1.2", "C.1.3"]);
      expect(result.invalidArtifactIds).toEqual([]);
      expect(result.allValid).toBe(true);
    });

    it("should support various branch naming patterns", async () => {
      await createArtifact("C");
      await createArtifact("C.1");
      await createArtifact("C.1.2");

      const validator = new BranchValidator({ baseDir: tempDir });

      // Direct format
      let result = await validator.validateBranch("C.1.2");
      expect(result.validArtifactIds).toEqual(["C.1.2"]);
      expect(result.allValid).toBe(true);

      // With description
      result = await validator.validateBranch("C.1.2-fix-bug");
      expect(result.validArtifactIds).toEqual(["C.1.2"]);
      expect(result.allValid).toBe(true);

      // With prefix
      result = await validator.validateBranch("feature/C.1.2");
      expect(result.validArtifactIds).toEqual(["C.1.2"]);
      expect(result.allValid).toBe(true);

      // With prefix and suffix
      result = await validator.validateBranch("feature/C.1.2-description");
      expect(result.validArtifactIds).toEqual(["C.1.2"]);
      expect(result.allValid).toBe(true);
    });
  });

  describe("loadArtifactMetadata", () => {
    it("should load metadata for existing artifact", async () => {
      await createArtifact("C");
      await createArtifact("C.1");
      await createArtifact("C.1.2");

      const validator = new BranchValidator({ baseDir: tempDir });
      await expect(
        validator.loadArtifactMetadata("C.1.2"),
      ).resolves.toMatchObject({
        metadata: expect.objectContaining({ title: "Test C.1.2" }),
      });
    });

    it("should throw error for non-existent artifact", async () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      await expect(validator.loadArtifactMetadata("Z.99.99")).rejects.toThrow();
    });
  });

  describe("Configuration", () => {
    it("should use default baseDir if not provided", async () => {
      await createArtifact("C");
      await createArtifact("C.1");
      await createArtifact("C.1.2");

      const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tempDir);
      const validator = new BranchValidator();

      const result = await validator.validateBranch("C.1.2");

      expect(result).toEqual({
        validArtifactIds: ["C.1.2"],
        invalidArtifactIds: [],
        allValid: true,
      });

      cwdSpy.mockRestore();
    });

    it("should use custom baseDir from config", async () => {
      await createArtifact("C");
      await createArtifact("C.1");
      await createArtifact("C.1.2");

      const validator = new BranchValidator({ baseDir: tempDir });
      const result = await validator.validateBranch("C.1.2");

      expect(result.validArtifactIds).toEqual(["C.1.2"]);
      expect(result.allValid).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle empty branch name", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactId("")).toBeNull();
      expect(validator.extractArtifactIds("")).toEqual([]);
    });

    it("should handle branch names with numbers but no artifact pattern", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactId("version-1.2.3")).toBeNull();
      expect(validator.extractArtifactId("release-2024")).toBeNull();
    });

    it("should handle branch names with partial artifact pattern", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      // Must start with uppercase letter followed by period and number
      expect(validator.extractArtifactId("feature-C1")).toBeNull();
      expect(validator.extractArtifactId("feature-c.1")).toBeNull();
      expect(validator.extractArtifactId("feature-1.2")).toBeNull();
    });

    it("should handle very long artifact IDs", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      expect(validator.extractArtifactId("A.1.2.3.4.5.6.7.8.9")).toBe(
        "A.1.2.3.4.5.6.7.8.9",
      );
    });
  });

  // ============================================================================
  // PROPERTY-BASED TESTS
  // ============================================================================

  describe("extractArtifactId - property tests", () => {
    it("extracted ID always matches valid artifact ID pattern", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      fc.assert(
        fc.property(fc.string(), (branchName) => {
          const id = validator.extractArtifactId(branchName);

          // If an ID is found, it must match the pattern
          if (id !== null) {
            expect(id).toMatch(/^[A-Z](\.\d+)+$/);
          }
        }),
      );
    });

    it("consistency: extractArtifactId returns first of extractArtifactIds", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      fc.assert(
        fc.property(fc.string(), (branchName) => {
          const single = validator.extractArtifactId(branchName);
          const multiple = validator.extractArtifactIds(branchName);

          if (single === null) {
            expect(multiple).toHaveLength(0);
          } else {
            expect(multiple.length).toBeGreaterThan(0);
            expect(multiple[0]).toBe(single);
          }
        }),
      );
    });

    it("extractArtifactIds returns unique and sorted IDs", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      fc.assert(
        fc.property(fc.string(), (branchName) => {
          const ids = validator.extractArtifactIds(branchName);

          // Should be unique
          const uniqueIds = [...new Set(ids)];
          expect(ids.length).toBe(uniqueIds.length);

          // Should be sorted
          const sortedIds = [...ids].sort();
          expect(ids).toEqual(sortedIds);
        }),
      );
    });

    it("all extracted IDs have valid format", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      fc.assert(
        fc.property(fc.string(), (branchName) => {
          const ids = validator.extractArtifactIds(branchName);

          // Every extracted ID must match the pattern
          for (const id of ids) {
            expect(id).toMatch(/^[A-Z](\.\d+)+$/);
          }
        }),
      );
    });

    it("extraction is deterministic (idempotent)", () => {
      const validator = new BranchValidator({ baseDir: tempDir });

      fc.assert(
        fc.property(fc.string(), (branchName) => {
          const ids1 = validator.extractArtifactIds(branchName);
          const ids2 = validator.extractArtifactIds(branchName);

          expect(ids1).toEqual(ids2);
        }),
      );
    });
  });
});
