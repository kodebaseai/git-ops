import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: false,
        isolate: true,
      },
    },
    include: ["src/**/*.integration.test.ts"],
    coverage: {
      enabled: false,
    },
  },
});
