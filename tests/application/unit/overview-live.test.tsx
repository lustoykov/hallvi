import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { OverviewLive } from "@/components/hallvi/overview-live/overview-live";

vi.mock("@/components/hallvi/overview-live/use-traffic", () => ({
  WINDOW_MINUTES: 5,
  useTraffic: () => ({ state: "no-log", requests: 0, recent: [] }),
}));

it("gives a pending approval its conversation action on the live Overview", () => {
  const html = renderToStaticMarkup(
    <OverviewLive
      applicationId="app"
      name="Example"
      title="Example"
      mapped
      built={{
        headline: "",
        ideas: [],
        vitals: [],
        recent: [],
        needs: [
          {
            id: "approval",
            tone: "waiting",
            title: "A decision is waiting",
            detail: "Deploy the application",
            primary: { label: "Open the conversation", open: () => {} },
          },
        ],
      }}
      usage={null}
      condition={{ certainty: "unknown", text: "" }}
      now={Date.now()}
      chrome={{ bar: null, header: null, activity: null }}
      openUrl={null}
      restricted
      reachable="checking"
      onAsk={() => {}}
      onOpenDestination={() => {}}
    />,
  );
  expect(html).toMatch(/<button[^>]*>Open the conversation →<\/button>/);
});
