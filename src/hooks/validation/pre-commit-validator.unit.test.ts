import { beforeEach, describe, expect, it, vi } from "vitest";

const execAsyncMock = vi.hoisted(() => vi.fn());
const findArtifactsMock = vi.hoisted(() => vi.fn());
const validateArtifactMock = vi.hoisted(() => vi.fn());

vi.mock("../../utils/exec.js", () => ({
  execAsync: execAsyncMock,
}));

vi.mock("@kodebase/artifacts", async () => {
  const actual = await vi.importActual<typeof import("@kodebase/artifacts")>(
    "@kodebase/artifacts",
  );

  class QueryService {
    findArtifacts = findArtifactsMock;
  }

  class ValidationService {
    validateArtifact = validateArtifactMock;
  }

  return {
    ...actual,
    QueryService,
    ValidationService,
  };
});

import { validatePreCommit } from "./pre-commit-validator.js";

const stagedFilePath = ".kodebase/artifacts/C/C.1.2/C.1.2.yml";

const baseArtifact = {
  metadata: {
    relationships: {
      blocked_by: ["Z.9.9"],
      blocks: ["A.1.5"],
    },
  },
};

describe("pre-commit validator (unit)", () => {
  beforeEach(() => {
    execAsyncMock.mockReset();
    findArtifactsMock.mockReset();
    validateArtifactMock.mockReset();
  });

  it("returns valid when no staged artifact files exist", async () => {
    execAsyncMock.mockResolvedValueOnce({ stdout: "", exitCode: 0 });

    const result = await validatePreCommit();

    expect(result.valid).toBe(true);
    expect(result.artifactsValidated).toBe(0);
    expect(findArtifactsMock).not.toHaveBeenCalled();
  });

  it("collects schema and dependency errors for staged artifacts", async () => {
    execAsyncMock.mockResolvedValueOnce({
      stdout: `${stagedFilePath}\n`,
      exitCode: 0,
    });

    findArtifactsMock.mockResolvedValue([
      { id: "C.1.2", artifact: baseArtifact },
    ]);

    validateArtifactMock.mockResolvedValueOnce({
      valid: false,
      errors: [
        {
          code: "schema_validation_error",
          message: "Title required",
          field: "metadata.title",
          suggestedFix: "Add title",
        },
      ],
    });

    const result = await validatePreCommit({
      validateDependencies: true,
    });

    expect(result.valid).toBe(false);
    expect(result.artifactsValidated).toBe(1);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "INVALID_SCHEMA",
          message: "Title required",
          field: "metadata.title",
        }),
        expect.objectContaining({
          type: "ORPHANED_DEPENDENCY",
          field: "metadata.relationships.blocked_by",
          message: expect.stringContaining("Z.9.9"),
        }),
      ]),
    );
  });

  it("reports missing artifacts as schema errors", async () => {
    execAsyncMock.mockResolvedValueOnce({
      stdout: `${stagedFilePath}\n`,
      exitCode: 0,
    });

    findArtifactsMock.mockResolvedValue([]);

    const result = await validatePreCommit({
      validateDependencies: false,
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        type: "INVALID_SCHEMA",
        artifactId: "C.1.2",
      }),
    ]);
  });
});
