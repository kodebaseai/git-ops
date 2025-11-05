/**
 * Cascade commit creation with agent attribution
 *
 * Creates properly formatted git commits for cascade updates with agent
 * attribution tracking per ADR-006: Human-Centric Agent Attribution.
 *
 * @example
 * ```typescript
 * const result = await createCascadeCommit({
 *   cascadeResults: orchestrationResult,
 *   attribution: {
 *     agentName: 'Kodebase GitOps',
 *     agentVersion: 'v1.0.0',
 *     triggerEvent: 'post-merge',
 *     prNumber: 123,
 *   },
 * });
 *
 * if (result.success) {
 *   console.log(`Commit ${result.commitSha}: ${result.filesChanged} files changed`);
 * }
 * ```
 */

import type { CascadeResult } from "@kodebase/artifacts";
import { execAsync } from "../utils/exec.js";
import type {
  CascadeCommitAttribution,
  CreateCascadeCommitOptions,
  CreateCascadeCommitResult,
} from "./cascade-commit-types.js";

/**
 * Default configuration
 */
const DEFAULT_AUTHOR_NAME = "Kodebase GitOps";
const DEFAULT_AUTHOR_EMAIL = "noreply@kodebase.ai";
const DEFAULT_GIT_ROOT = process.cwd();

/**
 * Create a cascade commit with proper attribution
 *
 * Commits cascade changes to artifact YAML files with:
 * - Formatted commit message listing affected artifacts
 * - Agent attribution footer per ADR-006
 * - Proper git author/committer fields
 *
 * @param options - Commit creation options
 * @returns Commit creation result
 *
 * @example
 * ```typescript
 * const result = await createCascadeCommit({
 *   cascadeResults: {
 *     mergeMetadata: { artifactIds: ['C.1.1'], prNumber: 42, ... },
 *     completionCascade: { events: [...], updatedArtifacts: [...] },
 *     readinessCascade: { events: [...], updatedArtifacts: [...] },
 *     totalArtifactsUpdated: 2,
 *     totalEventsAdded: 3,
 *     summary: 'Updated 2 artifacts',
 *   },
 *   attribution: {
 *     agentName: 'Kodebase GitOps',
 *     agentVersion: 'v1.0.0',
 *     triggerEvent: 'post-merge',
 *     prNumber: 42,
 *   },
 * });
 * ```
 */
export async function createCascadeCommit(
  options: CreateCascadeCommitOptions,
): Promise<CreateCascadeCommitResult> {
  const {
    cascadeResults,
    attribution,
    gitRoot = DEFAULT_GIT_ROOT,
    authorName = attribution.agentName || DEFAULT_AUTHOR_NAME,
    authorEmail = DEFAULT_AUTHOR_EMAIL,
  } = options;

  // Check if there are any changes
  if (cascadeResults.totalArtifactsUpdated === 0) {
    return {
      success: true,
      message: "No cascade changes to commit",
      filesChanged: 0,
    };
  }

  try {
    // Stage artifact changes
    const stageResult = await stageArtifactChanges(gitRoot);
    if (!stageResult.success) {
      return {
        success: false,
        error: stageResult.error,
      };
    }

    // Generate commit message
    const message = generateCommitMessage(cascadeResults, attribution);

    // Create commit with attribution
    const commitResult = await commitChanges({
      message,
      gitRoot,
      authorName,
      authorEmail,
      humanActor: attribution.humanActor,
    });

    if (!commitResult.success) {
      return {
        success: false,
        error: commitResult.error,
      };
    }

    return {
      success: true,
      commitSha: commitResult.commitSha,
      message,
      filesChanged: cascadeResults.totalArtifactsUpdated,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stage artifact YAML files for commit
 */
async function stageArtifactChanges(
  gitRoot: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { exitCode, stderr } = await execAsync(
      "git add .kodebase/artifacts/**/*.yml",
      { cwd: gitRoot },
    );

    if (exitCode !== 0) {
      return {
        success: false,
        error: `Failed to stage changes: ${stderr}`,
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Generate commit message with affected artifacts and attribution
 *
 * Format per artifact notes in C.5.4:
 * ```
 * cascade: Update artifact states after PR merge
 *
 * Affected artifacts:
 * - C.1.1: draft → completed
 * - C.1: blocked → in_review
 *
 * Agent-Attribution: kodebase-git-ops/v1.0.0
 * Trigger: post-merge (PR #123)
 * ```
 */
function generateCommitMessage(
  cascadeResults: CreateCascadeCommitOptions["cascadeResults"],
  attribution: CascadeCommitAttribution,
): string {
  const lines: string[] = [];

  // Title line
  const prRef = cascadeResults.mergeMetadata.prNumber
    ? ` (PR #${cascadeResults.mergeMetadata.prNumber})`
    : "";
  lines.push(`cascade: Update artifact states after PR merge${prRef}`);
  lines.push("");

  // Affected artifacts section
  const affectedArtifacts = collectAffectedArtifacts(cascadeResults);
  if (affectedArtifacts.length > 0) {
    lines.push("Affected artifacts:");
    for (const artifact of affectedArtifacts) {
      lines.push(`- ${artifact.artifactId}: ${artifact.description}`);
    }
    lines.push("");
  }

  // Attribution footer per ADR-006
  lines.push(
    `Agent-Attribution: ${attribution.agentName}/${attribution.agentVersion}`,
  );

  const triggerRef = attribution.prNumber
    ? ` (PR #${attribution.prNumber})`
    : "";
  lines.push(`Trigger: ${attribution.triggerEvent}${triggerRef}`);

  return lines.join("\n");
}

/**
 * Collect affected artifacts from cascade results
 */
function collectAffectedArtifacts(
  cascadeResults: CreateCascadeCommitOptions["cascadeResults"],
): Array<{ artifactId: string; description: string }> {
  const artifactMap = new Map<string, string[]>();

  // Collect events from both cascades
  const allEvents: CascadeResult["events"] = [
    ...cascadeResults.completionCascade.events,
    ...cascadeResults.readinessCascade.events,
  ];

  // Group events by artifact
  for (const event of allEvents) {
    if (!artifactMap.has(event.artifactId)) {
      artifactMap.set(event.artifactId, []);
    }
    artifactMap.get(event.artifactId)?.push(event.event);
  }

  // Format as "artifactId: events"
  const result: Array<{ artifactId: string; description: string }> = [];
  for (const [artifactId, events] of artifactMap.entries()) {
    const uniqueEvents = [...new Set(events)];
    result.push({
      artifactId,
      description: uniqueEvents.join(", "),
    });
  }

  // Sort by artifact ID
  result.sort((a, b) => a.artifactId.localeCompare(b.artifactId));

  return result;
}

/**
 * Commit staged changes with attribution
 */
async function commitChanges(options: {
  message: string;
  gitRoot: string;
  authorName: string;
  authorEmail: string;
  humanActor?: string;
}): Promise<{ success: boolean; commitSha?: string; error?: string }> {
  const { message, gitRoot, authorName, authorEmail, humanActor } = options;

  try {
    // Build commit message with Co-Authored-By if human actor provided
    let fullMessage = message;
    if (humanActor) {
      fullMessage += `\n\nCo-Authored-By: ${humanActor}`;
    }

    // Set git author/committer and create commit
    const { exitCode, stderr } = await execAsync(
      `git -c user.name=${JSON.stringify(authorName)} -c user.email=${JSON.stringify(authorEmail)} commit -m ${JSON.stringify(fullMessage)}`,
      { cwd: gitRoot },
    );

    if (exitCode !== 0) {
      return {
        success: false,
        error: `Failed to create commit: ${stderr}`,
      };
    }

    // Get commit SHA
    const { stdout: sha, exitCode: shaExitCode } = await execAsync(
      "git rev-parse HEAD",
      { cwd: gitRoot },
    );

    if (shaExitCode !== 0) {
      return {
        success: false,
        error: "Failed to get commit SHA",
      };
    }

    return {
      success: true,
      commitSha: sha.trim(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
