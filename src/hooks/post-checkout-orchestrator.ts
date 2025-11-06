/**
 * Post-checkout hook orchestrator
 *
 * Orchestrates the post-checkout workflow:
 * 1. Detects artifact-related branch checkout
 * 2. Transitions artifact(s) to in_progress state
 * 3. Executes progress cascade (parent artifacts → in_progress)
 * 4. Creates draft PR for the branch
 *
 * Integrates with:
 * - PostCheckoutDetector: Detects new branch creation and extracts artifact IDs
 * - CascadeService (from @kodebase/artifacts): Executes progress cascades
 * - DraftPRService: Creates draft PRs on GitHub
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import { ArtifactService, CascadeService } from "@kodebase/artifacts";
import { getArtifactIdFromPath, loadAllArtifactPaths } from "@kodebase/core";
import { PostCheckoutDetector } from "./post-checkout-detector.js";
import type {
  PostCheckoutOrchestratorConfig,
  PostCheckoutOrchestratorResult,
} from "./post-checkout-orchestrator-types.js";

const execAsync = promisify(exec);

/**
 * Default configuration for post-checkout orchestration
 */
const DEFAULT_CONFIG: Required<
  Omit<PostCheckoutOrchestratorConfig, "draftPRService" | "artifactService">
> = {
  baseDir: process.cwd(),
  enableDraftPR: true,
  enableCascade: true,
};

/**
 * Orchestrates post-checkout hook execution
 *
 * Handles the complete workflow when checking out a branch with artifact IDs:
 * 1. Detects if this is a new branch with valid artifact IDs
 * 2. Transitions artifacts to in_progress
 * 3. Executes progress cascade to update parent artifacts
 * 4. Creates draft PR on GitHub
 *
 * **Error Handling:**
 * - Failures in artifact transitions are logged but don't block PR creation
 * - Failures in cascade execution are logged but don't block the hook
 * - Failures in PR creation are logged but don't fail the git operation
 * - All errors are collected and returned in the result
 *
 * @example Basic usage
 * ```typescript
 * const orchestrator = new PostCheckoutOrchestrator();
 *
 * // Git calls post-checkout with: previous_head new_head branch_flag
 * const result = await orchestrator.execute('abc123', 'abc123', 1);
 *
 * if (result.success) {
 *   console.log(`Branch: ${result.branchName}`);
 *   console.log(`Artifacts transitioned: ${result.artifactsTransitioned.join(', ')}`);
 *   console.log(`Parent artifacts cascaded: ${result.parentsCascaded.join(', ')}`);
 *   if (result.prUrl) console.log(`Draft PR: ${result.prUrl}`);
 * }
 * ```
 *
 * @example With custom services (dependency injection)
 * ```typescript
 * const orchestrator = new PostCheckoutOrchestrator({
 *   baseDir: '/custom/path',
 *   draftPRService: customPRService,
 *   artifactService: customArtifactService,
 *   enableDraftPR: false, // Skip PR creation
 * });
 * ```
 */
export class PostCheckoutOrchestrator {
  private config: Required<PostCheckoutOrchestratorConfig>;
  private detector: PostCheckoutDetector;
  private artifactService: ArtifactService;
  private cascadeService: CascadeService;

  constructor(config: PostCheckoutOrchestratorConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      draftPRService: config.draftPRService,
      artifactService: config.artifactService,
    } as Required<PostCheckoutOrchestratorConfig>;

    this.detector = new PostCheckoutDetector({
      gitRoot: this.config.baseDir,
    });

    // Initialize ArtifactService (or use injected one)
    this.artifactService = config.artifactService ?? new ArtifactService();

    // Initialize CascadeService with the same ArtifactService
    this.cascadeService = new CascadeService({
      artifactService: this.artifactService,
    });
  }

  /**
   * Execute post-checkout hook workflow
   *
   * @param previousHead - SHA of previous HEAD
   * @param newHead - SHA of new HEAD
   * @param branchFlag - 1 for branch checkout, 0 for file checkout
   * @returns Orchestration result with success status and details
   *
   * @example
   * ```typescript
   * // New branch creation for C.1.2
   * const result = await orchestrator.execute('abc123', 'abc123', 1);
   * // result.success = true
   * // result.artifactsTransitioned = ['C.1.2']
   * // result.parentsCascaded = ['C.1']
   *
   * // File checkout (not branch)
   * const result = await orchestrator.execute('abc123', 'def456', 0);
   * // result.success = false
   * // result.reason = "File checkout (not branch)"
   * ```
   */
  async execute(
    previousHead: string,
    newHead: string,
    branchFlag: number,
  ): Promise<PostCheckoutOrchestratorResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Step 1: Detect if we should execute
      const detection = await this.detector.detectCheckout(
        previousHead,
        newHead,
        branchFlag,
      );

      if (!detection.shouldExecute || !detection.metadata) {
        return {
          success: false,
          reason: detection.reason,
          errors: [],
          warnings: [],
        };
      }

      const { branchName, artifactIds, isNewBranch } = detection.metadata;
      const artifactsTransitioned: string[] = [];
      const parentsCascaded: string[] = [];
      let prUrl: string | undefined;

      // Step 2: Transition artifacts to in_progress
      for (const artifactId of artifactIds) {
        try {
          await this.transitionToInProgress(artifactId);
          artifactsTransitioned.push(artifactId);
        } catch (error) {
          const message = `Failed to transition ${artifactId}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(message);
          console.error(message);
        }
      }

      // Step 3: Execute progress cascade for each artifact
      if (this.config.enableCascade && artifactsTransitioned.length > 0) {
        for (const artifactId of artifactsTransitioned) {
          try {
            const cascadeResult =
              await this.cascadeService.executeProgressCascade({
                artifactId,
                trigger: "branch_created",
                actor: "Git Hook (hook@post-checkout)",
                baseDir: this.config.baseDir,
              });

            // Track which parents were updated
            for (const event of cascadeResult.events) {
              if (
                event.event === "in_progress" &&
                !parentsCascaded.includes(event.artifactId)
              ) {
                parentsCascaded.push(event.artifactId);
              }
            }

            // Log cascade results
            if (cascadeResult.updatedArtifacts.length > 0) {
              console.log(
                `Progress cascade: ${artifactId} → ${parentsCascaded.join(", ")}`,
              );
            }
          } catch (error) {
            const message = `Cascade failed for ${artifactId}: ${error instanceof Error ? error.message : String(error)}`;
            warnings.push(message);
            console.warn(message);
            // Don't fail the hook for cascade errors
          }
        }
      }

      // Step 4: Create draft PR
      if (this.config.enableDraftPR && this.config.draftPRService) {
        try {
          const result = await this.config.draftPRService.createDraftPR({
            branchName,
            artifactIds,
          });
          prUrl = result.url;
          console.log(`Draft PR created: ${prUrl}`);
        } catch (error) {
          const message = `PR creation failed: ${error instanceof Error ? error.message : String(error)}`;
          warnings.push(message);
          console.warn(message);
          // Don't fail the hook for PR creation errors
        }
      }

      // Determine overall success
      const success = artifactsTransitioned.length > 0 || prUrl !== undefined;

      return {
        success,
        branchName,
        artifactIds,
        isNewBranch,
        artifactsTransitioned,
        parentsCascaded,
        prUrl,
        errors,
        warnings,
      };
    } catch (error) {
      const message = `Orchestration failed: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
      console.error(message);

      return {
        success: false,
        reason: message,
        errors,
        warnings,
      };
    }
  }

  /**
   * Transition artifact to in_progress state
   *
   * @param artifactId - The artifact ID to transition
   * @throws Error if transition fails
   */
  private async transitionToInProgress(artifactId: string): Promise<void> {
    // Find the slug for this artifact
    const slug = await this.findArtifactSlug(artifactId);

    // Load artifact
    const artifact = await this.artifactService.getArtifact({
      id: artifactId,
      slug,
      baseDir: this.config.baseDir,
    });

    // Get current state
    const currentState = this.getCurrentState(artifact);

    // Check if already in_progress (idempotency)
    if (currentState === "in_progress") {
      console.log(
        `Artifact ${artifactId} already in_progress, skipping transition`,
      );
      return;
    }

    // Check if artifact is in a valid state to transition
    // Valid states: draft, ready
    if (currentState !== "draft" && currentState !== "ready") {
      throw new Error(
        `Cannot transition ${artifactId} from ${currentState} to in_progress`,
      );
    }

    // Get actor information from git config
    const actor = await this.getGitActor();

    // Add in_progress event
    const event = {
      event: "in_progress" as const,
      timestamp: new Date().toISOString(),
      actor,
      trigger: "branch_created",
    };

    // Append event using ArtifactService
    await this.artifactService.appendEvent({
      id: artifactId,
      slug,
      event,
      baseDir: this.config.baseDir,
    });

    console.log(`Artifact ${artifactId} transitioned to in_progress`);
  }

  /**
   * Find slug for an artifact by searching the artifacts directory
   *
   * @param artifactId - The artifact ID
   * @returns The slug or undefined if not found
   */
  private async findArtifactSlug(
    artifactId: string,
  ): Promise<string | undefined> {
    const artifactsRoot = `${this.config.baseDir}/.kodebase/artifacts`;
    const allPaths = await loadAllArtifactPaths(artifactsRoot);

    // Find the path for the artifact
    const artifactPath = allPaths.find((p) => {
      const id = getArtifactIdFromPath(p);
      return id === artifactId;
    });

    if (!artifactPath) {
      return undefined;
    }

    // Extract slug from path
    // Initiative/Milestone: /base/.kodebase/artifacts/A.slug/A.1.yml (directory name)
    // Issue: /base/.kodebase/artifacts/A.slug/A.1.slug/A.1.2.slug.yml (file name)
    const pathParts = artifactPath.split("/");
    const fileName = pathParts[pathParts.length - 1]; // Get file name
    const dirName = pathParts[pathParts.length - 2]; // Get directory name

    // Try directory name first (initiative/milestone)
    if (dirName?.startsWith(`${artifactId}.`)) {
      return dirName.substring(artifactId.length + 1);
    }

    // Try file name (issue level) - format: ID.slug.yml
    if (fileName?.startsWith(`${artifactId}.`) && fileName.endsWith(".yml")) {
      const withoutExtension = fileName.slice(0, -4); // Remove .yml
      return withoutExtension.substring(artifactId.length + 1);
    }

    return undefined;
  }

  /**
   * Get git actor information from git config
   *
   * @returns Actor string in format "Name (email)"
   */
  private async getGitActor(): Promise<string> {
    try {
      const { stdout: name } = await execAsync("git config user.name", {
        cwd: this.config.baseDir,
      });
      const { stdout: email } = await execAsync("git config user.email", {
        cwd: this.config.baseDir,
      });

      const trimmedName = name.trim();
      const trimmedEmail = email.trim();

      if (!trimmedName || !trimmedEmail) {
        return "Git Hook (hook@post-checkout)";
      }

      return `${trimmedName} (${trimmedEmail})`;
    } catch {
      // If git config fails, use default actor
      return "Git Hook (hook@post-checkout)";
    }
  }

  /**
   * Get current state from artifact's event history
   *
   * @param artifact - The artifact to check
   * @returns Current state or null if no events
   */
  private getCurrentState(artifact: {
    metadata: { events: Array<{ event: string }> };
  }): string | null {
    const events = artifact.metadata.events;
    if (!events || events.length === 0) {
      return null;
    }
    const lastEvent = events[events.length - 1];
    return lastEvent?.event ?? null;
  }
}
