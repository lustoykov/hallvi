import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Test subprocesses inherit only synthetic diagnostic destinations.
    env: {
      SERVER_GUY_LOG_DIR: "",
      SERVER_GUY_TRACING: "0",
      OTEL_EXPORTER_OTLP_ENDPOINT: "",
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "",
      OTEL_EXPORTER_OTLP_HEADERS: "",
      OTEL_EXPORTER_OTLP_TRACES_HEADERS: "",
      LANGFUSE_PUBLIC_KEY: "",
      LANGFUSE_SECRET_KEY: "",
      LANGFUSE_BASE_URL: "",
    },
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
