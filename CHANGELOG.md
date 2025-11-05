# @kodebase/git-ops

## 0.3.0

### Minor Changes

- [#146](https://github.com/kodebaseai/kodebase/pull/146) [`de47f61`](https://github.com/kodebaseai/kodebase/commit/de47f611d77c80e19351b5d3313c028f6bc27ef6) Thanks [@migcarva](https://github.com/migcarva)! - Core Hook System (C.4 Milestone) - Production-ready hook execution framework

  ## What's New

  Complete hook system implementation with execution framework, idempotency tracking, structured logging, and comprehensive testing.

  ### Hook Execution Framework (C.4.1)

  - **HookExecutor** with lifecycle callbacks (beforeExecute, afterExecute, onError)
  - Non-blocking execution mode - hooks never block git operations
  - Timeout support with configurable duration (default 30s)
  - Graceful error handling with stdout/stderr capture
  - Factory functions: `createHookExecutor()`, `createHookExecutorForType()`, `isHookEnabled()`

  ### Idempotency System (C.4.2)

  - **IdempotencyTracker** using event log inspection
  - Prevents duplicate hook executions based on artifact event history
  - Configurable retry logic for failed hooks (default 5min timeout)
  - Status tracking (success/failed) with metadata support
  - Event-based approach enables distributed idempotency

  ### Hook Installation (C.4.3)

  - **HookInstaller** with install/uninstall utilities
  - Automatic backup/restore mechanism for existing hooks
  - Force overwrite option with `.kodebase-backup` suffix
  - Hook detection and validation
  - Safe uninstallation with backup restoration

  ### Structured Logging & Monitoring (C.4.4)

  - **HookLogger** with structured JSON logging
  - Log levels: debug, info, warn, error with priority-based filtering
  - File-based logging with automatic rotation (max size/files configurable)
  - Environment variable configuration via `KODEBASE_LOG_LEVEL`
  - Performance metrics with sub-millisecond precision using `performance.now()`
  - Optional integration - backwards compatible with console fallback

  ### Integration Tests (C.4.5)

  - 14 comprehensive E2E integration tests
  - Complete workflow validation: install → execute → log → uninstall
  - Component integration tests for HookInstaller + HookExecutor + HookLogger + IdempotencyTracker
  - Parallel execution testing
  - Backup/restore workflow validation

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
