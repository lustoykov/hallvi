// One lead and one control, and the provider's query string kept inside.
//
// Deployment carried the running release twice: a panel saying "Running
// 9cea081." above a story headed "Paperless-ngx 3.1.3 is deployed from commit
// 9cea0811", which is the same release twice and the second one is better.
// The panel exists for the case those two are different records, so that is
// the case it speaks in.
//
// The story also printed each provider request exactly as it went out, so
// "what happened to my application" arrived as
// /servers?label_selector=server-guy-application=<uuid> wrapped over two
// lines of a summary row.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { deploymentFromRecords } from "@/components/server-guy/deployment-records";
import { ReleasesPanel } from "@/components/server-guy/releases-panel";
import type {
  Release,
  ReleaseView,
} from "@/components/server-guy/release-records";
import type { ExecutionRecord } from "@/server/operator-execution";

const AT = "2026-09-15T10:00:00.000Z";
const NOW = Date.parse("2026-09-15T12:00:00.000Z");

const release = (id: string, short: string): Release => ({
  id,
  at: AT,
  revision: `${short}0000000000000`,
  short,
  image: null,
  server: "shop-host",
  changes: [],
  note: "",
  outcome: "deployed",
  checks: [],
});

const view = (running: Release, latest: Release): ReleaseView => ({
  running,
  latest,
  all: [latest, running].filter(
    (item, index, list) =>
      list.findIndex((one) => one.id === item.id) === index,
  ),
  access: null,
});

describe("one current-release lead", () => {
  it("says nothing when the story below already names the release", () => {
    const only = release("r1", "9cea081");
    const html = renderToStaticMarkup(
      <ReleasesPanel
        view={view(only, only)}
        now={NOW}
        onAsk={() => undefined}
      />,
    );
    expect(html).not.toContain("Running 9cea081");
  });

  it("leads when the running release is not the latest attempt", () => {
    const running = release("r1", "9cea081");
    const latest = { ...release("r2", "ffffff0"), outcome: "failed" as const };
    const html = renderToStaticMarkup(
      <ReleasesPanel
        view={view(running, latest)}
        now={NOW}
        onAsk={() => undefined}
      />,
    );
    expect(html).toContain("Last verified release: 9cea081.");
    expect(html).toContain("failed");
  });
});

const call = (id: string, target: string): ExecutionRecord =>
  ({
    id,
    applicationId: "app",
    chatId: "chat",
    runId: "run",
    tool: "hetzner_request",
    target,
    input: JSON.stringify({ path: target }),
    mode: "ask",
    status: "succeeded",
    output: "",
    exitCode: 0,
    createdAt: AT,
    finishedAt: AT,
  }) as unknown as ExecutionRecord;

function story(executions: ExecutionRecord[]) {
  return deploymentFromRecords({
    records: [],
    executions,
    applicationName: "Shop",
    now: NOW,
  });
}

describe("a provider request in the story", () => {
  it("is named by its resource, not by its query string", () => {
    const phases = story([
      call("a", "/servers?label_selector=server-guy-application=5dd5a76f"),
    ]).phases;
    expect(phases[0].detail).toBe("Servers, narrowed by a filter");
    expect(phases[0].detail).not.toContain("label_selector");
  });

  it("keeps the exact path inside the row, where evidence belongs", () => {
    const phases = story([
      call("a", "/servers?label_selector=server-guy-application=5dd5a76f"),
    ]).phases;
    expect(phases[0].lines[0].text).toBe(
      "/servers?label_selector=server-guy-application=5dd5a76f",
    );
  });

  it("does not invent a filter where there is none", () => {
    expect(story([call("a", "/pricing")]).phases[0].detail).toBe("Prices");
  });

  it("falls back to the path's own word for a resource it does not know", () => {
    expect(story([call("a", "/load_balancers")]).phases[0].detail).toBe(
      "load balancers",
    );
  });
});
