/**
 * @kodebase/git-ops
 *
 * Git platform abstraction for GitHub, GitLab, and Bitbucket operations
 */

export { GitHubAdapter, type GitHubAdapterConfig } from "./adapters/github.js";
export type {
  AuthStatus,
  Branch,
  GitPlatformAdapter,
  PRCreateOptions,
  PRInfo,
  TGitPlatform,
  TMergeMethod,
  TPRState,
  TReviewStatus,
} from "./types/index.js";
export {
  CGitPlatform,
  CMergeMethod,
  CPRState,
  CReviewStatus,
} from "./types/index.js";
