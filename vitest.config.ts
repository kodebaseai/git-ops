import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: [
      "src/hooks/post-checkout-orchestrator.test.ts",
      "src/hooks/post-checkout.integration.test.ts",
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
      exclude: ["**/*.test.ts", "**/dist/**", "**/node_modules/**"],
    },
  },
});
