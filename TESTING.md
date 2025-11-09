# Testing Guide for @kodebase/git-ops

## Philosophy

Our testing approach prioritizes **behavioral correctness** over implementation coverage. We aim for:

1. **High Signal-to-Noise Ratio**: Tests should catch real bugs, not implementation changes
2. **Minimal Mocking**: Test against real interfaces when possible, use fakes over mocks
3. **Fast Feedback**: Unit tests run in <2s, mutation testing validates test quality
4. **Maintainability**: Tests should be easy to understand and modify

### Key Metrics

- **Mock Ratio**: <15% (currently ~14.9%)
- **Mutation Score**: Target 85%+ (core modules 90%+), currently 64.09%
- **Unit Test Speed**: <2s (currently 760ms)
- **Assertion Density**: ~2.0 assertions/test

## Test Types & Structure

### 1. Unit Tests (`.unit.test.ts`)

**Purpose**: Test business logic in isolation from I/O operations.

**Characteristics**:
- No real file system, network, or git operations
- Use fakes (FakeGitAdapter) instead of mocks
- Fast (<2s for entire suite)
- Focus on state transitions and invariants

**Example**: [branch-validator.unit.test.ts](src/hooks/validation/branch-validator.unit.test.ts#L40-L50)

```typescript
it("extracts the first artifact ID from complex branch names", () => {
  const validator = new BranchValidator({ baseDir: "/tmp" });

  expect(validator.extractArtifactId("feature/C.1.2-description")).toBe("C.1.2");
  expect(validator.extractArtifactId("main")).toBeNull();
});
```

**Why this is good**:
- Tests public API, not implementation
- No mocks needed
- Clear input → output
- Multiple assertions verify edge cases

### 2. Integration Tests (`.test.ts`)

**Purpose**: Verify component interactions with real dependencies.

**Characteristics**:
- May use real git commands or file system
- Slower execution time
- Test end-to-end workflows
- Should be migrated to `test/e2e/` directory (work in progress)

**Example**: [hook-installer.integration.test.ts](src/hooks/core/hook-installer.integration.test.ts)

### 3. Contract Tests (`.contract.test.ts`)

**Purpose**: Ensure implementations adhere to interface contracts.

**Location**: `__contracts__/` directories

**Example**: [git-platform-adapter.contract.test.ts](src/adapters/__contracts__/git-platform-adapter.contract.test.ts)

```typescript
describe("GitPlatformAdapter contract", () => {
  describe("Authentication", () => {
    it("returns status with platform identifier", async () => {
      const adapter = new FakeGitAdapter();
      const status = await adapter.validateAuth();

      expect(status.isAuthenticated).toBe(true);
      expect(status.platform).toBe("fake");
    });
  });
});
```

**Benefits**:
- Ensures all adapters (GitHub, GitLab, Fake) behave consistently
- Catches interface violations early
- Self-documenting contract requirements

### 4. Property-Based Tests (`.property.test.ts`)

**Purpose**: Test invariants across many inputs using `fast-check`.

**Example**: [branch-validator.property.test.ts](src/hooks/validation/branch-validator.property.test.ts)

```typescript
import { fc, test } from "@fast-check/vitest";

test.prop({
  artifactIds: fc.array(fc.string(), { minLength: 0, maxLength: 10 })
})("artifact IDs are always sorted and unique", ({ artifactIds }) => {
  const validator = new BranchValidator({ baseDir: "/tmp" });
  const result = validator.normalizeArtifactIds(artifactIds);

  // Invariants
  expect(result).toEqual([...new Set(result)].sort()); // unique & sorted
});
```

**When to use**:
- Pure functions with clear invariants
- Validation logic
- Parsers and formatters
- State machines

## Best Practices

### DO: Test Behavior, Not Implementation

**Good**:
```typescript
it("creates cascade commit when artifacts are updated", async () => {
  const result = await createCascadeCommit({
    cascadeResults: makeCascadeResults({ totalArtifactsUpdated: 2 }),
    attribution: baseAttribution,
  });

  expect(result.success).toBe(true);
  expect(result.commitSha).toBeDefined();
});
```

**Bad**:
```typescript
it("calls execAsync with git commit command", async () => {
  await createCascadeCommit(options);

  expect(execAsync).toHaveBeenCalledWith(
    expect.stringContaining("git commit"),
    expect.any(Object)
  );
});
```

Why the first is better: It tests the **outcome** (commit created), not the **mechanism** (git command called).

### DO: Use Test Builders for Complex Objects

**Example**: [cascade-commit.unit.test.ts](src/hooks/cascade/cascade-commit.unit.test.ts#L32-L64)

```typescript
const makeCascadeResults = (
  overrides: Partial<CreateCascadeCommitOptions["cascadeResults"]> = {},
): CreateCascadeCommitOptions["cascadeResults"] => ({
  mergeMetadata: defaultMergeMetadata,
  completionCascade: { events: [], updatedArtifacts: [] },
  readinessCascade: { events: [], updatedArtifacts: [] },
  totalArtifactsUpdated: 0,
  totalEventsAdded: 0,
  summary: "",
  ...overrides,
});

// Usage
const results = makeCascadeResults({ totalArtifactsUpdated: 2 });
```

**Benefits**:
- Reduces arrange bloat
- Makes tests focus on what's different
- Easy to evolve as types change

### DO: Use Fakes Over Mocks

**Prefer**: FakeGitAdapter (test double with real logic)

```typescript
import { FakeGitAdapter } from "@kodebase/test-utils/fakes";

it("creates PR with correct title", async () => {
  const adapter = new FakeGitAdapter();
  const pr = await adapter.createPR({ title: "Test PR", baseBranch: "main" });

  expect(pr.title).toBe("Test PR");
  expect(pr.number).toBeGreaterThan(0);
});
```

**Avoid**: Excessive mocking of internal methods

```typescript
// Anti-pattern
vi.spyOn(executor as any, "executeWithTimeout");
```

### DO: Write Strong Assertions

**Good**:
```typescript
expect(result.validArtifactIds).toEqual(["C.1.2"]);
expect(result.invalidArtifactIds).toEqual(["Z.9.9"]);
expect(result.allValid).toBe(false);
```

**Weak** (from historical issues):
```typescript
expect(result).toBeDefined();
expect(result.count).toBeGreaterThanOrEqual(0);
```

### DON'T: Mock What You Don't Own

Avoid mocking external libraries directly. Instead, wrap them in your own interfaces.

**Good**:
```typescript
// Wrap Zod in your own validator interface
interface ConfigValidator {
  validate(config: unknown): ValidationResult;
}

// Test against your interface
it("validates configuration", () => {
  const validator = new ZodConfigValidator(schema);
  const result = validator.validate({ foo: "bar" });
  expect(result.isValid).toBe(true);
});
```

### DON'T: Test Private Methods

Test through the public API. If you need to test private logic, consider:
1. Is it complex enough to extract into a separate module?
2. Can you test it indirectly through public methods?

### DON'T: Use `.only` or `.skip` in Committed Code

We have Biome lint rules that prevent this:
- `suspicious/noFocusedTests`: Prevents `.only`
- `suspicious/noSkippedTests`: Prevents `.skip`

## Test Organization

### File Naming

- `*.unit.test.ts` - Pure unit tests (no I/O)
- `*.test.ts` - Integration tests (with I/O)
- `*.contract.test.ts` - Interface contract tests
- `*.property.test.ts` - Property-based tests

### Directory Structure

```
src/
├── hooks/
│   ├── core/
│   │   ├── hook-executor.ts
│   │   ├── hook-executor.test.ts        # Integration tests
│   │   ├── hook-executor.unit.test.ts   # Unit tests
│   │   └── __contracts__/
│   │       └── hook-executor.contract.test.ts
│   └── validation/
│       ├── branch-validator.ts
│       ├── branch-validator.unit.test.ts
│       └── branch-validator.property.test.ts
```

## Running Tests

### All Tests
```bash
pnpm test
```

### Unit Tests Only (fast)
```bash
pnpm vitest run src/**/*.unit.test.ts
```

### Integration Tests
```bash
pnpm test:e2e  # Future: when e2e tests are separated
```

### Contract Tests
```bash
pnpm test:contracts
```

### With Coverage
```bash
pnpm test:coverage
```

### Mutation Testing
```bash
pnpm test:mutation
```

**Note**: Mutation testing validates test quality by introducing code mutations and checking if tests catch them.

## Common Patterns

### Testing Async Operations

```typescript
it("handles async errors gracefully", async () => {
  const adapter = new FakeGitAdapter();
  adapter.simulateError("API unavailable");

  await expect(adapter.createPR(options)).rejects.toThrow("API unavailable");
});
```

### Testing State Machines

```typescript
describe("artifact state transitions", () => {
  it("transitions from draft → ready when dependencies are met", async () => {
    const artifact = createDraftArtifact();

    const result = await orchestrator.checkReadiness(artifact);

    expect(result.events).toContainEqual(
      expect.objectContaining({
        event: "ready",
        trigger: "dependencies_met"
      })
    );
  });
});
```

### Testing Error Conditions

```typescript
it("throws descriptive error for invalid artifact ID", () => {
  const validator = new BranchValidator({ baseDir: "/tmp" });

  expect(() => validator.validateArtifactId("invalid"))
    .toThrow(/Invalid artifact ID format/);
});
```

## Mutation Testing Guide

Mutation testing introduces small changes (mutants) to your code and checks if tests fail. A high mutation score means tests are effective.

### Target Scores

- **Overall**: 85%+
- **Core modules** (validation, detection, cascade): 90%+
- **Current**: 64.09%

### Common Surviving Mutants

1. **Boundary conditions**: `>` vs `>=`, `<` vs `<=`
   - Fix: Add explicit boundary tests

2. **Boolean expressions**: `&&` vs `||`, removing conditionals
   - Fix: Test both true/false branches

3. **String literals**: Changing error messages
   - Fix: Assert on specific error messages (if critical)

4. **Return values**: Changing returned constants
   - Fix: Verify exact return values

### Example: Killing Boundary Mutants

```typescript
// Code under test
function isValidLength(str: string): boolean {
  return str.length >= 3 && str.length <= 50;
}

// Tests that kill boundary mutants
it("accepts strings at minimum boundary", () => {
  expect(isValidLength("abc")).toBe(true);  // Kills >= → >
});

it("rejects strings below minimum", () => {
  expect(isValidLength("ab")).toBe(false);  // Kills >= → >
});

it("accepts strings at maximum boundary", () => {
  expect(isValidLength("a".repeat(50))).toBe(true);  // Kills <= → <
});

it("rejects strings above maximum", () => {
  expect(isValidLength("a".repeat(51))).toBe(false);  // Kills <= → <
});
```

## Test Quality Checklist

Before committing tests, verify:

- [ ] **No `.only` or `.skip`**: All tests run in CI
- [ ] **Mock ratio <15%**: Prefer fakes and real objects
- [ ] **Strong assertions**: No `toBeDefined()` or `toBeGreaterThanOrEqual(0)` without context
- [ ] **Tests behavior**: Not implementation details
- [ ] **Fast unit tests**: <2s for all unit tests
- [ ] **Descriptive names**: Test names explain what's tested and expected outcome
- [ ] **AAA pattern**: Clear Arrange, Act, Assert sections
- [ ] **No test interdependence**: Tests can run in any order

## Future Improvements

### Planned Enhancements (see artifact D.2.yml)

1. **Fake Timers & RNG**: Add deterministic time/randomness in test setup
2. **E2E Separation**: Move integration tests to `test/e2e/`
3. **Higher Mutation Score**: Target 85%+ through focused test improvements
4. **More Property Tests**: Cover 10+ invariants across codebase
5. **Contract Test Expansion**: Add contracts for HookExecutor and DetectorService

### Current Gaps (as of 2025-11-09)

From mutation testing (64.09% overall):
- **impact-report-formatter.ts**: 45.54% - needs stronger assertion tests
- **post-checkout-orchestrator.ts**: 45.00% - needs more edge case coverage
- **post-merge-detector.ts**: 47.25% - needs boundary condition tests
- **pre-commit-validator.ts**: 51.35% - needs regex variant tests
- **hook-logger.ts**: 37.23% - needs log structure validation

## Resources

- [Stryker Mutator Docs](https://stryker-mutator.io/)
- [fast-check Documentation](https://fast-check.dev/)
- [Vitest API Reference](https://vitest.dev/api/)
- [Test Report Archive](test-report/) - Historical quality analysis

---

**Last Updated**: 2025-11-09
**Test Suite Version**: 0.7.1
**Overall Test Score**: 82/100 (B+)
