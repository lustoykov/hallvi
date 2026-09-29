import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import {
  LaneRails,
  type RailEvent,
  type RailLane,
} from "@/components/hallvi/lane-rails";

it("calls only passed timeline groups passed, including a mixed failed rehearsal group", () => {
  const now = Date.parse("2026-09-29T20:08:00Z");
  for (const tone of ["pass", "fail", "info", "planned"] as const) {
    const event: RailEvent = {
      id: `group-${tone}`,
      at: now - 60_000,
      tone,
      // The captured rehearsal's mixed group has seven checks and fail tone.
      title: "7 checks",
      detail: "",
    };
    const lane: RailLane = {
      id: "checks",
      icon: null,
      name: "Checks",
      question: "Is the app working?",
      plain: "Recorded application checks",
      status: "",
      tone: "failed",
      events: [event],
      ghost: null,
    };
    const html = renderToStaticMarkup(<LaneRails lanes={[lane]} now={now} />);
    expect(html).toContain(
      tone === "pass" ? ">7 checks passed<" : ">7 checks<",
    );
    if (tone !== "pass") expect(html).not.toContain("7 checks passed");
  }
});
