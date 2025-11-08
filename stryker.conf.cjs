/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  $schema: "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
  packageManager: "pnpm",
  mutate: ["src/**/*.ts", "!src/**/*.d.ts", "!src/**/*.test.ts"],
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.mutation.config.ts",
    related: true
  },
  plugins: ["@stryker-mutator/vitest-runner"],
  buildCommand: "tsc -p tsconfig.json",
  reporters: ["html", "json", "clear-text", "progress"],
  htmlReporter: {
    fileName: "reports/mutation/mutation.html"
  },
  jsonReporter: {
    fileName: "reports/mutation/mutation.json"
  },
  coverageAnalysis: "perTest",
  thresholds: {
    high: 85,
    low: 70,
    break: 70
  },
  mutator: {
    excludedMutations: ["StringLiteral"]
  },
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  timeoutMS: 60000,
  concurrency: 4
};

module.exports = config;
