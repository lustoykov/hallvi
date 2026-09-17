import { afterEach, expect, it, vi } from "vitest";
import { traceExportConfiguration } from "../../../src/server/tracing-config";
afterEach(() => vi.unstubAllEnvs());
it("shows export off even when credentials are present", () => {
  vi.stubEnv("HALDUR_TRACING", "0");
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", "private");
  vi.stubEnv("LANGFUSE_SECRET_KEY", "private");
  expect(traceExportConfiguration()).toEqual({
    mode: "off",
    destination: null,
  });
});
it("shows an incomplete setup instead of claiming export is configured", () => {
  vi.stubEnv("HALDUR_TRACING", "1");
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", "");
  vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "");
  expect(traceExportConfiguration()).toEqual({
    mode: "incomplete",
    destination: null,
  });
});
it("prioritizes OTLP and does not disclose URL credentials, paths or query strings", () => {
  vi.stubEnv("HALDUR_TRACING", "1");
  vi.stubEnv(
    "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
    "https://user:secret@collector.test/private-path?key=secret",
  );
  expect(traceExportConfiguration()).toEqual({
    mode: "otlp",
    destination: "https://collector.test",
  });
});
it("shows the Langfuse destination without exposing project keys", () => {
  vi.stubEnv("HALDUR_TRACING", "1");
  vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "");
  vi.stubEnv("LANGFUSE_BASE_URL", "https://cloud.langfuse.com");
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", "private");
  vi.stubEnv("LANGFUSE_SECRET_KEY", "private");
  expect(traceExportConfiguration()).toEqual({
    mode: "langfuse",
    destination: "https://cloud.langfuse.com",
  });
});
