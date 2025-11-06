import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: [
      // "src/hooks/post-checkout-orchestrator.test.ts",
      // "src/hooks/post-checkout.integration.test.ts",
    ],
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
        functions: 95,
        branches: 80,
        statements: 90,
      },
    },
  },
});
