/**
 * Types for post-merge strategy execution
 */

import type { PostMergeStrategy } from "@kodebase/config";
import type { OrchestrationResult } from "./post-merge-orchestrator-types.js";

/**
 * Configuration for strategy executor
 */
export interface StrategyExecutorConfig {
  /** Git root directory */
  gitRoot?: string;
  /** Repository path for git operations */
  repoPath?: string;
}

/**
 * Options for executing a post-merge strategy
 */
export interface ExecuteStrategyOptions {
  /** Strategy to execute */
  strategy: PostMergeStrategy;
  /** Orchestration results from cascades */
  cascadeResults: OrchestrationResult;
  /** Actor for git operations (defaults to 'Kodebase GitOps') */
  actor?: string;
}

/**
 * Result of executing a post-merge strategy
 */
export interface StrategyExecutionResult {
  /** Strategy that was executed */
  strategy: PostMergeStrategy;
  /** Whether the strategy was executed successfully */
  success: boolean;
  /** Human-readable message about the execution */
  message: string;
  /** PR information if strategy created a PR */
  prInfo?: {
    number: number;
    url: string;
    autoMerged?: boolean;
  };
  /** Commit information if strategy created a commit */
  commitInfo?: {
    sha: string;
    message: string;
    pushed?: boolean;
  };
  /** Error message if execution failed */
  error?: string;
}
