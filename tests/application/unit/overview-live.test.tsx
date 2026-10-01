// The deployed Overview's own rules: what is open is named for the thing, the
// head says how the address reads in words, a tunnel this computer dropped is
// not painted as a failure, and lanes nobody looked at say so once.
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { OverviewLive } from "@/components/hallvi/overview-live/overview-live";
import type { Vital } from "@/components/hallvi/overview-prototype/overview-model";

vi.mock("@/components/hallvi/overview-live/use-traffic", () => ({
  WINDOW_MINUTES: 5,
  useTraffic: () => ({
    state: "no-log",
    arrivals: [],
    recentVisitors: 0,
    openNow: null,
    clock: 0,
    onArrival: () => () => {},
  }),
}));

const vital = (
  id: Vital["id"],
  certainty: Vital["status"]["certainty"],
  text: string,
): Vital => ({
  id,
  label: id.replace(/^./, (first) => first.toUpperCase()),
  value: certainty === "failed" ? "Failed" : "Not assessed",
  status: { certainty, text },
  lines: [],
  plain: text,
  facts: [],
  destination: "access",
  ask: "",
});

const unlooked = (["checks", "backups", "server", "access"] as const).map(
  (id) => vital(id, "unknown", "Not checked yet"),
);

function overview(props: Partial<ComponentProps<typeof OverviewLive>> = {}) {
  return renderToStaticMarkup(
    <OverviewLive
      applicationId="app"
      name="Example"
      title="Example"
      mapped
      built={{ headline: "", ideas: [], vitals: [], recent: [], needs: [] }}
      usage={null}
      releases={{ running: null, latest: null, all: [] }}
      now={Date.now()}
      chrome={{ bar: null, header: null, activity: null }}
      openUrl={null}
      restricted={false}
      reachable="checking"
      onAsk={() => {}}
      onOpenDestination={() => {}}
      {...props}
    />,
  );
}

it("gives a pending approval its conversation action on the live Overview", () => {
  const html = overview({
    built: {
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
    },
  });
  expect(html).toMatch(/<button[^>]*>Open the conversation</);
  // The row draws a mark and names the state; a screen reader still hears
  // what the list holds.
  expect(html).toContain('aria-label="Unresolved: 1 awaiting approval"');
  expect(html).toContain("Awaiting approval");
  expect(html).not.toMatch(/>Unresolved</);
});

it("draws nothing about open things when nothing is open", () => {
  expect(overview()).not.toContain("ovl-open");
});

it("says how the address reads in the head, and never calls a tunnel answering", () => {
  const published = overview({
    openUrl: "https://example.com",
    reachable: "open",
  });
  expect(published).toContain("Answering");
  expect(published).toContain("example.com");
  // The check proves the connection, not the application behind it.
  const tunnel = overview({
    openUrl: "http://127.0.0.1:18080",
    reachable: "open",
  });
  expect(tunnel).toContain("Private connection open");
  expect(tunnel).not.toContain("Answering");
});

it("states a dropped tunnel without calling it a failure", () => {
  const built = {
    headline: "",
    ideas: [],
    recent: [],
    needs: [],
    vitals: [
      ...unlooked.slice(0, 3),
      vital("access", "failed", "Tunnel is closed"),
    ],
  };
  const tunnel = overview({
    built,
    openUrl: "http://127.0.0.1:18080",
    reachable: "closed",
  });
  expect(tunnel).toContain("The tunnel is closed");
  expect(tunnel).toMatch(/data-tone="unknown"[^>]*>.*?Closed/);
  expect(tunnel).toContain("Tunnel is closed");
  expect(tunnel).not.toContain('data-tone="failed"');
  // A published address that was asked and said nothing is the amber one.
  const published = overview({
    built,
    openUrl: "https://example.com",
    reachable: "closed",
  });
  expect(published).toMatch(/data-tone="stale"[^>]*>.*?No answer/);
  expect(published).toContain("The address did not answer");
  expect(published).not.toContain("Tunnel is closed");
});

it("says once that nobody has looked, never four times", () => {
  const html = overview({
    built: {
      headline: "",
      ideas: [],
      recent: [],
      needs: [],
      vitals: unlooked,
    },
  });
  expect(html).toContain("Hallvi has not checked Example");
  expect(html).toContain("not a claim that anything is wrong");
  expect(html).not.toContain("ovl-vitals");
});
