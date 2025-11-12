import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    include: ["src/**/*.test.ts"],
    exclude: ["test/e2e/**/*.test.ts", "**/node_modules/**"],
    coverage: {
      provider: "istanbul",
      reporter: [
        "text",
        "text-summary",
        "lcov",
        [
          "json",
          {
            file: "../coverage.json",
          },
        ],
      ],
      enabled: true,
      // Thresholds set to current coverage levels - coverage should never go down
      thresholds: {
        lines: 90,
        functions: 85,
        branches: 80,
        statements: 90,
      },
    },
  },
});
