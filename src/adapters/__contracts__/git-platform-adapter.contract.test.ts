/**
 * Contract test execution for GitPlatformAdapter implementations
 *
 * @remarks
 * This file runs the contract test suite against different adapter implementations.
 * Part of D.1.1 Contract Test Proof-of-Concept.
 */

import { FakeGitAdapter } from "@kodebase/test-utils/fakes";
import { describe } from "vitest";
import { contractGitPlatformAdapter } from "./git-platform-adapter.contract.js";

// Run contract tests against FakeGitAdapter
describe("Contract Tests", () => {
  contractGitPlatformAdapter(
    "FakeGitAdapter",
    () =>
      Promise.resolve(
        new FakeGitAdapter({
          authenticated: true,
          user: "contract-test-user",
        }),
      ),
    {
      timeout: 1000, // <1s target
    },
  );
});

// Future: Add contract tests for real implementations
// Uncomment when ready for integration testing:
//
// import { GitHubAdapter } from '../github.js';
//
// describe('Contract Tests (Real Implementations)', () => {
//   if (process.env.GITHUB_TOKEN) {
//     contractGitPlatformAdapter(
//       'GitHubAdapter',
//       async () => new GitHubAdapter({ token: process.env.GITHUB_TOKEN }),
//       {
//         timeout: 5000, // Network operations need more time
//         skipNetworkTests: false
//       }
//     );
//   }
// });
