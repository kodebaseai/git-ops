import { describe, expect, it, vi } from "vitest";
import type { BranchValidationResult } from "../validation/branch-validator.js";
import { PostCheckoutDetector } from "./post-checkout-detector.js";

const mockBranchValidation = (result: BranchValidationResult) =>
  vi.fn().mockResolvedValue(result);

const detectorWithMocks = (overrides: Partial<BranchValidationResult> = {}) => {
  const detector = new PostCheckoutDetector({
    gitRoot: "/repo",
  }) as unknown as PostCheckoutDetector & {
    getCurrentBranch: ReturnType<typeof vi.fn>;
    branchValidator: { validateBranch: ReturnType<typeof vi.fn> };
  };

  detector.getCurrentBranch = vi.fn().mockResolvedValue("feature/C.1.2");
  detector.branchValidator = {
    validateBranch: mockBranchValidation({
      validArtifactIds: ["C.1.2"],
      invalidArtifactIds: [],
      allValid: true,
      ...overrides,
    }),
  };

  return detector;
};

describe("PostCheckoutDetector (unit)", () => {
  it("ignores file checkouts", async () => {
    const detector = new PostCheckoutDetector();
    const result = await detector.detectCheckout("a1", "b1", 0);

    expect(result.shouldExecute).toBe(false);
    expect(result.reason).toBe("File checkout (not branch)");
  });

  it("returns metadata for valid branch checkouts", async () => {
    const detector = detectorWithMocks();
    const result = await detector.detectCheckout("a1", "a1", 1);

    expect(result.shouldExecute).toBe(true);
    expect(result.metadata).toEqual(
      expect.objectContaining({
        artifactIds: ["C.1.2"],
        isNewBranch: true,
      }),
    );
    expect(result.reason).toContain("New branch created");
  });

  it("rejects branches with invalid artifacts", async () => {
    const detector = detectorWithMocks({
      validArtifactIds: ["C.1.2"],
      invalidArtifactIds: ["Z.9.9"],
      allValid: false,
    });

    const result = await detector.detectCheckout("a1", "a1", 1);

    expect(result.shouldExecute).toBe(false);
    expect(result.reason).toContain("Invalid artifact IDs found");
  });

  it("handles errors from branch validator gracefully", async () => {
    const detector = detectorWithMocks();
    detector.branchValidator.validateBranch.mockRejectedValueOnce(
      new Error("fs failure"),
    );

    const result = await detector.detectCheckout("a1", "a1", 1);

    expect(result.shouldExecute).toBe(false);
    expect(result.reason).toContain("Error detecting checkout");
  });
});
