import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ChatPane } from "../../../src/components/hallvi/chat-pane";
import type {
  Chat,
  ChatMessage,
  OperatorView,
} from "../../../src/server/types";

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
/** The owner's message Pi read, and the reply Pi wrote under it. */
const asked: ChatMessage = {
  id: "user-message",
  chatId: chat.id,
  role: "user",
  source: "user",
  body: "Deploy it",
  createdAt: failedAt,
  status: "delivered",
  requestKey: "key",
  revision: 1,
};
const run = { assistantMessageId: "assistant-message" };

function render({
  error = historyError,
  archived = false,
  activity = [],
  piActivity,
  status = "failed",
  body = "",
  messages,
}: {
  error?: string;
  archived?: boolean;
  activity?: OperatorView["activity"];
  piActivity?: OperatorView["piActivity"];
  status?: "waiting" | "running" | "failed" | "cancelled" | "completed";
  body?: string;
  messages?: OperatorView["messages"];
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
    messages: messages ?? [
      asked,
      {
        id: run.assistantMessageId,
        chatId: chat.id,
        role: "assistant",
        source: "pi",
        body,
        createdAt: failedAt,
        startedAt: failedAt,
        responseTo: asked.id,
        error: status === "failed" ? error : null,
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
      reconnecting={false}
      onStop={vi.fn()}
      onContinue={vi.fn()}
      onTell={vi.fn()}
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
      /<details class="hv-run-draft"><summary>Show unfinished draft<\/summary>/,
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
      error: "Hallvi could not finish this attempt.",
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

  it("says when Pi will read each waiting message, and cancels them only through Stop", () => {
    const html = render({
      messages: [
        asked,
        {
          id: run.assistantMessageId,
          chatId: chat.id,
          role: "assistant",
          source: "pi",
          body: "",
          createdAt: failedAt,
          startedAt: failedAt,
          responseTo: asked.id,
          status: "running",
          revision: 2,
        },
        { ...asked, id: "next", body: "Then publish it", status: "waiting" },
        {
          ...asked,
          id: "steer",
          body: "Use port 8080",
          status: "waiting",
          delivery: "steer",
        },
      ],
    });

    expect(html).toContain("Stop + cancel 2 waiting");
    expect(html).not.toContain("Withdraw");
    expect(html).toContain("Pi reads this when its current work is done.");
    // Steering says where it lands, and what it does not do.
    expect(html).toContain(
      "It does not interrupt a running command or a pending approval.",
    );
    expect(html.match(/Waiting for the model/g)).toHaveLength(1);
  });

  it("after a worker went away, offers Continue and Stop and sends nothing new until one is chosen", () => {
    const html = render({
      messages: [
        asked,
        {
          id: run.assistantMessageId,
          chatId: chat.id,
          role: "assistant",
          source: "pi",
          body: "Restarting the service",
          createdAt: failedAt,
          startedAt: failedAt,
          responseTo: asked.id,
          error:
            "The worker stopped. Whether the last command finished is not known: read execution evidence before continuing. Nothing is run again by itself.",
          status: "interrupted",
          revision: 2,
        },
        {
          ...asked,
          id: "held",
          body: "Then publish it",
          status: "waiting",
        },
      ],
    });
    expect(html).toContain("Then publish it");
    expect(html).toContain(
      "Pi holds this and has not read it. Continue has Pi read it; Stop cancels it.",
    );
    expect(html).toContain("This conversation was interrupted");
    expect(html).toMatch(/<button[^>]*>Continue<\/button>/);
    expect(html).toMatch(/<button[^>]*>Stop<\/button>/);
    // The interrupted reply offers no "try again" that would send a new message.
    expect(html).not.toContain("Try again");
    // Nobody stopped it, and nothing claims that nothing had run.
    expect(html).toContain("Interrupted");
    expect(html).toContain("Whether the last command finished is not known");
    expect(html).not.toContain("Nothing had run");
  });

  it("uses one assistant name and a matching composer accessible label", () => {
    const html = render();
    expect(html).toContain("<strong>Hallvi</strong>");
    expect(html).toContain('aria-label="Message Hallvi"');
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
