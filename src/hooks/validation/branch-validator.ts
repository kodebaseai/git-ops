/**
 * Branch name validation and artifact extraction
 *
 * Validates that artifact IDs extracted from branch names correspond to
 * actual artifacts in the .kodebase/artifacts/ directory.
 *
 * @module branch-validator
 */

import { QueryService } from "@kodebase/artifacts";
import type { TAnyArtifact } from "@kodebase/core";
import { ARTIFACT_ID_REGEX } from "../../utils/artifact-utils.js";

/**
 * Result of branch validation containing valid and invalid artifact IDs
 */
export interface BranchValidationResult {
  /**
   * Artifact IDs that were found and validated
   */
  validArtifactIds: string[];

  /**
   * Artifact IDs that were not found in the artifacts directory
   */
  invalidArtifactIds: string[];

  /**
   * Whether all extracted artifact IDs are valid
   */
  allValid: boolean;
}

/**
 * Branch validator for extracting and validating artifact IDs
 *
 * Extracts artifact IDs from branch names using regex patterns and
 * validates their existence in the .kodebase/artifacts/ directory.
 *
 * @example
 * ```typescript
 * const validator = new BranchValidator({ baseDir: '/path/to/repo' });
 *
 * // Extract and validate artifact IDs
 * const result = await validator.validateBranch('C.1.2-feature');
 *
 * if (result.allValid) {
 *   console.log(`Valid artifacts: ${result.validArtifactIds.join(', ')}`);
 * } else {
 *   console.log(`Invalid artifacts: ${result.invalidArtifactIds.join(', ')}`);
 * }
 * ```
 */
export class BranchValidator {
  private readonly queryService: QueryService;
  private artifactIdCache: Set<string> | null = null;

  /**
   * Creates a new BranchValidator instance
   *
   * @param options - Configuration options
   * @param options.baseDir - Base directory of the project (defaults to process.cwd())
   */
  constructor(options: { baseDir?: string } = {}) {
    const baseDir = options.baseDir ?? process.cwd();
    this.queryService = new QueryService(baseDir);
  }

  /**
   * Extract artifact IDs from branch name
   *
   * Supports various branch naming patterns:
   * - Direct: 'C.1.2', 'A.1.5'
   * - With prefix: 'feature/C.1.2', 'feature-C.1.2'
   * - With suffix: 'C.1.2-description', 'C.1.2-fix-bug'
   * - Multiple IDs: 'C.1.2-C.1.3'
   *
   * Returns null for non-artifact branches (main, develop, hotfix/*, etc.)
   *
   * @param branchName - Branch name to extract from
   * @returns Artifact ID or null if no artifact ID found
   *
   * @example
   * ```typescript
   * extractArtifactId('C.1.2')                    // 'C.1.2'
   * extractArtifactId('feature/C.1.2-description') // 'C.1.2'
   * extractArtifactId('C.1.2-fix-bug')             // 'C.1.2'
   * extractArtifactId('main')                      // null
   * extractArtifactId('develop')                   // null
   * extractArtifactId('hotfix/fix-login')          // null
   * ```
   */
  extractArtifactId(branchName: string): string | null {
    const matches = branchName.match(ARTIFACT_ID_REGEX);
    if (!matches || matches.length === 0) {
      return null;
    }

    // Return the first artifact ID found
    // (for branches with multiple IDs, we take the first one as primary)
    return matches[0];
  }

  /**
   * Extract all artifact IDs from branch name
   *
   * @param branchName - Branch name to extract from
   * @returns Array of unique artifact IDs, sorted
   *
   * @example
   * ```typescript
   * extractArtifactIds('C.1.2')        // ['C.1.2']
   * extractArtifactIds('C.1.2-C.1.3')  // ['C.1.2', 'C.1.3']
   * extractArtifactIds('feature-C.4.1.2') // ['C.4.1.2']
   * extractArtifactIds('main')         // []
   * ```
   */
  extractArtifactIds(branchName: string): string[] {
    const matches = branchName.match(ARTIFACT_ID_REGEX);
    if (!matches) {
      return [];
    }

    // Return unique, sorted artifact IDs
    return Array.from(new Set(matches)).sort();
  }

  /**
   * Load all artifact IDs from the artifacts directory (with caching)
   *
   * @returns Set of all artifact IDs
   */
  private async loadArtifactIds(): Promise<Set<string>> {
    if (this.artifactIdCache) {
      return this.artifactIdCache;
    }

    const artifacts = await this.queryService.findArtifacts({});
    const ids = new Set<string>(artifacts.map((a) => a.id));

    this.artifactIdCache = ids;
    return ids;
  }

  /**
   * Validate that an artifact ID exists in the artifacts directory
   *
   * @param artifactId - Artifact ID to validate (e.g., 'C.1.2')
   * @returns True if artifact exists, false otherwise
   */
  async validateArtifactExists(artifactId: string): Promise<boolean> {
    const artifactIds = await this.loadArtifactIds();
    return artifactIds.has(artifactId);
  }

  /**
   * Validate branch name and extract valid artifact IDs
   *
   * Extracts all artifact IDs from the branch name and validates
   * that each one exists in the .kodebase/artifacts/ directory.
   *
   * @param branchName - Branch name to validate
   * @returns Validation result with valid and invalid artifact IDs
   *
   * @example
   * ```typescript
   * // Valid artifact
   * const result = await validator.validateBranch('C.1.2-feature');
   * // result.validArtifactIds = ['C.1.2']
   * // result.invalidArtifactIds = []
   * // result.allValid = true
   *
   * // Invalid artifact
   * const result = await validator.validateBranch('Z.99.99-feature');
   * // result.validArtifactIds = []
   * // result.invalidArtifactIds = ['Z.99.99']
   * // result.allValid = false
   *
   * // Non-artifact branch
   * const result = await validator.validateBranch('main');
   * // result.validArtifactIds = []
   * // result.invalidArtifactIds = []
   * // result.allValid = true (no artifacts to validate)
   * ```
   */
  async validateBranch(branchName: string): Promise<BranchValidationResult> {
    const extractedIds = this.extractArtifactIds(branchName);

    // If no artifact IDs found, return empty result (considered valid)
    if (extractedIds.length === 0) {
      return {
        validArtifactIds: [],
        invalidArtifactIds: [],
        allValid: true,
      };
    }

    const validArtifactIds: string[] = [];
    const invalidArtifactIds: string[] = [];

    // Validate each artifact ID
    for (const id of extractedIds) {
      const exists = await this.validateArtifactExists(id);
      if (exists) {
        validArtifactIds.push(id);
      } else {
        invalidArtifactIds.push(id);
      }
    }

    return {
      validArtifactIds,
      invalidArtifactIds,
      allValid: invalidArtifactIds.length === 0,
    };
  }

  /**
   * Load artifact metadata for a validated artifact ID
   *
   * @param artifactId - Artifact ID to load
   * @returns Artifact metadata
   * @throws Error if artifact doesn't exist
   *
   * @example
   * ```typescript
   * const artifact = await validator.loadArtifactMetadata('C.1.2');
   * console.log(artifact.metadata.title);
   * ```
   */
  async loadArtifactMetadata(artifactId: string): Promise<TAnyArtifact> {
    const artifacts = await this.queryService.findArtifacts({});
    const artifactWithId = artifacts.find((a) => a.id === artifactId);

    if (!artifactWithId) {
      throw new Error(`Artifact "${artifactId}" not found`);
    }

    return artifactWithId.artifact;
  }
}
