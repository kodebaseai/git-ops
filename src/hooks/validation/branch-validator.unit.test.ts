import { beforeEach, describe, expect, it, vi } from "vitest";

const findArtifactsMock = vi.fn();

vi.mock("@kodebase/artifacts", async () => {
  const actual = await vi.importActual<typeof import("@kodebase/artifacts")>(
    "@kodebase/artifacts",
  );

  return {
    ...actual,
    QueryService: class QueryService {
      findArtifacts = findArtifactsMock;
    },
  };
});

import { BranchValidator } from "./branch-validator.js";

const mockArtifacts = [
  {
    id: "C.1.2",
    artifact: { metadata: { title: "Valid artifact" } },
  },
  {
    id: "A.1.5",
    artifact: { metadata: { title: "Another artifact" } },
  },
];

describe("BranchValidator", () => {
  beforeEach(() => {
    findArtifactsMock.mockReset();
    findArtifactsMock.mockResolvedValue(mockArtifacts);
  });

  describe("artifact extraction helpers", () => {
    const validator = new BranchValidator({ baseDir: "/tmp" });

    it("extracts the first artifact ID from complex branch names", () => {
      expect(validator.extractArtifactId("feature/C.1.2-description")).toBe(
        "C.1.2",
      );
      expect(validator.extractArtifactId("main")).toBeNull();
    });

    it("returns unique, sorted artifact IDs", () => {
      const ids = validator.extractArtifactIds("C.1.2-A.1.5-C.1.2");
      expect(ids).toEqual(["A.1.5", "C.1.2"]);
    });
  });

  describe("validateBranch", () => {
    it("short-circuits when no artifact IDs are present", async () => {
      const validator = new BranchValidator({ baseDir: "/tmp" });
      const result = await validator.validateBranch("main");

      expect(result).toEqual({
        validArtifactIds: [],
        invalidArtifactIds: [],
        allValid: true,
      });
      expect(findArtifactsMock).not.toHaveBeenCalled();
    });

    it("separates valid and invalid IDs", async () => {
      const validator = new BranchValidator({ baseDir: "/tmp" });
      const result = await validator.validateBranch("feature/C.1.2-Z.9.9");

      expect(result.validArtifactIds).toEqual(["C.1.2"]);
      expect(result.invalidArtifactIds).toEqual(["Z.9.9"]);
      expect(result.allValid).toBe(false);
      expect(findArtifactsMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("artifact caching & metadata loading", () => {
    it("reuses cached artifact IDs across validations", async () => {
      const validator = new BranchValidator({ baseDir: "/tmp" });

      expect(await validator.validateArtifactExists("C.1.2")).toBe(true);
      expect(await validator.validateArtifactExists("missing")).toBe(false);
      expect(findArtifactsMock).toHaveBeenCalledTimes(1);
    });

    it("returns artifact metadata and throws when missing", async () => {
      const validator = new BranchValidator({ baseDir: "/tmp" });
      const artifact = await validator.loadArtifactMetadata("A.1.5");

      expect(artifact.metadata.title).toBe("Another artifact");
      await expect(validator.loadArtifactMetadata("Z.9.9")).rejects.toThrow(
        'Artifact "Z.9.9" not found',
      );
    });
  });
});
