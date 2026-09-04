import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/application/{unit,integration}/**/*.test.{ts,tsx}"],
    exclude: ["tests/results/**"],
    coverage: { reportsDirectory: "tests/results/coverage" },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
    },
  },
});
