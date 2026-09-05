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
  "Conversation history unavailable. Rebuild conversation from saved chat to continue.";
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
}: {
  error?: string;
  archived?: boolean;
  activity?: PhaseOneOperatorView["activity"];
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
      phaseNumber: 1,
      deliverable: "Launch Brief",
      status: "in-progress",
    },
    chats: [chat],
    selectedChatId: chat.id,
    messages: [
      {
        id: run.assistantMessageId,
        chatId: chat.id,
        role: "assistant",
        source: "pi",
        body: "",
        createdAt: failedAt,
        status: "failed",
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
      runs={[{ ...run, error }]}
      reconnecting={false}
      onRunAction={vi.fn()}
      onRebuildChat={vi.fn()}
    />,
  );
}

function rebuilt(chatId = chat.id, createdAt = "2026-09-05T10:01:00.000Z") {
  return {
    id: "rebuild-event",
    workspaceId: chat.workspaceId,
    kind: "chat-history-rebuilt",
    summary: "Conversation rebuilt from saved chat",
    detail: chatId,
    createdAt,
  };
}

describe("conversation recovery and assistant branding", () => {
  it("offers explicit rebuild for a history failure and preserves ordinary retry for other failures", () => {
    const unavailable = render();
    expect(unavailable).toContain(
      "Rebuild conversation from saved chat</button>",
    );
    expect(unavailable).not.toContain("Retry reply</button>");
    const ordinary = render({
      error: "Server Guy could not finish this attempt.",
    });
    expect(ordinary).toContain("Retry reply</button>");
    expect(ordinary).not.toContain(
      "Rebuild conversation from saved chat</button>",
    );
  });

  it("derives recovered state from durable Activity when a refreshed page mounts", () => {
    const html = render({ activity: [rebuilt()] });
    expect(html).toContain("Retry reply</button>");
    expect(html).toContain(
      "Conversation rebuilt from saved chat. Retry the reply when ready.",
    );
    expect(html).not.toContain("Rebuild conversation from saved chat</button>");
    expect(html).toContain(historyError);
  });

  it.each([
    rebuilt("another-chat"),
    rebuilt(chat.id, "2026-09-05T09:59:00.000Z"),
  ])(
    "does not treat an unrelated or old rebuild event as recovery",
    (event) => {
      expect(render({ activity: [event] })).toContain(
        "Rebuild conversation from saved chat</button>",
      );
    },
  );

  it("offers no recovery mutation in an archived Chat", () => {
    const html = render({ archived: true });
    expect(html).not.toContain("Rebuild conversation from saved chat</button>");
    expect(html).not.toContain("Retry reply</button>");
  });

  it("uses one assistant name and a matching composer accessible label", () => {
    const html = render();
    expect(html).toContain("<strong>Server Guy</strong>");
    expect(html).toContain('aria-label="Message Server Guy"');
    expect(html).not.toContain("<strong>Pi</strong>");
  });
});
