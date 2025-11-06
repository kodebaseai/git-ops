/**
 * Re-exports of artifact utilities from @kodebase/artifacts package.
 *
 * This module provides a central place to import artifact-related utilities
 * used throughout the git-ops package, ensuring consistent usage of the
 * artifacts middle layer.
 *
 * @module artifact-utils
 */

export {
  ARTIFACT_ID_REGEX,
  extractArtifactIds,
  getArtifactSlug,
  getCurrentState,
} from "@kodebase/artifacts";
