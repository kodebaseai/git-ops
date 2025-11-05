/**
 * Type definitions for @kodebase/git-ops
 */

export type {
  AuthStatus,
  Branch,
  GitPlatformAdapter,
  PRCreateOptions,
  PRInfo,
} from "./adapter.js";

export {
  CGitPlatform,
  CMergeMethod,
  CPRState,
  CReviewStatus,
  type TGitPlatform,
  type TMergeMethod,
  type TPRState,
  type TReviewStatus,
} from "./constants.js";
