import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ActivityFeed,
  Inspector,
} from "../../../src/components/server-guy/inspector";
import type {
  ActivityEvent,
  PhaseOneOperatorView,
} from "../../../src/server/types";

const empty: PhaseOneOperatorView = {
  application: null,
  workspace: null,
  workspaces: [],
  inspection: null,
  contract: null,
  conformance: null,
  selectedChatId: null,
  chats: [],
  messages: [],
  checks: [],
  decisions: [],
  observations: [],
  upcomingRequirements: [],
  activity: [],
};

function render(view = empty) {
  return renderToStaticMarkup(
    <Inspector
      onHide={() => undefined}
      onToggleWidth={() => undefined}
      busy={null}
      view={view}
      checks={view.checks}
      onConformance={() => {}}
      onSelectCheck={() => {}}
    />,
  );
}

describe("optional saved requirements", () => {
  it("makes an empty list normal instead of asking for a launch priority", () => {
    const html = render();
    expect(html).not.toContain("Saved requirements");
    expect(html).not.toContain("No extra requirements.");
    expect(html).not.toContain("launch priority");
    expect(html).not.toContain("Tell Server Guy");
  });

  it("keeps legacy saved choices visible without exposing their old category label", () => {
    const html = render({
      ...empty,
      decisions: [
        {
          id: "legacy-choice",
          applicationId: "app",
          sourceMessageId: "source",
          kind: "launch-priority",
          label: "Additional launch priority",
          value: "Recovery speed matters more than the lowest hosting cost.",
          supersededById: null,
          createdAt: "2026-09-05T00:00:00Z",
        },
      ],
    });
    expect(html).toContain(
      "Recovery speed matters more than the lowest hosting cost.",
    );
    expect(html).toContain('href="/api/decisions/legacy-choice"');
    expect(html).toContain("Saved requirements (1)");
    expect(html).toContain('<details class="sg-saved-requirements">');
    expect(html).not.toContain(" open=");
    expect(html).not.toContain("Additional launch priority");
    expect(html).not.toContain("No extra requirements.");
  });
});

describe("application Activity", () => {
  const at = "2026-09-06T09:00:00.000Z";
  const events: ActivityEvent[] = [
    {
      id: "changed",
      workspaceId: "workspace",
      kind: "decision-revised",
      summary: "Requirement changed",
      detail: "Budget at most €30/month → Budget at most €50/month",
      createdAt: at,
    },
    {
      id: "verification-invalidated:observation",
      workspaceId: "workspace",
      kind: "repository-verification-invalidated",
      summary: "Repository verification invalidated",
      detail: "GitHub was disconnected after this repository was verified.",
      createdAt: at,
    },
    {
      id: "observed",
      workspaceId: "workspace",
      kind: "repository-observed",
      summary: "Repository identity recorded",
      detail: "qa/app is readable at main · 12345678.",
      createdAt: at,
    },
  ];

  it("shows application events with their outcome tone and no reply diagnostics", () => {
    const html = renderToStaticMarkup(<ActivityFeed events={events} />);
    expect(html).toContain("Requirement changed");
    expect(html).toContain(
      "Budget at most €30/month → Budget at most €50/month",
    );
    expect(html).toContain('class="sg-event-dot attention"');
    expect(html).toContain('class="sg-event-dot passed"');
    expect(html).toContain('class="sg-event-dot "');
    expect(html).toContain("What happened to this application");
    expect(html).not.toContain("open its details in Chat");
    expect(html).not.toContain("Reply details");
    expect(html).not.toContain("Technical details");
    expect(html).not.toContain("Assistant reply");
  });

  it("explains an empty feed without asking for activity", () => {
    const html = renderToStaticMarkup(<ActivityFeed events={[]} />);
    expect(html).toContain("No application events yet.");
    expect(html).not.toContain("sg-event-dot");
  });
});
