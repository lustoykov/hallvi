import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { architectureFromRecords } from "@/components/hallvi/architecture-records";
import { MiniMap } from "@/components/hallvi/overview-prototype/mini-map";
import { OverviewPage } from "@/components/hallvi/overview-page";
import { scenarios } from "../../fixtures/scenario-records";

describe("the Overview architecture miniature", () => {
  it("keeps the primary name whole and groups a dense storage shelf", () => {
    const paperless = scenarios().find((scenario) =>
      scenario.name.includes("Paperless-ngx"),
    )!;
    const model = architectureFromRecords({
      records: paperless.records,
      applicationId: paperless.id,
      applicationName: paperless.name,
      now: Date.now(),
    })!;
    const html = renderToStaticMarkup(
      <MiniMap model={model} reduced onOpen={() => undefined} />,
    );

    expect(html).toContain("paperless-");
    expect(html).toContain("webserver");
    expect(html).not.toContain("paperless-web…");
    expect(html).toContain('class="axo-map-volume-group"');
    expect(html).toContain(">4 data locations<");
    expect(html).not.toContain('data-part="paperless-ngx-data"');
    expect(html).not.toContain("j-release");
  });
});

it("server-renders the mapped Overview before a verified deployment", () => {
  const paperless = scenarios().find((scenario) =>
    scenario.name.includes("Paperless-ngx"),
  )!;
  const at = new Date().toISOString();
  const html = renderToStaticMarkup(
    <OverviewPage
      application={{
        id: paperless.id,
        name: paperless.name,
        repositoryUrl: "https://github.com/scenario/paperless-ngx",
        repositoryOwner: "scenario",
        repositoryName: "paperless-ngx",
        createdAt: at,
        updatedAt: at,
      }}
      records={paperless.records}
      executions={[]}
      chats={[]}
      now={Date.parse(at)}
      chrome={{ bar: null, header: null, activity: null }}
      reduced
      onOpenConversation={() => undefined}
      onOpenDestination={() => undefined}
      onAsk={() => undefined}
    />,
  );
  expect(html).toContain('aria-label="How it is doing"');
  expect(html).toContain('aria-label="Continue setup"');
});
