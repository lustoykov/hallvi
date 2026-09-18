// Settings gets no keys, URL credentials, paths or query strings.
export function traceExportConfiguration() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  const mode =
    process.env.HALLVI_TRACING !== "1"
      ? "off"
      : endpoint
        ? "otlp"
        : process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
          ? "langfuse"
          : "incomplete";
  let destination: string | null = null;
  if (mode === "otlp" || mode === "langfuse") {
    try {
      destination = new URL(
        mode === "otlp"
          ? endpoint!
          : process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com",
      ).origin;
    } catch {
      destination = "Invalid destination URL";
    }
  }
  return { mode, destination };
}
