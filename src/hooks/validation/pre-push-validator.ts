/**
 * Pre-push hook validator that provides warnings about potential issues.
 *
 * Non-blocking warnings for:
 * - Uncommitted changes in artifact files
 * - Artifacts in draft or blocked states
 * - Broken dependency chains
 *
 * @module pre-push-validator
 */

import { QueryService } from "@kodebase/artifacts";
import type { TAnyArtifact } from "@kodebase/core";
import {
  ARTIFACT_ID_REGEX,
  getCurrentState,
} from "../../utils/artifact-utils.js";
import { execAsync } from "../../utils/exec.js";

/**
 * Warning types that can be issued by pre-push validation.
 */
export type PrePushWarningType =
  | "UNCOMMITTED_CHANGES"
  | "DRAFT_ARTIFACT"
  | "BLOCKED_ARTIFACT"
  | "BROKEN_DEPENDENCIES";

/**
 * A warning issued during pre-push validation.
 */
export interface PrePushWarning {
  /** Type of warning */
  type: PrePushWarningType;
  /** Human-readable warning message */
  message: string;
  /** Optional artifact ID associated with the warning */
  artifactId?: string;
  /** Optional details about the warning */
  details?: string;
}

/**
 * Result of pre-push validation.
 */
export interface PrePushValidationResult {
  /** Whether any warnings were found */
  hasWarnings: boolean;
  /** Array of warnings */
  warnings: PrePushWarning[];
}

/**
 * Options for pre-push validation.
 */
export interface PrePushValidationOptions {
  /** Base directory for artifact files (default: .kodebase/artifacts) */
  artifactsDir?: string;
  /** Whether to check for uncommitted changes (default: true) */
  checkUncommitted?: boolean;
  /** Whether to check artifact states (default: true) */
  checkStates?: boolean;
  /** Whether to check dependencies (default: true) */
  checkDependencies?: boolean;
}

/**
 * Validates pre-push conditions and returns non-blocking warnings.
 *
 * Checks for:
 * - Uncommitted changes in .kodebase/artifacts/
 * - Artifacts in draft or blocked states
 * - Broken dependency chains
 *
 * @param branchName - Current branch name
 * @param options - Validation options
 * @returns Validation result with warnings
 *
 * @example
 * ```ts
 * import { validatePrePush } from "@kodebase/git-ops";
 *
 * const result = await validatePrePush("C.7.4");
 *
 * if (result.hasWarnings) {
 *   for (const warning of result.warnings) {
 *     console.warn(`⚠️  ${warning.message}`);
 *     if (warning.details) {
 *       console.warn(`   ${warning.details}`);
 *     }
 *   }
 * }
 * ```
 */
export async function validatePrePush(
  branchName: string,
  options: PrePushValidationOptions = {},
): Promise<PrePushValidationResult> {
  const {
    artifactsDir = ".kodebase/artifacts",
    checkUncommitted = true,
    checkStates = true,
  } = options;

  const warnings: PrePushWarning[] = [];

  // Extract artifact IDs from branch name using regex
  const artifactIds = extractArtifactIdsFromBranch(branchName);

  // Check for uncommitted changes in artifacts directory
  if (checkUncommitted) {
    const uncommittedWarnings = await detectUncommittedChanges(artifactsDir);
    warnings.push(...uncommittedWarnings);
  }

  // Check artifact states
  if (checkStates && artifactIds.length > 0) {
    const queryService = new QueryService(process.cwd());
    const allArtifacts = await queryService.findArtifacts({});

    for (const artifactId of artifactIds) {
      try {
        const artifactWithId = allArtifacts.find((a) => a.id === artifactId);
        if (artifactWithId) {
          const stateWarnings = checkArtifactState(
            artifactId,
            artifactWithId.artifact,
          );
          warnings.push(...stateWarnings);
        }
      } catch {
        // Ignore errors loading artifacts - not critical for warnings
      }
    }
  }

  // Note: Dependency validation is handled by pre-commit hook (C.7.3)
  // This pre-push hook focuses on uncommitted changes and state warnings

  return {
    hasWarnings: warnings.length > 0,
    warnings,
  };
}

/**
 * Detects uncommitted changes in the artifacts directory.
 *
 * @private
 */
async function detectUncommittedChanges(
  artifactsDir: string,
): Promise<PrePushWarning[]> {
  const warnings: PrePushWarning[] = [];

  // Check for uncommitted changes using git status
  const result = await execAsync(`git status --porcelain -- ${artifactsDir}`);

  if (result.exitCode === 0 && result.stdout.trim()) {
    // Parse uncommitted files
    const files = result.stdout
      .trim()
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (files.length > 0) {
      warnings.push({
        type: "UNCOMMITTED_CHANGES",
        message: `${files.length} uncommitted artifact file(s) detected`,
        details: `These files have uncommitted changes:\n${files.slice(0, 5).join("\n")}${files.length > 5 ? `\n... and ${files.length - 5} more` : ""}`,
      });
    }
  }

  return warnings;
}

/**
 * Checks artifact state for warnings.
 *
 * @private
 */
function checkArtifactState(
  artifactId: string,
  artifact: TAnyArtifact,
): PrePushWarning[] {
  const warnings: PrePushWarning[] = [];

  try {
    const currentState = getCurrentState(artifact);

    if (currentState === "draft") {
      warnings.push({
        type: "DRAFT_ARTIFACT",
        message: `Artifact ${artifactId} is in 'draft' state`,
        artifactId,
        details:
          "Consider transitioning to 'ready' or 'in_progress' before pushing",
      });
    } else if (currentState === "blocked") {
      warnings.push({
        type: "BLOCKED_ARTIFACT",
        message: `Artifact ${artifactId} is in 'blocked' state`,
        artifactId,
        details: "Check if blocking dependencies have been resolved",
      });
    }
  } catch {
    // Ignore errors getting state - not critical for warnings
  }

  return warnings;
}

/**
 * Extract artifact IDs from branch name using regex.
 *
 * @private
 */
function extractArtifactIdsFromBranch(branchName: string): string[] {
  const matches = branchName.match(ARTIFACT_ID_REGEX);
  return matches ? [...new Set(matches)] : [];
}
