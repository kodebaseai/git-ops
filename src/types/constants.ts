/**
 * Git platform constants and type definitions
 */

/**
 * Supported git platforms
 */
export const CGitPlatform = {
  GITHUB: "github",
  GITLAB: "gitlab",
  BITBUCKET: "bitbucket",
} as const;

export type TGitPlatform = (typeof CGitPlatform)[keyof typeof CGitPlatform];

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
