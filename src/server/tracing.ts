import {
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  diagnosticMetadata,
  logDiagnostic,
  MAX_DIAGNOSTIC_STEPS,
  stepLabels,
  type ExecutionSignal,
  type StepKind,
} from "./diagnostics";
import type { PiRun } from "./types";

let provider: NodeTracerProvider | undefined;

function tracer() {
  if (!provider) {
    const endpoint =
      process.env.SERVER_GUY_TRACING === "1"
        ? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
        : undefined;
    const enabled =
      process.env.SERVER_GUY_TRACING === "1" &&
      process.env.LANGFUSE_PUBLIC_KEY &&
      process.env.LANGFUSE_SECRET_KEY;
    provider = new NodeTracerProvider({
      resource: resourceFromAttributes({ "service.name": "server-guy" }),
      spanProcessors: endpoint
        ? [
            new BatchSpanProcessor(
              new OTLPTraceExporter({ url: endpoint, timeoutMillis: 3000 }),
              {
                maxQueueSize: 512,
                maxExportBatchSize: 128,
                scheduledDelayMillis: 2000,
                exportTimeoutMillis: 3000,
              },
            ),
          ]
        : enabled
          ? [
              new LangfuseSpanProcessor({
                exportMode: "batched",
                timeout: 3,
                flushInterval: 2,
                mediaUploadEnabled: false,
                shouldExportSpan: ({ otelSpan }) =>
                  otelSpan.instrumentationScope.name === "server-guy",
              }),
            ]
          : [],
    });
  }
  // Explicit parent contexts: no global provider, auto-instrumentation, or
  // captured HTTP headers. The only spans exported are created below.
  return provider.getTracer("server-guy");
}

function optionalTelemetry<T>(work: () => T): T | undefined {
  try {
    return work();
  } catch {
    return undefined;
  }
}

export function beginRunTrace(run: PiRun) {
  const root = optionalTelemetry(() =>
    process.env.SERVER_GUY_TRACING === "1"
      ? tracer().startSpan(
          "Assistant reply",
          {
            startTime: new Date(run.createdAt),
            attributes: {
              "server_guy.run.id": run.id,
              "server_guy.application.id": run.applicationId,
              "langfuse.session.id": run.chatId,
              "server_guy.retry_of": run.retryOfId ?? "",
              "langfuse.trace.name": "Server Guy reply",
              "server_guy.payload_policy": "Content omitted; metadata only",
              "server_guy.cost_basis":
                "API price estimates are not subscription charges",
            },
          },
          ROOT_CONTEXT,
        )
      : undefined,
  );
  const traceId = optionalTelemetry(() => root?.spanContext().traceId);
  const parent =
    optionalTelemetry(() =>
      root ? trace.setSpan(ROOT_CONTEXT, root) : ROOT_CONTEXT,
    ) ?? ROOT_CONTEXT;
  logDiagnostic("execution.started", run, {
    traceId,
    spanId: optionalTelemetry(() => root?.spanContext().spanId),
    durationMs:
      Date.parse(run.startedAt ?? run.createdAt) - Date.parse(run.createdAt),
  });
  if (root)
    optionalTelemetry(() => {
      const queue = tracer().startSpan(
        "Wait for worker",
        { startTime: new Date(run.createdAt) },
        parent,
      );
      queue.end(new Date(run.startedAt ?? run.createdAt));
    });
  const active = new Map<
    string,
    { span?: Span; kind: StepKind; started: number }
  >();
  const seen = new Set<string>();
  let omitted = 0;
  let finished = false;
  const closeStep = (
    key: string,
    outcome: "completed" | "failed" | "incomplete",
    input?: Record<string, unknown>,
  ) => {
    const step = active.get(key);
    if (!step) return;
    active.delete(key);
    const metadata = diagnosticMetadata(input);
    logDiagnostic("step.finished", run, {
      step: step.kind,
      stepId: key,
      outcome,
      durationMs: Date.now() - step.started,
      traceId,
      spanId: optionalTelemetry(() => step.span?.spanContext().spanId),
      metadata,
    });
    optionalTelemetry(() => {
      const span = step.span;
      if (!span) return;
      const attrs: Record<string, string | number | boolean> = {
        "server_guy.outcome": outcome,
      };
      if (outcome === "incomplete") attrs["server_guy.incomplete"] = true;
      for (const [key, value] of Object.entries(metadata))
        attrs[`server_guy.${key}`] = value;
      if (metadata.model) attrs["gen_ai.request.model"] = metadata.model;
      if (metadata.provider) attrs["gen_ai.provider.name"] = metadata.provider;
      if (typeof metadata.inputTokens === "number")
        attrs["gen_ai.usage.input_tokens"] = metadata.inputTokens;
      if (typeof metadata.outputTokens === "number")
        attrs["gen_ai.usage.output_tokens"] = metadata.outputTokens;
      span.setAttributes(attrs);
      span.setStatus({
        code:
          outcome === "completed" ? SpanStatusCode.OK : SpanStatusCode.ERROR,
      });
      span.end();
    });
  };
  return {
    signal(event: ExecutionSignal) {
      optionalTelemetry(() => {
        if (finished) return;
        if (event.type === "start") {
          if (seen.has(event.key)) return;
          if (seen.size >= MAX_DIAGNOSTIC_STEPS) {
            omitted++;
            return;
          }
          seen.add(event.key);
          const span = root
            ? optionalTelemetry(() =>
                tracer().startSpan(
                  stepLabels[event.kind],
                  {
                    attributes: {
                      "langfuse.observation.type":
                        event.kind === "model"
                          ? "generation"
                          : event.kind === "search_decisions" ||
                              event.kind === "propose_decision"
                            ? "tool"
                            : "span",
                    },
                  },
                  parent,
                ),
              )
            : undefined;
          active.set(event.key, {
            span,
            kind: event.kind,
            started: Date.now(),
          });
          logDiagnostic("step.started", run, {
            step: event.kind,
            stepId: event.key,
            traceId,
            spanId: optionalTelemetry(() => span?.spanContext().spanId),
          });
        } else
          closeStep(
            event.key,
            event.failed ? "failed" : "completed",
            event.metadata,
          );
      });
    },
    finish(status: PiRun["status"]) {
      if (finished) return;
      finished = true;
      for (const key of active.keys())
        optionalTelemetry(() => closeStep(key, "incomplete"));
      active.clear();
      seen.clear();
      if (omitted)
        logDiagnostic("execution.omitted", run, { omitted, traceId });
      optionalTelemetry(() => {
        root?.setAttribute("server_guy.outcome", status);
        root?.setStatus({
          code:
            status === "succeeded" ? SpanStatusCode.OK : SpanStatusCode.ERROR,
        });
        root?.end();
      });
    },
  };
}

// Long-lived workers batch in the background. Shutdown flush is bounded by
// the exporter's timeout and never changes the result of a product action.
export async function shutdownTracing() {
  try {
    await provider?.shutdown();
  } catch {
    /* Optional diagnostics. */
  }
  provider = undefined;
}
