import {
  ROOT_CONTEXT,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  diagnosticMetadata,
  endHistoryStep,
  startHistoryStep,
  stepLabels,
  updateRunHistory,
  type ActivitySignal,
} from "./run-history";
import type { PiRun } from "./types";

let provider: NodeTracerProvider | undefined;

export function langfuseTraceUrl(traceId: string) {
  if (process.env.SERVER_GUY_TRACING !== "1") return undefined;
  const project = process.env.LANGFUSE_PROJECT_ID;
  if (
    !project ||
    !/^[a-zA-Z0-9_-]+$/.test(project) ||
    !/^[a-f0-9]{32}$/.test(traceId)
  )
    return undefined;
  try {
    const base = new URL(
      process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com",
    );
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      base.search ||
      base.hash
    )
      return undefined;
    return `${base.origin}/project/${project}/traces/${traceId}`;
  } catch {
    return undefined;
  }
}

function tracer() {
  if (!provider) {
    const enabled =
      process.env.SERVER_GUY_TRACING === "1" &&
      process.env.LANGFUSE_PUBLIC_KEY &&
      process.env.LANGFUSE_SECRET_KEY;
    provider = new NodeTracerProvider({
      resource: resourceFromAttributes({ "service.name": "server-guy" }),
      spanProcessors: enabled
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
    tracer().startSpan(
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
            "Langfuse API price estimates are not ChatGPT subscription charges",
        },
      },
      ROOT_CONTEXT,
    ),
  );
  const traceId = root?.spanContext().traceId;
  const parent = root ? trace.setSpan(ROOT_CONTEXT, root) : ROOT_CONTEXT;
  if (traceId)
    updateRunHistory(run.id, (history) => {
      history.traceId = traceId;
      history.exportEnabled =
        process.env.SERVER_GUY_TRACING === "1" &&
        !!process.env.LANGFUSE_PUBLIC_KEY &&
        !!process.env.LANGFUSE_SECRET_KEY;
      history.traceUrl = history.exportEnabled
        ? langfuseTraceUrl(traceId)
        : undefined;
    });
  optionalTelemetry(() => {
    const queue = tracer().startSpan(
      "Wait for worker",
      { startTime: new Date(run.createdAt) },
      parent,
    );
    queue.end(new Date(run.startedAt ?? run.createdAt));
  });
  const active = new Map<string, Span>();
  return {
    signal(event: ActivitySignal) {
      if (event.type === "start") {
        if (active.has(event.key)) return;
        // Bound local storage and exported spans together.
        if (!startHistoryStep(run.id, event.key, event.kind)) return;
        const span = optionalTelemetry(() =>
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
        );
        if (span) {
          active.set(event.key, span);
          updateRunHistory(run.id, (history) => {
            const step = history.steps.find((s) => s.id === event.key);
            if (step) step.spanId = span.spanContext().spanId;
          });
        }
      } else {
        const metadata = diagnosticMetadata(event.metadata);
        endHistoryStep(
          run.id,
          event.key,
          event.failed ? "failed" : "completed",
          metadata,
        );
        optionalTelemetry(() => {
          const span = active.get(event.key);
          if (!span) return;
          const attrs: Record<string, string | number> = {};
          for (const [key, value] of Object.entries(metadata))
            attrs[`server_guy.${key}`] = value;
          if (metadata.model) attrs["gen_ai.request.model"] = metadata.model;
          if (metadata.provider)
            attrs["gen_ai.provider.name"] = metadata.provider;
          if (typeof metadata.inputTokens === "number")
            attrs["gen_ai.usage.input_tokens"] = metadata.inputTokens;
          if (typeof metadata.outputTokens === "number")
            attrs["gen_ai.usage.output_tokens"] = metadata.outputTokens;
          span.setAttributes(attrs);
          span.setStatus({
            code: event.failed ? SpanStatusCode.ERROR : SpanStatusCode.OK,
          });
          span.end();
        });
        active.delete(event.key);
      }
    },
    finish(status: PiRun["status"]) {
      optionalTelemetry(() => {
        for (const span of active.values()) {
          span.setAttribute("server_guy.incomplete", true);
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.end();
        }
        active.clear();
        root?.setAttribute("server_guy.outcome", status);
        root?.setStatus({
          code:
            status === "succeeded" ? SpanStatusCode.OK : SpanStatusCode.ERROR,
        });
        root?.end();
        if (process.env.SERVER_GUY_TRACING === "1")
          console.info(
            JSON.stringify({
              event: "reply.finished",
              runId: run.id,
              applicationId: run.applicationId,
              chatId: run.chatId,
              traceId,
              spanId: root?.spanContext().spanId,
              status,
            }),
          );
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
