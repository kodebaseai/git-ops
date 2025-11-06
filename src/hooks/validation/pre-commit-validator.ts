/**
 * Pre-commit hook validator that blocks commits with invalid artifacts.
 *
 * Blocking validations for:
 * - Invalid artifact schema (Zod validation)
 * - Orphaned dependencies (references to non-existent artifacts)
 * - Broken relationship consistency
 *
 * @module pre-commit-validator
 */

import { QueryService, ValidationService } from "@kodebase/artifacts";
import type { TAnyArtifact } from "@kodebase/core";
import { execAsync } from "../../utils/exec.js";

/**
 * Error types that can block a commit.
 */
export type PreCommitErrorType =
  | "INVALID_SCHEMA"
  | "ORPHANED_DEPENDENCY"
  | "RELATIONSHIP_INCONSISTENCY"
  | "CIRCULAR_DEPENDENCY";

/**
 * A blocking error during pre-commit validation.
 */
export interface PreCommitError {
  /** Type of error */
  type: PreCommitErrorType;
  /** Human-readable error message */
  message: string;
  /** Artifact ID associated with the error */
  artifactId: string;
  /** Optional field path for the error */
  field?: string;
  /** Suggested fix for the error */
  suggestedFix?: string;
}

/**
 * Result of pre-commit validation.
 */
export interface PreCommitValidationResult {
  /** Whether the commit should be allowed */
  valid: boolean;
  /** Array of blocking errors (empty if valid) */
  errors: PreCommitError[];
  /** Number of artifacts validated */
  artifactsValidated: number;
}

/**
 * Options for pre-commit validation.
 */
export interface PreCommitValidationOptions {
  /** Base directory for artifact files (default: .kodebase/artifacts) */
  artifactsDir?: string;
  /** Whether to validate schema (default: true) */
  validateSchema?: boolean;
  /** Whether to validate dependencies (default: true) */
  validateDependencies?: boolean;
}

/**
 * Validates pre-commit conditions and blocks commit if errors found.
 *
 * Checks for:
 * - Invalid artifact schemas (Zod validation failures)
 * - Orphaned dependencies (references to non-existent artifacts)
 * - Circular dependencies
 * - Relationship inconsistencies
 *
 * @param options - Validation options
 * @returns Validation result with errors (if any)
 *
 * @example
 * ```ts
 * import { validatePreCommit } from "@kodebase/git-ops";
 *
 * const result = await validatePreCommit();
 *
 * if (!result.valid) {
 *   console.error(`❌ Commit blocked: ${result.errors.length} error(s) found`);
 *   for (const error of result.errors) {
 *     console.error(`\n[${error.artifactId}] ${error.message}`);
 *     if (error.suggestedFix) {
 *       console.error(`   Fix: ${error.suggestedFix}`);
 *     }
 *   }
 *   process.exit(1);
 * }
 * ```
 */
export async function validatePreCommit(
  options: PreCommitValidationOptions = {},
): Promise<PreCommitValidationResult> {
  const {
    artifactsDir = ".kodebase/artifacts",
    // validateSchema = true,
    validateDependencies = true,
  } = options;

  const errors: PreCommitError[] = [];

  // Get staged artifact files
  const stagedFiles = await getStagedArtifactFiles(artifactsDir);

  if (stagedFiles.length === 0) {
    return {
      valid: true,
      errors: [],
      artifactsValidated: 0,
    };
  }

  // Load all artifacts for dependency validation
  const queryService = new QueryService(process.cwd());
  const allArtifacts = await queryService.findArtifacts({});
  const artifactMap = new Map(allArtifacts.map((a) => [a.id, a.artifact]));

  // Validate each staged artifact
  const validationService = new ValidationService();
  let artifactsValidated = 0;

  for (const file of stagedFiles) {
    // Extract artifact ID from file path
    const artifactId = extractArtifactIdFromPath(file);
    if (!artifactId) continue;

    const artifact = artifactMap.get(artifactId);
    if (!artifact) {
      // File exists in staging but not loaded - likely schema error
      errors.push({
        type: "INVALID_SCHEMA",
        message: "Failed to load artifact (likely schema validation error)",
        artifactId,
        suggestedFix: "Check YAML syntax and schema compliance",
      });
      artifactsValidated++;
      continue;
    }

    // Run validation through ValidationService
    const result = await validationService.validateArtifact(artifact, {
      artifactId,
      allArtifacts: artifactMap,
    });

    artifactsValidated++;

    if (!result.valid) {
      // Convert validation errors to pre-commit errors
      for (const error of result.errors) {
        const errorType = mapValidationErrorType(error.code);
        errors.push({
          type: errorType,
          message: error.message,
          artifactId,
          field: error.field,
          suggestedFix: error.suggestedFix,
        });
      }
    }

    // Check for orphaned dependencies if enabled
    if (validateDependencies) {
      const orphanedErrors = checkOrphanedDependencies(
        artifactId,
        artifact,
        artifactMap,
      );
      errors.push(...orphanedErrors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    artifactsValidated,
  };
}

/**
 * Gets list of staged artifact files.
 *
 * @private
 */
async function getStagedArtifactFiles(artifactsDir: string): Promise<string[]> {
  // Get staged files using git diff --cached --name-only
  const result = await execAsync(
    `git diff --cached --name-only -- ${artifactsDir}`,
  );

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return [];
  }

  return result.stdout
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.endsWith(".yml"));
}

/**
 * Extracts artifact ID from file path.
 * Example: .kodebase/artifacts/C.git-ops-package/C.7.validation-hooks/C.7.5.integration-tests.yml -> C.7.5
 *
 * @private
 */
function extractArtifactIdFromPath(filePath: string): string | null {
  const match = filePath.match(/([A-Z]\.\d+(?:\.\d+)?(?:\.\d+)?)\.yml$/);
  return match?.[1] ?? null;
}

/**
 * Maps ValidationService error codes to PreCommitErrorType.
 *
 * @private
 */
function mapValidationErrorType(errorCode: string): PreCommitErrorType {
  if (errorCode.includes("schema") || errorCode.includes("SCHEMA")) {
    return "INVALID_SCHEMA";
  }
  if (errorCode.includes("circular") || errorCode.includes("CIRCULAR")) {
    return "CIRCULAR_DEPENDENCY";
  }
  if (
    errorCode.includes("orphan") ||
    errorCode.includes("ORPHAN") ||
    errorCode.includes("missing")
  ) {
    return "ORPHANED_DEPENDENCY";
  }
  return "RELATIONSHIP_INCONSISTENCY";
}

/**
 * Checks for orphaned dependencies (references to non-existent artifacts).
 *
 * @private
 */
function checkOrphanedDependencies(
  artifactId: string,
  artifact: TAnyArtifact,
  allArtifacts: Map<string, TAnyArtifact>,
): PreCommitError[] {
  const errors: PreCommitError[] = [];
  const relationships = artifact.metadata?.relationships;

  if (!relationships) return errors;

  // Check blocked_by dependencies
  if (relationships.blocked_by) {
    for (const depId of relationships.blocked_by) {
      if (!allArtifacts.has(depId)) {
        errors.push({
          type: "ORPHANED_DEPENDENCY",
          message: `Dependency '${depId}' does not exist`,
          artifactId,
          field: "metadata.relationships.blocked_by",
          suggestedFix: `Remove '${depId}' from blocked_by or create the artifact`,
        });
      }
    }
  }

  // Check blocks dependencies
  if (relationships.blocks) {
    for (const depId of relationships.blocks) {
      if (!allArtifacts.has(depId)) {
        errors.push({
          type: "ORPHANED_DEPENDENCY",
          message: `Dependency '${depId}' does not exist`,
          artifactId,
          field: "metadata.relationships.blocks",
          suggestedFix: `Remove '${depId}' from blocks or create the artifact`,
        });
      }
    }
  }

  return errors;
}
