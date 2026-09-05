# Action history and tracing

Status: proposed design, not implemented. Planned as development milestone 7, after durable Pi requests; the [native Pi sessions proposal](native-pi-and-permissions.md) is the suggested step before it.

Users should be able to inspect what Server Guy attempted, what each step returned, and what actually changed. Start with one chat execution and extend the same view as external Operations arrive. Delivery order and implementation status belong to the [roadmap](../../ROADMAP.md#action-history-and-tracing).

## First slice

Reuse the planned durable Pi Run, Activity Events, and existing Inspector. Trace the path from accepting a chat request through Pi execution, domain validation, database commit, and rebuilding the Operator View. Pi remains the direct runtime.

At the September 4, 2026 baseline, the [Pi adapter](../../src/server/pi.ts) uses an in-memory session and collects text deltas; the [Activity view](../../src/components/server-guy/inspector.tsx) displays saved summaries. The installed SDK also exposes model-message, tool execution, and retry lifecycle events. Instrument these plus Server Guy's own code; Pi events alone cannot prove a domain change was committed.

For “Prioritize low operating cost,” the expanded history should explain:

```text
Chat execution
├─ Request accepted → queued → worker started
├─ Load current application, Decisions, and bounded conversation
├─ Pi execution
│  ├─ Model call → requests propose_decision
│  ├─ propose_decision → proposal collected
│  └─ Model call → final response
├─ Server Guy validates the proposed Decision
├─ Database commit → messages, Decision, and Activity Event saved
└─ Operator View refreshed → link to the saved Decision
```

The existing [domain path](../../src/server/phase-one.ts) can reject a proposal after the Pi tool succeeds, for example when a replacement Decision is already superseded. Show both outcomes: proposal collected; change rejected; no Decision saved.

## User experience

| Depth | What the user sees |
| --- | --- |
| Collapsed Activity | A concise action summary, timestamp, and current or terminal result. |
| Expanded execution | Ordered steps with actor/tool, start/end or elapsed time, concise result, retries, and links to the affected records. Distinguish queue time from execution time. |
| Evidence | Redacted inputs/outputs, errors, correlated logs, and trace detail. Offer **Open in Langfuse** only when configured and the viewer has access. |

Keep technical output collapsed by default and preserve the user's selected Inspector tab. Follow the existing [technical detail renderers](../user-journeys/01-application-launch.md#technical-detail-renderers). Activity supplies meaningful historical facts; Evidence supplies technical depth. Model-authored explanations remain distinguishable from recorded outcomes. This view exposes execution evidence, not private model reasoning.

While work is running, show the last recorded step and its state. After reload or reconnect, reconstruct history from SQLite. A retry must remain distinguishable and linked to the preceding attempt. Missing or truncated telemetry is labeled as such; it must not turn an unknown outcome into success.

## Records and telemetry

```mermaid
flowchart LR
    E[Pi and Server Guy execution] --> D[SQLite: Pi Run, Activity Events, domain records]
    D --> U[Inspector: Activity and Evidence]
    E --> T[OpenTelemetry spans]
    T --> L[Langfuse trace explorer]
    E --> G[Structured logs with run and trace IDs]
    U -. Authorized trace link .-> L
```

- **SQLite owns product history.** Reuse Pi Run identity rather than introducing another execution store. Store meaningful lifecycle/tool outcomes with stable ordering and references to affected Decisions, Observations, and later Operations. Keep accumulated message revisions; do not persist one Activity Event per token.
- **OpenTelemetry connects timed steps.** Carry application, Chat, and Pi Run IDs through worker execution, model/tool steps, validation, and commit. Correlate spans and logs with trace/span IDs. A trace ID is diagnostic identity, not a replacement for the durable run or Operation ID.
- **Langfuse provides deeper inspection.** Export nested model/tool spans and explicitly instrument domain steps. Capture provider/model and reported usage; label calculated cost as an estimate, not a ChatGPT subscription charge. Missing usage or cost stays unavailable rather than zero.
- **Sentry covers application errors at external release.** Correlate errors with the same run context when available. It is not required for this first local slice.

Save successful domain changes and their Activity Events atomically. If that transaction rolls back, persist the run failure/rejection separately so the failed attempt remains inspectable. On worker restart, use the durable-run interruption policy; do not infer completion from an unfinished span or repeat a possible effect to fill a trace gap.

Telemetry export is asynchronous and optional. An unavailable exporter must not fail or repeat an otherwise completed action, erase local history, or block the Inspector. Sampling and retention may reduce diagnostic detail; durable product history must not depend on them. Do not make a Langfuse account, a collector service, or a new dashboard a prerequisite for local use.

Apply payload selection and redaction before local diagnostic storage or export. Exclude credentials, OAuth codes, authorization headers, and unnecessary private content; limit payload size and disclose truncation. Scope history and evidence reads to the relevant application and viewer. Keep Langfuse credentials server-side and never create public trace links automatically.

## Acceptance scenarios

| Scenario | Required evidence |
| --- | --- |
| Successful Decision | Ordered model/tool/domain steps lead to the committed Decision; refresh preserves the history and record link. |
| Tool succeeds, domain rejects | Tool success remains visible beside the rejection; no saved-Decision claim or partial domain write. |
| Timeout, cancellation, or worker crash | The recorded terminal/interrupted state survives reload; incomplete spans do not appear completed. |
| Disconnect and retry | Reconnection reconstructs durable history without duplicate rows; retry history remains attributable to its attempt. |
| Export disabled or unavailable | Local execution and inspection still work; absent diagnostic detail is explicit. |
| Sensitive payload | Synthetic secrets never appear in stored diagnostic payloads, exported spans/logs, or the Inspector. |

Verify the history with deterministic Pi/domain fixtures, then use one explicitly enabled real-Pi run to confirm actual model/tool spans reach the configured Langfuse project. A working exporter alone is not acceptance of the user-facing history.

## Later scope and references

As Operations are implemented, extend tracing through policy, approval, provider request, receipt, and independent verification. Success still comes from durable records and fresh evidence. Managed-application infrastructure logs, general analytics dashboards, and on-demand dashboard generation are outside this first slice.

- [Domain vocabulary](../../CONTEXT.md) and [observability learning target](../learning/stack-with-server-guy.md#observability-learning-target).
- [OpenTelemetry traces](https://opentelemetry.io/docs/concepts/signals/traces/).
- [Langfuse instrumentation](https://langfuse.com/docs/observability/sdk/instrumentation) and [usage/cost tracking](https://langfuse.com/docs/observability/features/token-and-cost-tracking).
