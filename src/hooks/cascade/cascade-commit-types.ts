/**
 * Types for cascade commit creation with agent attribution
 */

import type { OrchestrationResult } from "../orchestration/post-merge-orchestrator-types.js";

/**
 * Agent attribution metadata per ADR-006
 */
export interface CascadeCommitAttribution {
  /** Agent name (e.g., 'Kodebase GitOps', 'Claude Agent') */
  agentName: string;
  /** Agent version (e.g., 'v1.0.0', 'claude-sonnet-4') */
  agentVersion: string;
  /** Trigger event that initiated the cascade (e.g., 'post-merge', 'pr_merged') */
  triggerEvent: string;
  /** Optional PR number that triggered the cascade */
  prNumber?: number;
  /** Optional human actor email (for Co-Authored-By) */
  humanActor?: string;
}

/**
 * Options for creating a cascade commit
 */
export interface CreateCascadeCommitOptions {
  /** Orchestration results containing cascade changes */
  cascadeResults: OrchestrationResult;
  /** Attribution metadata for the commit */
  attribution: CascadeCommitAttribution;
  /** Git root directory */
  gitRoot?: string;
  /** Git author name (defaults to attribution.agentName) */
  authorName?: string;
  /** Git author email (defaults to noreply@kodebase.ai) */
  authorEmail?: string;
}

/**
 * Result of creating a cascade commit
 */
export interface CreateCascadeCommitResult {
  /** Whether the commit was created successfully */
  success: boolean;
  /** Commit SHA if successful */
  commitSha?: string;
  /** Commit message that was used */
  message?: string;
  /** Number of files staged and committed */
  filesChanged?: number;
  /** Error message if commit failed */
  error?: string;
}
