/**
 * Git platform constants and type definitions
 */

import { CGitPlatform, type TGitPlatform } from "@kodebase/core";

/**
 * Supported git platforms (re-exported from @kodebase/core)
 */
export { CGitPlatform, type TGitPlatform };

/**
 * Pull request merge methods
 */
export const CMergeMethod = {
  MERGE: "merge",
  SQUASH: "squash",
  REBASE: "rebase",
} as const;

export type TMergeMethod = (typeof CMergeMethod)[keyof typeof CMergeMethod];

/**
 * Pull request states
 */
export const CPRState = {
  OPEN: "open",
  CLOSED: "closed",
  MERGED: "merged",
} as const;

export type TPRState = (typeof CPRState)[keyof typeof CPRState];

/**
 * Review status for pull requests
 */
export const CReviewStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  COMMENTED: "commented",
  REVIEW_REQUIRED: "review_required",
} as const;

export type TReviewStatus = (typeof CReviewStatus)[keyof typeof CReviewStatus];
