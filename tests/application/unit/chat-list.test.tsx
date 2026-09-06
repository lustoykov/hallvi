import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatList } from "../../../src/components/server-guy/chat-list";

const chat = {
  id: "chat-1",
  workspaceId: "workspace",
  title: "Launch Brief",
  isPrimary: true,
  createdAt: "2026-09-05T08:00:00.000Z",
  archivedAt: null,
  lastActivityAt: "2026-09-05T10:30:00.000Z",
};

describe("chat list", () => {
  it("shows when each chat was last active, after its archived label", () => {
    const html = renderToStaticMarkup(
      <ChatList
        busy={false}
        chats={[
          chat,
          {
            ...chat,
            id: "chat-2",
            title: "Launch question 2",
            isPrimary: false,
            archivedAt: "2026-09-05T11:00:00.000Z",
            lastActivityAt: "2026-09-04T09:00:00.000Z",
          },
        ]}
        hasApplication
        onCreate={() => {}}
        onSelect={() => {}}
        selectedChatId="chat-1"
        workspace={{
          id: "workspace",
          applicationId: "app",
          phaseKey: "start",
          createdAt: chat.createdAt,
          completedAt: null,
          deliverableEvidence: null,
          phaseNumber: 1,
          name: "Start",
          deliverable: "Launch Brief",
          status: "in-progress",
          current: true,
        }}
      />,
    );
    expect(html).toContain('<time dateTime="2026-09-05T10:30:00.000Z"');
    // The time follows the archived label so the row reads "title, kind,
    // archived, when".
    expect(html).toMatch(
      /Separate transcript<\/small><em>Archived<\/em><time dateTime="2026-09-04T09:00:00.000Z"/,
    );
  });
});
