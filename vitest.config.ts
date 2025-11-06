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
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["**/*.test.ts", "**/dist/**", "**/node_modules/**"],
    },
  },
});
