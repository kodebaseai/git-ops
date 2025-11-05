# @kodebase/git-ops

## 0.2.0

### Minor Changes

- [#138](https://github.com/kodebaseai/kodebase/pull/138) [`d0da952`](https://github.com/kodebaseai/kodebase/commit/d0da952d090ae12d3f1f2656db319e77f58e9d75) Thanks [@migcarva](https://github.com/migcarva)! - C.3: Git platform abstraction layer with GitHub adapter

  **Platform Abstraction**

  - GitPlatformAdapter interface defining platform-agnostic operations (C.3.1)
  - Factory pattern via createAdapter(config) with platform selection and auth strategies
  - Support for GitHub, GitLab (stub), and future Bitbucket platforms

  **GitHub Adapter (C.3.2, C.3.3)**

  - Full PR lifecycle: create, draft, ready, merge, auto-merge, status tracking
  - Authentication validation with token + gh CLI fallback strategy
  - PR operations: createPR(), createDraftPR(), getPR(), mergePR(), enableAutoMerge()
  - Branch detection and validation ensuring correct base/head branches
  - GitHub Enterprise support via configurable API URLs
  - Comprehensive error messages for auth failures, API errors, merge conflicts

  **GitLab Adapter (C.3.4)**

  - Stub implementation with clear error messages guiding v1.1 implementation
  - Platform interface compliance for future GitLab support

  **Configuration Integration (C.3.6)**

  - createAdapter(config) factory consuming @kodebase/config
  - getPRCreationDefaults() extracting PR templates, auto-assign, labels, reviewers
  - getMergeDefaults() extracting auto-merge, branch deletion, CI checks settings
  - Auth strategy configuration: auto (token → CLI fallback), token-only, CLI-only
  - Custom token env vars and API URLs for enterprise deployments

  **Testing (C.3.5)**

  - 99 total tests with 91.16% coverage
  - 21 integration tests validating E2E workflows
  - Error handling tests for expired tokens, conflicts, API failures
  - Platform selection logic tests
  - Coverage breakdown: github.ts (88.13%), factory.ts (97.29%), gitlab.ts (100%)

### Patch Changes

- [#130](https://github.com/kodebaseai/kodebase/pull/130) [`56a3e2e`](https://github.com/kodebaseai/kodebase/commit/56a3e2eceef00cf3d058717c13ebc177dca0dbf2) Thanks [@migcarva](https://github.com/migcarva)! - Add GitPlatformAdapter interface and align platform types

  **@kodebase/git-ops (NEW PACKAGE)**

  - Add GitPlatformAdapter interface with 11 methods for PR operations, auth validation, and branch management
  - Add core types: PRCreateOptions, PRInfo, Branch, AuthStatus
  - Add platform constants: CGitPlatform, CMergeMethod, CPRState, CReviewStatus
  - Comprehensive JSDoc documentation with examples for all methods
  - Support for GitHub, GitLab, and Bitbucket platforms
  - 8 passing tests validating interface implementability

  **@kodebase/config**

  - Add dependency on @kodebase/git-ops
  - Import TGitPlatform from git-ops as canonical platform type
  - Deprecate PlatformType in favor of TGitPlatform
  - Re-export TGitPlatform for convenience

- Updated dependencies [[`56a3e2e`](https://github.com/kodebaseai/kodebase/commit/56a3e2eceef00cf3d058717c13ebc177dca0dbf2)]:
  - @kodebase/config@0.2.1
