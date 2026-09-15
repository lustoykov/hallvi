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
  status?: "queued" | "running" | "failed" | "cancelled" | "completed";
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
      runs={[
        {
          ...run,
          error,
          status: status === "completed" ? "succeeded" : status,
        },
      ]}
      reconnecting={false}
      onRunAction={vi.fn()}
      onNewChat={vi.fn()}
    />,
  );
}

describe("conversation recovery and assistant branding", () => {
  it.each([
    // The status line says what is actually happening, read from the records
    // that say so. With no execution and no tool call in flight, a running
    // turn is inside a model call, and "Working" was the same word it used
    // for a command building an image and for a decision nobody had noticed.
    ["queued", "Waiting to start"],
    ["running", "Waiting for the model"],
    // No command failed, so there is nothing to read — the run's own error is
    // runtime text and stays internal, which the assertions below guard.
    // A failure that does have a command behind it says what that command
    // printed; see run-activity.test.ts.
    [
      "failed",
      "The turn ended before it finished, and no command recorded why.",
    ],
    // Stopping ends the reply and does not undo work that already ran, so
    // the line reports what happened rather than naming the reply.
    ["cancelled", "Stopped."],
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
    expect(html).toContain(
      "The turn ended before it finished, and no command recorded why.",
    );
    expect(html).toMatch(
      /<details class="sg-run-draft"><summary>Show unfinished draft<\/summary>/,
    );
    expect(html).toContain("Saved: hosting budget €30/month.");
    expect(html).not.toContain("Commit failed");
    // "Try again" now: the control follows what failed, and with no command
    // output to read, trying again is the honest offer.
    expect(html).toContain("Try again</button>");
  });

  it("offers a new chat for a history failure and preserves ordinary retry for other failures", () => {
    const unavailable = render();
    expect(unavailable).toContain("Start a new chat</button>");
    expect(unavailable).not.toContain("Retry reply</button>");
    const ordinary = render({
      error: "Server Guy could not finish this attempt.",
    });
    // "Try again" now, because the control follows what failed: with no
    // command output to read, trying again is the honest offer.
    expect(ordinary).toContain("Try again</button>");
    expect(ordinary).not.toContain("Start a new chat</button>");
  });

  it("offers no recovery mutation in an archived Chat", () => {
    const html = render({ archived: true });
    expect(html).not.toContain("Start a new chat</button>");
    expect(html).not.toContain("Try again</button>");
    expect(html).not.toContain("Ask what went wrong</button>");
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
  for (const status of ["running", "completed"] as const) {
    for (const piActivity of [[], [record]]) {
      const html = render({ status, body, piActivity });
      expect(html.split(body)).toHaveLength(2);
      if (piActivity.length) {
        // The point is the order — what Pi did comes before what Pi is
        // saying — not the exact phrase. The group summary counts now, so a
        // single call reads "1 file read" rather than "File reads".
        const summary = "file read";
        expect(html.toLowerCase()).toContain(summary);
        expect(html.toLowerCase().indexOf(summary)).toBeLessThan(
          html.indexOf(body),
        );
      }
    }
    const html = render({
      status,
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
  }
});
