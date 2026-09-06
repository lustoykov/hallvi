import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReplyExecution } from "../../../src/components/server-guy/reply-execution";
import type {
  ExecutionHistory,
  ExecutionStep,
  PiRun,
} from "../../../src/server/types";

const createdAt = "2026-09-06T09:00:00.000Z";
const startedAt = "2026-09-06T09:00:00.500Z";
const finishedAt = "2026-09-06T09:00:04.500Z";
const run: PiRun = {
  id: "run-1",
  applicationId: "app",
  workspaceId: "workspace",
  chatId: "chat",
  userMessageId: "user",
  assistantMessageId: "assistant",
  requestKey: "key",
  retryOfId: null,
  status: "succeeded",
  revision: 3,
  error: null,
  piCalls: 1,
  createdAt,
  startedAt,
  finishedAt,
};
function step(
  id: string,
  label: string,
  outcome: ExecutionStep["outcome"],
  metadata: ExecutionStep["metadata"] = {},
): ExecutionStep {
  return {
    id,
    label,
    startedAt,
    finishedAt: outcome === "running" ? undefined : finishedAt,
    outcome,
    metadata,
  };
}
const completed: ExecutionHistory = {
  steps: [
    step("context", "Load current app context", "completed"),
    step("model:1", "Generate response", "completed", {
      model: "gpt-fixture",
      inputTokens: 12,
      outputTokens: 4,
    }),
    step("save", "Validate and save reply and requirements", "completed"),
  ],
  omitted: 0,
  traceId: "a".repeat(32),
  exportEnabled: false,
  decisionIds: ["decision-a", "decision-b"],
};
function render(
  overrides: Partial<PiRun> = {},
  execution: ExecutionHistory | null = completed,
) {
  return renderToStaticMarkup(
    <ReplyExecution
      execution={execution ?? undefined}
      run={{ ...run, ...overrides }}
    />,
  );
}

describe("reply details", () => {
  it("stays collapsed, summarizes a completed reply and links its saved requirements", () => {
    const html = render();
    expect(html).toMatch(/^<details class="sg-execution" id="reply-run-1">/);
    expect(html).not.toContain(" open");
    expect(html).toContain("Reply details");
    expect(html).toContain("Completed in 4.0s · 3 steps");
    expect(html).toContain("Waited &lt;1s to start · Worked 4.0s");
    expect(html).not.toContain("worker");
    expect(html).toContain("Reply saved · 2 requirements saved");
    expect(html).toContain('href="/api/decisions/decision-a"');
    expect(html).toContain("Saved requirement 2");
    expect(html).toContain("Technical details");
    expect(html).toContain("Content is omitted");
    expect(html).toContain("model: gpt-fixture · inputTokens: 12");
    expect(html).toContain("Langfuse export is not configured");
    // A trace ID is only useful once export is on.
    expect(html).not.toContain("Trace ID");
    expect(html).not.toContain("Nothing was saved");
  });

  it("shows the current step while working and the queue state before that", () => {
    const working = render(
      { status: "running", finishedAt: null },
      {
        ...completed,
        decisionIds: undefined,
        steps: [
          step("context", "Load current app context", "completed"),
          step("model:1", "Generate response", "running"),
        ],
      },
    );
    expect(working).toContain("Generate response…");
    expect(working).toContain("Working now");
    expect(working).toContain("In progress");
    expect(working).not.toContain("Reply saved");
    expect(working).not.toContain("Nothing was saved");
    const queued = render(
      { status: "queued", startedAt: null, finishedAt: null },
      { steps: [], omitted: 0 },
    );
    expect(queued).toContain("Waiting to start");
    expect(queued).toContain("Steps appear when the reply starts.");
    expect(queued).not.toContain("Nothing was saved");
  });

  it("distinguishes an unsuccessful attempt and its unfinished step from a saved reply", () => {
    const html = render(
      { status: "cancelled", error: "Cancelled." },
      {
        steps: [
          step("context", "Load current app context", "completed"),
          step("model:1", "Generate response", "incomplete"),
        ],
        omitted: 0,
      },
    );
    expect(html).toContain("Cancelled after 4.0s · 2 steps");
    expect(html).toContain("Nothing was saved from this attempt");
    expect(html).toContain("unfinished text, not a saved reply");
    expect(html).toContain('class="incomplete"');
    expect(html).toContain("Not completed");
    expect(html).not.toContain("Saved requirement");
    expect(html).not.toContain("Reply saved");
    expect(html).not.toContain("Cancelled.");
  });

  it("explains an attempt that ended before any work started", () => {
    const html = render(
      { status: "cancelled", startedAt: null },
      { steps: [], omitted: 0 },
    );
    expect(html).toContain("Cancelled before the reply started");
    expect(html).toContain("the reply never started");
    expect(html).toContain("No execution steps were recorded.");
  });

  it("links a retry to the earlier attempt and offers Langfuse only when a link exists", () => {
    const html = render(
      { retryOfId: "run-0" },
      {
        ...completed,
        omitted: 2,
        exportEnabled: true,
        traceUrl:
          "https://cloud.langfuse.com/project/p/traces/" + "a".repeat(32),
      },
    );
    expect(html).toContain('href="#reply-run-0"');
    expect(html).toContain("2 later steps not stored");
    expect(html).toContain(
      'href="https://cloud.langfuse.com/project/p/traces/' + "a".repeat(32),
    );
    expect(html).toContain("Requires project access");
    expect(html).toContain("Trace ID");
    expect(html).not.toContain("not configured");
  });

  it("does not infer saved requirements or tracing configuration from missing history", () => {
    // Older successful Runs may have saved Decisions without execution
    // history. Missing diagnostics cannot establish a zero requirement count.
    const html = render({}, null);
    expect(html).toContain("Completed in 4.0s");
    expect(html).toContain("Reply saved");
    expect(html).toContain("Execution details unavailable for this reply.");
    expect(html).toContain("Tracing details unavailable for this reply.");
    expect(html).not.toContain("no requirements saved");
    expect(html).not.toContain("No execution steps were recorded.");
    expect(html).not.toContain("Langfuse export is not configured");
    expect(html).not.toContain("Local history is complete");
  });

  it("reports zero saved requirements when execution history is available", () => {
    const html = render({}, { ...completed, decisionIds: [] });
    expect(html).toContain("Reply saved · no requirements saved");
    expect(html).not.toContain("Execution details unavailable");
  });
});
