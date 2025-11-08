import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["src/**/*.test.ts"],
      exclude: [
        "src/**/*.integration.test.ts",
        "src/**/*.e2e.test.ts",
        "src/**/*.real.test.ts",
        "src/**/*.perf.test.ts",
      ],
      pool: "forks",
    },
  }),
);
