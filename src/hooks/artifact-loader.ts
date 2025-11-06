/**
 * Artifact metadata loading utilities
 *
 * Helper functions to load artifact metadata from the artifacts directory.
 * Used by DraftPRService to extract PR content from artifact files.
 */

import path from "node:path";
import type { TAnyArtifact } from "@kodebase/core";
import {
  getArtifactIdFromPath,
  loadAllArtifactPaths,
  readArtifact,
} from "@kodebase/core";
import type { DraftPRConfig } from "./draft-pr-types.js";

/**
 * Load artifact metadata by ID
 *
 * Searches for the artifact file in the artifacts directory and loads it.
 *
 * @param artifactId - Artifact ID (e.g., "C.6.3")
 * @param config - Draft PR configuration containing gitRoot and artifactsDir
 * @returns Parsed artifact data
 * @throws {Error} If artifact file not found or parsing fails
 *
 * @example
 * ```typescript
 * const artifact = await loadArtifactMetadata('C.6.3', {
 *   gitRoot: '/path/to/repo',
 *   artifactsDir: '.kodebase/artifacts',
 * });
 * console.log(artifact.metadata.title);
 * ```
 */
export async function loadArtifactMetadata(
  artifactId: string,
  config: Pick<DraftPRConfig, "gitRoot" | "artifactsDir">,
): Promise<TAnyArtifact> {
  const gitRoot = config.gitRoot ?? process.cwd();
  const artifactsDir = config.artifactsDir ?? ".kodebase/artifacts";

  // Build artifact path
  const artifactPath = await findArtifactPath(
    artifactId,
    gitRoot,
    artifactsDir,
  );

  // Load and parse artifact
  const artifact = await readArtifact<TAnyArtifact>(artifactPath);
  return artifact;
}

/**
 * Find artifact file path from ID
 *
 * Searches all artifact files in the artifacts directory to find
 * the file matching the given artifact ID.
 *
 * @param artifactId - Artifact ID (e.g., "C.6.3")
 * @param gitRoot - Git repository root
 * @param artifactsDir - Artifacts directory (relative to gitRoot)
 * @returns Absolute path to artifact file
 * @throws {Error} If artifact file not found
 * @private
 */
async function findArtifactPath(
  artifactId: string,
  gitRoot: string,
  artifactsDir: string,
): Promise<string> {
  const artifactsRoot = path.join(gitRoot, artifactsDir);

  // Load all artifact paths
  const allPaths = await loadAllArtifactPaths(artifactsRoot);

  // Find the path matching the artifact ID
  for (const filePath of allPaths) {
    const id = getArtifactIdFromPath(filePath);
    if (id === artifactId) {
      return filePath;
    }
  }

  throw new Error(
    `Artifact ${artifactId} not found in ${artifactsRoot}. ` +
      `Searched ${allPaths.length} artifact files.`,
  );
}
