import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ChatPane } from "../../../src/components/server-guy/chat-pane";
import type {
  Chat,
  PhaseOneOperatorView,
  PiRun,
} from "../../../src/server/types";

const failedAt = "2026-09-05T10:00:00.000Z";
const historyError =
  "Conversation history unavailable. Start a new chat to continue.";
const chat: Chat = {
  id: "chat-one",
  workspaceId: "workspace-one",
  title: "Launch Brief",
  isPrimary: true,
  createdAt: failedAt,
  archivedAt: null,
};
const run: PiRun = {
  id: "failed-run",
  applicationId: "app-one",
  workspaceId: chat.workspaceId,
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
  status = "failed",
  body = "",
}: {
  error?: string;
  archived?: boolean;
  activity?: PhaseOneOperatorView["activity"];
  status?: "queued" | "running" | "failed" | "cancelled";
  body?: string;
} = {}) {
  const view: PhaseOneOperatorView = {
    application: {
      id: "app-one",
      name: "app",
      repositoryOwner: "qa",
      repositoryName: "app",
      repositoryUrl: "https://github.com/qa/app",
      environment: "production",
      approvalMode: "pi-decides",
      approvalScope: "Current application launch",
      createdAt: failedAt,
      updatedAt: failedAt,
    },
    workspace: {
      id: chat.workspaceId,
      applicationId: "app-one",
      phaseKey: "start",
      createdAt: failedAt,
      completedAt: null,
      deliverableEvidence: null,
      phaseNumber: 1,
      name: "Start",
      deliverable: "Launch Brief",
      status: "in-progress",
      current: true,
    },
    workspaces: [],
    inspection: null,
    contract: null,
    conformance: null,
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
    checks: [],
    decisions: [],
    observations: [],
    upcomingRequirements: [],
    activity,
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
    ["queued", "Waiting to reply…"],
    ["running", "Replying…"],
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
