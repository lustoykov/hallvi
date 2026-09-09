import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryView } from "../../../src/components/server-guy/views/history-view";
import { OperationReceipt } from "../../../src/components/server-guy/operation-receipt";
import { stackOf } from "../../../src/server/application-stack";
import type { ApplicationOperation } from "../../../src/server/operation-record";

const operation: ApplicationOperation = {
  id: "verified",
  source: { type: "deployment", id: "deployment" },
  kind: "change",
  title: "Deploy app",
  state: "verified",
  destinations: ["deployment", "processes", "database", "storage", "history"],
  origin: { chatId: "chat", messageId: "message" },
  mentions: [],
  startedAt: "2026-09-09T11:00:00Z",
  updatedAt: "2026-09-09T11:05:00Z",
  summary: "Verified the accepted image and retained the data.",
  evidence: "Verified the accepted image and retained the data.",
};
const now = Date.parse("2026-09-09T12:00:00Z");
const noop = () => {};

describe("recorded work polish", () => {
  it("keeps the failed attempt and resolver while removing its obsolete next action", () => {
    const failed: ApplicationOperation = {
      ...operation,
      id: "failed",
      state: "failed",
      evidence: undefined,
      summary: "Verification stopped.",
      next: "HTTP 200 did not match expected content.",
      resolvedById: operation.id,
    };
    const html = renderToStaticMarkup(
      <HistoryView
        operations={[failed, operation]}
        chats={[]}
        now={now}
        deployment={null}
        facts={{}}
        stack={stackOf(null)}
        onAsk={noop}
        onOpenConversation={noop}
        onOpenDestination={noop}
      />,
    );
    expect(html).toContain("Resolved by");
    expect(html).toContain("HTTP 200 did not match expected content.");
    expect(html).toContain("View recorded evidence");
    expect(html).not.toContain('class="sg-op-next"');
    const unresolved = renderToStaticMarkup(
      <HistoryView
        operations={[failed]}
        chats={[]}
        now={now}
        deployment={null}
        facts={{}}
        stack={stackOf(null)}
        onAsk={noop}
        onOpenConversation={noop}
        onOpenDestination={noop}
      />,
    );
    expect(unresolved).not.toContain("Resolved by");
    expect(unresolved).toContain('class="sg-op-next"');
  });
  it("renders an identical outcome once and keeps every destination reachable", () => {
    const html = renderToStaticMarkup(
      <OperationReceipt operation={operation} now={now} onOpen={noop} />,
    );
    expect(html.split(operation.evidence!).length - 1).toBe(1);
    expect(html).toContain("2 more destinations");
    expect(html).toContain("Open Storage");
    expect(html).toContain("Open History");
    expect(html).toMatch(/<details[^>]*>[\s\S]*Open Storage[\s\S]*<\/details>/);
  });
});
