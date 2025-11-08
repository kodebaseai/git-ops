/**
 * Contract test execution for GitPlatformAdapter implementations
 *
 * @remarks
 * This file runs the contract test suite against different adapter implementations.
 * Part of D.1.1 Contract Test Proof-of-Concept.
 */

import { contractGitPlatformAdapter } from "@kodebase/test-utils/contracts";
import { FakeGitAdapter } from "@kodebase/test-utils/fakes";
import { describe } from "vitest";
import { GitHubAdapter } from "../github.js";

// Run contract tests against FakeGitAdapter
describe("GitPlatformAdapter Contract", () => {
  contractGitPlatformAdapter("FakeGitAdapter", () =>
    Promise.resolve(
      new FakeGitAdapter({
        authenticated: true,
        user: "contract-test-user",
      }),
    ),
  );

  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    contractGitPlatformAdapter(
      "GitHubAdapter",
      () => Promise.resolve(new GitHubAdapter({ token: githubToken })),
      { timeout: 5_000 },
    );
  }
});
