# @kodebase/git-ops

## 0.7.1

### Patch Changes

- [#180](https://github.com/kodebaseai/kodebase/pull/180) [`e324343`](https://github.com/kodebaseai/kodebase/commit/e3243435f2c8380081088c97c4cc46fc0bc9427e) Thanks [@migcarva](https://github.com/migcarva)! - Scaffold shared test infrastructure package `@kodebase/test-utils` with core fakes and helpers:

  - Add FakeGitAdapter (in-memory Git adapter)
  - Add FakeClock utility
  - Add ConfigBuilder for YAML config scaffolding
  - Add memfs wrapper for consistent fs mocking in tests

  Adopt in two packages:

  - @kodebase/git-ops: use FakeGitAdapter from `@kodebase/test-utils` in contract tests
  - @kodebase/artifacts: replace inline memfs mocking with `mockFsPromises` helper

- Updated dependencies [[`e324343`](https://github.com/kodebaseai/kodebase/commit/e3243435f2c8380081088c97c4cc46fc0bc9427e)]:
  - @kodebase/artifacts@1.1.2

## 0.7.0

### Minor Changes

- [#174](https://github.com/kodebaseai/kodebase/pull/174) [`4f29cee`](https://github.com/kodebaseai/kodebase/commit/4f29cee48b9f933b0a7709c01b87c6473f4fed0c) Thanks [@migcarva](https://github.com/migcarva)! - feat(git-ops): complete impact analysis system for destructive operations

  Implements comprehensive impact analysis engine for cancellation, deletion, and dependency removal operations:

  **Core Impact Analysis Engine (C.8.1)**

  - ImpactAnalyzer class with operation-specific analyzers
  - Graph traversal using DependencyGraphService and QueryService
  - Cancellation impact: parent completion effects, dependency unblocking
  - Deletion impact: orphaned dependents (fully/partially), broken parents, affected siblings
  - Remove dependency impact: readiness cascade effects
  - Performance: 1,110 artifacts analyzed in 330ms (<1s requirement)

  **Cancellation Impact Analysis (C.8.2)**

  - analyzeCancellation() with specialized CancellationImpactReport
  - Detects parent completion state changes (cancelled siblings count as done)
  - Identifies dependents that become unblocked
  - 19 tests with 100% coverage

  **Deletion Impact Analysis (C.8.3)**

  - analyzeDeletion() with specialized DeletionImpactReport
  - Identifies fully/partially orphaned dependents
  - Detects broken parent references
  - Analyzes affected siblings (can help complete vs. blocking)
  - 24 tests with 100% coverage

  **CLI Output Formatting (C.8.4)**

  - ImpactReportFormatter class with format(report, operation) method
  - ANSI color-coded output: red (errors), yellow (warnings), green (safe)
  - Specialized formatters for each report type with tailored symbols (✓ ⚠️ ✗ ℹ •)
  - JSON output mode for programmatic consumption
  - Verbose mode for detailed debugging
  - noColor option for CI/automation environments
  - 16 tests with 88.05% statement coverage, 84.21% branch coverage

  **Integration Tests (C.8.5)**

  - 21 E2E integration tests with complex artifact graph
  - 12+ artifacts across 2 initiatives, 3 milestones, 9 issues
  - Tests cover all report types and output formats
  - Multi-level cascade scenarios spanning multiple artifact levels
  - 95.2% statement coverage, 85.52% branch coverage, 100% function coverage

  **Exported Public API**

  - ImpactAnalyzer: Core analysis engine
  - ImpactReportFormatter: CLI and JSON output formatting
  - Type exports: ImpactReport, CancellationImpactReport, DeletionImpactReport, ImpactOperation, ImpactedArtifact
  - FormatOptions: Configuration for output formatting

  **Testing & Quality**

  - 107 tests passing across all modules
  - 95.2% overall statement coverage (exceeds ≥85% requirement)
  - Type-safe operation-specific reports
  - Memory-efficient graph traversal with caching

  Resolves C.8 milestone - Impact Analysis System

## 0.6.0

### Minor Changes

- [#168](https://github.com/kodebaseai/kodebase/pull/168) [`9fff1ad`](https://github.com/kodebaseai/kodebase/commit/9fff1ada29df2b35c140e8957bf039d6ce27a536) Thanks [@migcarva](https://github.com/migcarva)! - Add validation hooks for pre-commit and pre-push with E2E testing

  Implemented comprehensive validation hooks system for git operations:

  **Pre-Commit Validation (Blocking):**

  - validatePreCommit() function blocking commits with validation errors
  - Schema validation via ValidationService integration
  - Orphaned dependency detection (non-existent artifact references)
  - Circular dependency and relationship consistency checks
  - Clear error messages with field paths and suggested fixes

  **Pre-Push Validation (Non-Blocking Warnings):**

  - validatePrePush() function with non-blocking warnings
  - Warns about uncommitted changes in .kodebase/artifacts/
  - Warns about artifacts in draft or blocked states
  - Actionable warning messages with remediation guidance

  **E2E Testing:**

  - 11 comprehensive E2E tests using real temporary git repositories
  - Zero mocking - uses actual git operations and artifact files
  - Tests cover all acceptance criteria with 93.34% line coverage
  - Deterministic isolation via temporary directory creation/cleanup

  **API Exports:**

  - validatePreCommit(), validatePrePush() functions
  - PreCommitError, PreCommitValidationResult types
  - PrePushWarning, PrePushValidationResult types
  - Full TypeScript type definitions

  All 421 tests passing with 93.34% line coverage (exceeds 85% requirement).

### Patch Changes

- Updated dependencies [[`38f531e`](https://github.com/kodebaseai/kodebase/commit/38f531e11e9ba887b5a3a75bfb3a88874d415a43)]:
  - @kodebase/artifacts@1.1.1

## 0.5.0

### Minor Changes

- [#161](https://github.com/kodebaseai/kodebase/pull/161) [`acb8c25`](https://github.com/kodebaseai/kodebase/commit/acb8c25c2552f6461ff9681b756b2090d9d9f148) Thanks [@migcarva](https://github.com/migcarva)! - Post-Checkout Hook Implementation (C.6)

  Complete post-checkout hook workflow with progress cascade execution, draft PR creation, and comprehensive integration testing.

  **New Features:**

  - **PostCheckoutDetector**: Branch checkout detection with file vs branch differentiation and artifact ID extraction from branch names (18 tests)
  - **BranchValidator**: Artifact ID pattern matching supporting single/multiple IDs and nested patterns like C.1.2.3 (15 tests)
  - **PostCheckoutOrchestrator**: Progress cascade execution (first child starts → parent in_progress) with idempotency checks and optional draft PR creation (14 tests)
  - **DraftPRService**: GitHub PR creation with artifact metadata enrichment, configurable target branch, and error handling (20 tests)
  - **Integration Tests**: 10 E2E scenarios using real git repositories validating progress cascade, nested hierarchy, branch validation, idempotency, and error handling (496 lines)

  **Implementation Details:**

  - Non-blocking execution - hooks never block git operations, all errors handled gracefully
  - Artifact ID extraction supports nested patterns (A.1.2) and multiple IDs per branch (A.1-A.2)
  - Progress cascade with idempotency - only transitions from draft/ready to in_progress
  - Slug extraction for all three artifact levels: directory-based (initiatives/milestones) and file-based (issues)
  - Draft PR creation with proper title formatting and acceptance criteria in body
  - Integration with CascadeService (C.1) for progress cascade workflow

  **Test Coverage:**

  - 92.53% overall coverage (exceeds 90% requirement)
  - 361 total tests passing in main suite
  - Orchestrator and integration tests excluded due to Zod registry conflict (validated via type checking)

  **Breaking Changes:** None

  **Migration Notes:**

  This release adds the post-checkout hook components but does not include CLI integration or actual hook installation. That functionality will be added in C.7 (Validation Hooks).

  **Related Issues:**

  - C.6.1: Post-Checkout Hook Trigger & Branch Detection
  - C.6.2: Branch Name Validation & Artifact Extraction
  - C.6.3: Draft PR Creation
  - C.6.4: Progress Cascade Execution
  - C.6.5: Integration Tests

  **Documentation:**

  - See `.kodebase/docs/specs/git-ops/git-hooks.md` for hook specifications
  - See `.kodebase/docs/specs/git-ops/cascade-system.md` for cascade workflows
  - See `.kodebase/docs/spikes/zod-global-registry-test-conflicts.md` for Zod registry issue details

## 0.4.0

### Minor Changes

- [#153](https://github.com/kodebaseai/kodebase/pull/153) [`ad4926f`](https://github.com/kodebaseai/kodebase/commit/ad4926f859125f5bdd5cab431195c4b02fe663f9) Thanks [@migcarva](https://github.com/migcarva)! - feat(git-ops): complete post-merge hook workflow automation

  Implements complete post-merge hook workflow with cascade execution and configurable strategies:

  **Post-Merge Detection (C.5.1)**

  - PR merge detection with artifact ID extraction from branch names
  - Support for nested artifact IDs (e.g., C.4.1.2)
  - Merge metadata collection (PR number, branch, commit SHA)
  - Configurable target branch and requirePR validation

  **Cascade Orchestration (C.5.2)**

  - Completion cascade: siblings done → parent in_review
  - Readiness cascade: blocker done → dependents ready
  - Integration with CascadeService for state transitions
  - Graceful error handling per artifact

  **Strategy Execution (C.5.3)**

  - `cascade_pr`: Automatic PR creation with cascade changes
  - `direct_commit`: Direct push to main branch
  - `manual`: Log-only mode for manual application
  - Configuration via @kodebase/config with sensible defaults

  **Cascade Commits (C.5.4)**

  - Agent attribution per ADR-006
  - Formatted commit messages with affected artifacts
  - Co-Authored-By headers for human actors
  - Command injection prevention via JSON.stringify()

  **Integration Tests (C.5.5)**

  - 8 integration tests for workflow validation
  - API contract testing between components
  - Error handling and idempotency verification
  - Configuration loading validation

  **Testing & Quality**

  - 304 tests passing (3 skipped edge cases)
  - > 80% coverage across all components
  - Non-blocking execution ensuring git operations never blocked
  - Production-ready with comprehensive error handling

  Resolves C.5 milestone - Post-Merge Hook Implementation

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
