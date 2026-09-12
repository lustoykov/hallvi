import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ChatPane } from "../../../src/components/server-guy/chat-pane";
import type { Chat, OperatorView, PiRun } from "../../../src/server/types";

const failedAt = "2026-09-05T10:00:00.000Z";
const historyError =
  "Conversation history unavailable. Start a new chat to continue.";
const chat: Chat = {
  id: "chat-one",
  applicationId: "app-one",
  title: "Deploy application",
  createdAt: failedAt,
  archivedAt: null,
};
const run: PiRun = {
  id: "failed-run",
  applicationId: "app-one",
  chatId: chat.id,
  userMessageId: "user-message",
  assistantMessageId: "assistant-message",
  requestKey: "key",
  retryOfId: null,
  status: "failed",
  revision: 2,
  error: historyError,
  piCalls: 0,
  createdAt: failedAt,
  startedAt: failedAt,
  finishedAt: failedAt,
};

function render({
  error = historyError,
  archived = false,
  activity = [],
  piActivity,
  status = "failed",
  body = "",
}: {
  error?: string;
  archived?: boolean;
  activity?: OperatorView["activity"];
  piActivity?: OperatorView["piActivity"];
  status?: "queued" | "running" | "failed" | "cancelled";
  body?: string;
} = {}) {
  const view: OperatorView = {
    application: {
      id: "app-one",
      name: "app",
      repositoryOwner: "qa",
      repositoryName: "app",
      repositoryUrl: "https://github.com/qa/app",
      createdAt: failedAt,
      updatedAt: failedAt,
    },
    chats: [{ ...chat, lastActivityAt: failedAt }],
    selectedChatId: chat.id,
    messages: [
      {
        id: run.assistantMessageId,
        chatId: chat.id,
        role: "assistant",
        source: "pi",
        body,
        createdAt: failedAt,
        status,
        revision: 2,
      },
    ],
    decisions: [],
    activity,
    piActivity,
  };
  return renderToStaticMarkup(
    <ChatPane
      view={view}
      activeChat={{ ...chat, archivedAt: archived ? failedAt : null }}
      busy={null}
      error={null}
      pendingMessage={null}
      piReady
      composer=""
      onComposerChange={vi.fn()}
      onSend={vi.fn()}
      onArchive={vi.fn()}
      runs={[{ ...run, error, status }]}
      reconnecting={false}
      onRunAction={vi.fn()}
      onNewChat={vi.fn()}
    />,
  );
}

describe("conversation recovery and assistant branding", () => {
  it.each([
    // The status line now reads like a status rather than an announcement,
    // and says how long Pi has been at it when there is a start time.
    ["queued", "Waiting to reply"],
    ["running", "Working"],
    ["failed", "Something went wrong. Please retry."],
    ["cancelled", "Reply cancelled."],
  ] as const)("keeps %s status user-facing", (status, expected) => {
    const html = render({
      status,
      error: "Transaction failed for internal Run id.",
    });
    expect(html).toContain(expected);
    expect(html).not.toContain("Transaction failed");
    expect(html).not.toContain("Waiting for the worker");
    expect(html).not.toContain("Decisions are saved only");
  });

  it("keeps an unsuccessful save confirmation inside a collapsed unfinished draft", () => {
    const html = render({
      error: "Commit failed",
      body: "Saved: hosting budget €30/month.",
    });
    expect(html).toContain("Something went wrong. Please retry.");
    expect(html).toMatch(
      /<details class="sg-run-draft"><summary>Show unfinished draft<\/summary>/,
    );
    expect(html).toContain("Saved: hosting budget €30/month.");
    expect(html).not.toContain("Commit failed");
    expect(html).toContain("Retry reply</button>");
  });

  it("offers a new chat for a history failure and preserves ordinary retry for other failures", () => {
    const unavailable = render();
    expect(unavailable).toContain("Start a new chat</button>");
    expect(unavailable).not.toContain("Retry reply</button>");
    const ordinary = render({
      error: "Server Guy could not finish this attempt.",
    });
    expect(ordinary).toContain("Retry reply</button>");
    expect(ordinary).not.toContain("Start a new chat</button>");
  });

  it("offers no recovery mutation in an archived Chat", () => {
    const html = render({ archived: true });
    expect(html).not.toContain("Start a new chat</button>");
    expect(html).not.toContain("Retry reply</button>");
  });

  it("uses one assistant name and a matching composer accessible label", () => {
    const html = render();
    expect(html).toContain("<strong>Server Guy</strong>");
    expect(html).toContain('aria-label="Message Server Guy"');
    expect(html).not.toContain("<strong>Pi</strong>");
  });
});

it("renders streaming text once after earlier tool calls, including before the first call", () => {
  const body = "Now checking persistence.";
  const record = {
    kind: "tool" as const,
    id: "read-package",
    applicationId: "app-one",
    runId: run.assistantMessageId,
    sequence: 1,
    tool: "read",
    args: JSON.stringify({ path: "package.json" }),
    preview: "",
    result: "{}",
    status: "succeeded" as const,
    truncated: false,
    startedAt: failedAt,
    finishedAt: failedAt,
  };
  for (const piActivity of [[], [record]]) {
    const html = render({ status: "running", body, piActivity });
    expect(html.split(body)).toHaveLength(2);
    if (piActivity.length)
      expect(html.indexOf("package.json")).toBeLessThan(html.indexOf(body));
  }
  const html = render({
    status: "running",
    body,
    piActivity: [
      record,
      {
        ...record,
        id: "said",
        kind: "message",
        sequence: 2,
        text: body,
      },
    ],
  });
  expect(html.split(body)).toHaveLength(2);
});
