import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Inspector } from "../../../src/components/server-guy/inspector";
import type { PhaseOneOperatorView } from "../../../src/server/types";

const empty: PhaseOneOperatorView = {
  application: null,
  workspace: null,
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
    <Inspector view={view} checks={view.checks} onSelectCheck={() => {}} />,
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
