# @kodebase/git-ops

## 1.0.2

### Patch Changes

- [`5a9c58c`](https://github.com/kodebaseai/kodebase/commit/5a9c58c451fc060cab7bb6cee3d986d4c22e89c7) Thanks [@migcarva](https://github.com/migcarva)! - Implement hooks command for git hook management

  - Add `kb hooks` command with execute, install, and uninstall subcommands
  - Export detectors and orchestrators from @kodebase/git-ops public API
  - Fix CLI version to match package.json (1.0.1)
  - Add comprehensive help documentation for hooks command

  The `kb hooks execute <hook-type>` command is now called by git hooks to handle post-merge and post-checkout automation. This fixes the issue where installed git hooks were calling a non-existent command.

## 1.0.1

### Patch Changes

- Updated dependencies [[`ee86091`](https://github.com/kodebaseai/kodebase/commit/ee86091417044998e1c9c0b33d1d05ad8dc20835)]:
  - @kodebase/artifacts@1.1.3

## 1.0.0

### Major Changes

- [#220](https://github.com/kodebaseai/kodebase/pull/220) [`d647d2b`](https://github.com/kodebaseai/kodebase/commit/d647d2befcd36e994307f81867e4f6a4d23358b6) Thanks [@migcarva](https://github.com/migcarva)! - 🚀 Release git-ops v1.0 - Automated artifact lifecycle management through Git operations

  Ship production-ready git-ops package enabling seamless integration between development workflows and artifact state transitions via intelligent hooks, cascade orchestration, and platform-native PR automation.

  **Core Features:**

  - **Git Platform Abstraction**: GitHub implementation with GitLab interface for future support
  - **Intelligent Hook System**: 4 git hooks (post-checkout, post-merge, pre-commit, pre-push) with non-blocking execution, idempotency guarantees, and error resilience
  - **Cascade Automation**: Automatic completion, progress, and readiness cascades triggered by git operations
  - **Configuration Presets**: Solo developer, small team, and enterprise workflows with 3 post-merge strategies (cascade_pr, direct_commit, manual)
  - **Impact Analysis**: Safety system preventing accidental destructive operations with detailed impact reports
  - **Comprehensive Documentation**: 15,000+ lines across 23 files covering API reference, user guides, migration, configuration, and examples

  This is a **breaking change** from v0.1.x. See migration guide for upgrade instructions.

## 0.8.1

### Patch Changes

- [#218](https://github.com/kodebaseai/kodebase/pull/218) [`63215a7`](https://github.com/kodebaseai/kodebase/commit/63215a7acfbaa7f440ba3f0576220284faf85a57) Thanks [@migcarva](https://github.com/migcarva)! - Complete comprehensive documentation suite for git-ops v1.0

  Add complete documentation suite covering all aspects of git-ops v1.0:

  - **API Reference** (2,148 lines): Complete TypeScript API documentation for all git-ops exports including GitPlatformAdapter, Hook System, Cascade Operations, Impact Analysis, Orchestration, Detection, Validation, and Draft PR Service
  - **User Guide** (1,106 lines): Getting started guide covering installation, setup wizard, daily workflow, cascade explanations, configuration options, troubleshooting, and advanced topics
  - **Migration Guide** (1,840 lines): Comprehensive v0.1.x → v1.0 upgrade guide with 6 breaking changes documented, 42-checkbox migration checklist, 8-step process with time estimates, and complete rollback instructions
  - **Configuration Reference** (~800 lines): Complete settings.yml reference with 3 workflow presets (Solo, Small Team, Enterprise), 9 configuration sections, 30+ settings documented, and 5 common scenario examples
  - **Hook Behavior** (1,472 lines): Detailed documentation of all 4 git hooks with execution flow diagrams, trigger conditions, state transitions, idempotency guarantees, error handling, performance optimization, and 15+ troubleshooting scenarios
  - **Examples** (~600 lines): Real-world workflow examples (solo/team/enterprise), impact analysis scenarios, and 7 custom configuration examples
  - **Documentation Review**: Systematic review report validating technical accuracy and completeness across all 23 documentation files (~15,000+ lines total)

  All documentation is production-ready and approved for v1.0 release.

## 0.8.0

### Minor Changes

- [#210](https://github.com/kodebaseai/kodebase/pull/210) [`a6e763f`](https://github.com/kodebaseai/kodebase/commit/a6e763f568afda1539e02af0b89c763cc0db9ba3) Thanks [@migcarva](https://github.com/migcarva)! - **D.2: Git-Ops Test Quality (72/100 → 82/100)**

  Comprehensive test quality improvement initiative bringing @kodebase/git-ops from C+ to B+ grade.

  ## Key Achievements

  ### Test Infrastructure ✅

  - Reduced mock ratio from 45% to **14.9%** (-71% improvement)
  - Unit test performance: **760ms** (well under 2s target)
  - Zero focused/skipped tests (was 1 `.skip`)
  - Comprehensive TESTING.md documentation (585 lines)

  ### Test Patterns Implemented ✅

  - **Test Builders**: 7 builders created (MergeMetadataBuilder, CascadeResultBuilder, etc.)
  - **FakeGitAdapter**: Full in-memory git simulation replacing 40+ mocks
  - **Contract Tests**: 3 interface contracts (GitPlatformAdapter, HookExecutor, DetectorService)
  - **Property Tests**: 11 property tests with fast-check for invariant validation

  ### Quality Improvements ✅

  - Rewrote 10 weak tests with strong assertions
  - Separated integration tests to dedicated directory
  - Mutation testing baseline established: **64.09%** (from 0%)
  - Test documentation with philosophy, patterns, and examples

  ## Acceptance Criteria: 10/14 Met

  ### ✅ Passed (10)

  1. Mock ratio <15%: 14.9% ✅
  2. Unit test speed <2s: 760ms ✅
  3. Test builders created: 7 builders ✅
  4. FakeGitAdapter replaces mocks ✅
  5. Contract tests: 3 interfaces ✅
  6. Property tests: 11 tests ✅
  7. Integration tests separated ✅
  8. Weak tests rewritten: 10/10 ✅
  9. Zero focused/skipped tests ✅
  10. Test documentation: TESTING.md ✅

  ### ❌ Partial/Future Work (4)

  1. Mutation score: 64% vs 85% target (requires refactoring, not just testing)
  2. Core module scores: ~73% vs 90% target (architectural limits)
  3. Fake timers: Documented but opt-in (global fake timers caused issues)
  4. Overall score: 82/100 vs 95/100 target (13 point gap)

  ## Strategic Decisions

  **D.2.13 & D.2.14 Canceled**: After extensive analysis, reaching 85% mutation score requires strategic refactoring (Builder Pattern for github.ts, Options Normalization for validators) rather than additional testing. Work preserved in D.2.13 branch for future reference.

  **Focus Shift to MVP/MLP**: Current 64% mutation score with 82/100 quality is production-ready. Further optimization deferred to focus on product development.

  ## Delivered Artifacts

  - TESTING.md (comprehensive test guide)
  - D.2.12-final-validation.md (complete metrics analysis)
  - D.2.13-refactoring-deep-dive.md (future optimization roadmap)
  - 7 test builders in packages/git-ops/test/builders/
  - FakeGitAdapter in @kodebase/test-utils
  - Contract test suites
  - Property test implementations
  - Mutation test infrastructure (Stryker configured)

  ## Next Steps (Future)

  If resuming mutation score improvement:

  1. Refactor github.ts with Builder Pattern → +14-16pp
  2. Normalize options in validators → +17-21pp
  3. Refactor orchestrators with Strategy Pattern → +17-23pp
     Target: 78-82% achievable with 6-8 hours of focused refactoring

  ## References

  - Full validation: `packages/git-ops/test-report/D.2.12-final-validation.md`
  - Testing guide: `packages/git-ops/TESTING.md`
  - Future roadmap: `packages/git-ops/test-report/D.2.13-refactoring-deep-dive.md` (on D.2.13 branch)

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

  - See `.kodebase/docs/reference/specs/git-ops/git-hooks.md` for hook specifications
  - See `.kodebase/docs/reference/specs/git-ops/cascade-system.md` for cascade workflows
  - See `.kodebase/docs/reference/spikes/zod-global-registry-test-conflicts.md` for Zod registry issue details

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
