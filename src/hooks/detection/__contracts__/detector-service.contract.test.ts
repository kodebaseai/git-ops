import {
  contractDetectorService,
  type DetectorContractSubject,
} from "@kodebase/test-utils/contracts";
import { describe } from "vitest";
import { PostCheckoutDetector } from "../post-checkout-detector.js";
import type {
  CheckoutDetectionResult,
  CheckoutMetadata,
  PostCheckoutConfig,
} from "../post-checkout-types.js";
import { PostMergeDetector } from "../post-merge-detector.js";
import type {
  MergeDetectionResult,
  MergeMetadata,
  PostMergeConfig,
} from "../post-merge-types.js";

type MutablePostCheckoutDetector = PostCheckoutDetector & {
  getCurrentBranch: () => Promise<string>;
  branchValidator: {
    validateBranch: () => Promise<{
      validArtifactIds: string[];
      invalidArtifactIds: string[];
      allValid: boolean;
    }>;
  };
};

type MutablePostMergeDetector = PostMergeDetector & {
  getCurrentBranch: () => Promise<string>;
  getCommitSha: () => Promise<string>;
  getSourceBranch: () => Promise<string | null>;
  getPRNumber: () => Promise<number | null>;
  getPRMetadata: () => Promise<{ title: string | null; body: string | null }>;
  extractMergeMetadata: () => Promise<MergeMetadata>;
};

type CheckoutScenario = {
  repoPath: string;
  previousHead: string;
  newHead: string;
  branchFlag: number;
  branchName: string;
  artifactIds: string[];
  invalidArtifactIds?: string[];
  reason?: string;
};

type MergeScenario = {
  repoPath: string;
  branch: string;
  commitSha: string;
  sourceBranch: string | null;
  prNumber: number | null;
  prTitle: string | null;
  prBody: string | null;
  artifactIds: string[];
  reason?: string;
  requirePR?: boolean;
};

describe("DetectorService Contracts", () => {
  contractDetectorService<PostCheckoutConfig, CheckoutMetadata>(
    "PostCheckoutDetector",
    {
      scenarios: {
        valid: "checkout-valid",
        invalid: "checkout-invalid",
        noArtifacts: "checkout-no-artifacts",
        missingRepo: "checkout-missing",
      },
      setupScenario: async (name) => checkoutScenarioFactory(name),
      createDetector: async (scenario, config) =>
        new CheckoutDetectorSubject(scenario as CheckoutScenario, config),
      configOverrides: {
        strict: { gitRoot: process.cwd() },
      },
    },
  );

  contractDetectorService<PostMergeConfig, MergeMetadata>("PostMergeDetector", {
    scenarios: {
      valid: "merge-valid",
      invalid: "merge-invalid",
      noArtifacts: "merge-no-artifacts",
      missingRepo: "merge-missing",
    },
    setupScenario: async (name) => mergeScenarioFactory(name),
    createDetector: async (scenario, config) =>
      new MergeDetectorSubject(scenario as MergeScenario, config),
    configOverrides: {
      strict: { targetBranch: "main", requirePR: true },
      lenient: { targetBranch: "main", requirePR: false },
    },
  });
});

class CheckoutDetectorSubject
  implements DetectorContractSubject<CheckoutMetadata>
{
  private detector: PostCheckoutDetector;
  private scenario: CheckoutScenario;

  constructor(scenario: CheckoutScenario, config?: PostCheckoutConfig) {
    this.scenario = scenario;
    this.detector = new PostCheckoutDetector(config);

    const testable = this.detector as MutablePostCheckoutDetector;
    testable.getCurrentBranch = async () => scenario.branchName;
    testable.branchValidator = {
      validateBranch: async () => ({
        validArtifactIds: scenario.artifactIds,
        invalidArtifactIds: scenario.invalidArtifactIds ?? [],
        allValid: (scenario.invalidArtifactIds?.length ?? 0) === 0,
      }),
    };
  }

  detect(): Promise<CheckoutDetectionResult> {
    if (this.scenario.reason === "missing") {
      (this.detector as MutablePostCheckoutDetector).getCurrentBranch =
        async () => {
          throw new Error("Repository not found");
        };
    }

    return this.detector.detectCheckout(
      this.scenario.previousHead,
      this.scenario.newHead,
      this.scenario.branchFlag,
    );
  }
}

class MergeDetectorSubject implements DetectorContractSubject<MergeMetadata> {
  private detector: PostMergeDetector;
  private scenario: MergeScenario;

  constructor(scenario: MergeScenario, config?: PostMergeConfig) {
    this.scenario = scenario;
    this.detector = new PostMergeDetector(config);

    const testable = this.detector as MutablePostMergeDetector;
    testable.getCurrentBranch = async () => scenario.branch;
    testable.getCommitSha = async () => scenario.commitSha;
    testable.getSourceBranch = async () => scenario.sourceBranch;
    testable.getPRNumber = async () => scenario.prNumber;
    testable.getPRMetadata = async () => ({
      title: scenario.prTitle,
      body: scenario.prBody,
    });
    testable.extractMergeMetadata = async () => ({
      targetBranch: scenario.branch,
      sourceBranch: scenario.sourceBranch,
      commitSha: scenario.commitSha,
      prNumber: scenario.prNumber,
      prTitle: scenario.prTitle,
      prBody: scenario.prBody,
      isPRMerge: scenario.prNumber !== null,
      artifactIds: scenario.artifactIds,
    });
  }

  detect(): Promise<MergeDetectionResult> {
    if (this.scenario.reason === "missing") {
      (this.detector as MutablePostMergeDetector).getCurrentBranch =
        async () => {
          throw new Error("Repository not found");
        };
    }

    return this.detector.detectMerge();
  }
}

async function checkoutScenarioFactory(
  name: string,
): Promise<CheckoutScenario> {
  switch (name) {
    case "checkout-valid":
      return {
        repoPath: process.cwd(),
        previousHead: "abc",
        newHead: "abc",
        branchFlag: 1,
        branchName: "D.2.7.contract-test",
        artifactIds: ["D.2.7"],
      };
    case "checkout-invalid":
      return {
        repoPath: process.cwd(),
        previousHead: "abc",
        newHead: "abc",
        branchFlag: 1,
        branchName: "invalid-branch",
        artifactIds: [],
        invalidArtifactIds: ["INVALID"],
      };
    case "checkout-no-artifacts":
      return {
        repoPath: process.cwd(),
        previousHead: "abc",
        newHead: "abc",
        branchFlag: 1,
        branchName: "feature/no-artifacts",
        artifactIds: [],
      };
    case "checkout-missing":
      return {
        repoPath: "/nonexistent",
        previousHead: "abc",
        newHead: "abc",
        branchFlag: 1,
        branchName: "main",
        artifactIds: [],
        reason: "missing",
      };
    default:
      return {
        repoPath: process.cwd(),
        previousHead: "abc",
        newHead: "abc",
        branchFlag: 1,
        branchName: "main",
        artifactIds: [],
      };
  }
}

async function mergeScenarioFactory(name: string): Promise<MergeScenario> {
  switch (name) {
    case "merge-valid":
      return {
        repoPath: process.cwd(),
        branch: "main",
        commitSha: "abc123",
        sourceBranch: "feature/D.2.7",
        prNumber: 42,
        prTitle: "D.2.7 Contract",
        prBody: "Implements contracts",
        artifactIds: ["D.2.7"],
      };
    case "merge-invalid":
      return {
        repoPath: process.cwd(),
        branch: "develop",
        commitSha: "abc123",
        sourceBranch: "feature/no-artifacts",
        prNumber: null,
        prTitle: null,
        prBody: null,
        artifactIds: [],
        reason: "direct",
      };
    case "merge-no-artifacts":
      return {
        repoPath: process.cwd(),
        branch: "main",
        commitSha: "abc123",
        sourceBranch: "hotfix/no-artifacts",
        prNumber: 7,
        prTitle: "Hotfix",
        prBody: "No artifact references",
        artifactIds: [],
      };
    case "merge-missing":
      return {
        repoPath: "/nonexistent",
        branch: "main",
        commitSha: "abc123",
        sourceBranch: null,
        prNumber: null,
        prTitle: null,
        prBody: null,
        artifactIds: [],
        reason: "missing",
      };
    default:
      return {
        repoPath: process.cwd(),
        branch: "main",
        commitSha: "abc123",
        sourceBranch: "feature/default",
        prNumber: null,
        prTitle: null,
        prBody: null,
        artifactIds: [],
      };
  }
}
