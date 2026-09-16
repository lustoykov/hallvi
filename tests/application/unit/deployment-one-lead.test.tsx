// One lead and one control.
//
// Deployment carried the running release twice: a panel saying "Running
// 9cea081." above a second telling of the same release, and the second one
// was better. The panel exists for the case those two are different records,
// so that is the case it speaks in. The telling itself has since been
// retired with the projection behind it.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { workFor } from "@/components/server-guy/release-records";
import { DeploymentPage } from "@/components/server-guy/deployment-page";
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
  it("names the running release once, as the lead over its own list", () => {
    const only = release("r1", "9cea081");
    const html = renderToStaticMarkup(
      <ReleasesPanel
        view={view(only, only)}
        now={NOW}
        onAsk={() => undefined}
      />,
    );
    // The Transit story that used to name the release below this panel is
    // gone, so the lead is the one place the page says what is serving.
    expect(html).toContain("Running 9cea081");
    expect(html.split("Running 9cea081")).toHaveLength(2);
    // Its row in the list is marked rather than carrying a second headline.
    expect(html).toContain("serving now");
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

describe("a command that failed inside a release that holds", () => {
  const step = (id: string, status: ExecutionRecord["status"]) =>
    ({
      id,
      applicationId: "app",
      chatId: "chat",
      runId: "run",
      tool: "server_bash",
      target: null,
      input: JSON.stringify({ command: "node ./scripts/migrate.mjs" }),
      mode: "ask",
      status,
      output: "Error: column already exists",
      exitCode: 1,
      createdAt: AT,
      finishedAt: AT,
    }) as unknown as ExecutionRecord;

  it("is on the row, not only inside it", () => {
    const only = release("r1", "9cea081");
    // The release's checks passed, and one of the commands that produced it
    // did not. A row saying only "Deployed · serving now" keeps that from a
    // reader who never opens it.
    const records = [
      {
        id: "r1",
        evidence: [{ type: "execution" as const, id: "e1" }],
      },
    ] as unknown as Parameters<typeof ReleasesPanel>[0]["records"];
    const html = renderToStaticMarkup(
      <ReleasesPanel
        view={view(only, only)}
        records={records}
        executions={[step("e1", "failed")]}
        now={NOW}
        onAsk={() => undefined}
      />,
    );
    expect(html).toContain("a command in it failed");
  });

  it("says nothing of the sort when every command finished", () => {
    const only = release("r1", "9cea081");
    const records = [
      { id: "r1", evidence: [{ type: "execution" as const, id: "e1" }] },
    ] as unknown as Parameters<typeof ReleasesPanel>[0]["records"];
    const html = renderToStaticMarkup(
      <ReleasesPanel
        view={view(only, only)}
        records={records}
        executions={[step("e1", "succeeded")]}
        now={NOW}
        onAsk={() => undefined}
      />,
    );
    expect(html).not.toContain("a command in it failed");
  });
});

describe("deployment evidence and active work", () => {
  it("keeps an execution citation narrower than a conversation-turn citation", () => {
    const executions = [call("cited", "/servers"), call("other", "/pricing")];
    const records = [
      { id: "release", evidence: [{ type: "execution", id: "cited" }] },
    ] as Parameters<typeof workFor>[1];
    expect(
      workFor({ id: "release" }, records, executions).map((step) => step.id),
    ).toEqual(["cited"]);
    records[0].evidence = [{ type: "message", id: "run" }];
    expect(
      workFor({ id: "release" }, records, executions).map((step) => step.id),
    ).toEqual(["cited", "other"]);
  });

  it("does not offer a second deployment while work is active without a release record", () => {
    const execution = {
      ...call("active", "/servers"),
      status: "running" as const,
    };
    const html = renderToStaticMarkup(
      <DeploymentPage
        records={[]}
        executions={[execution]}
        applicationName="Shop"
        now={NOW}
        chrome={
          { bar: null, activity: <p>Creating the server</p> } as Parameters<
            typeof DeploymentPage
          >[0]["chrome"]
        }
        onAsk={() => undefined}
      />,
    );
    expect(html).toContain("Work is in progress");
    expect(html).toContain("Creating the server");
    expect(html).not.toContain("Ask Server Guy to deploy");
  });
});
