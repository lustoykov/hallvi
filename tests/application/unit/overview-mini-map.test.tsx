import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { architectureFromRecords } from "@/components/haldur/architecture-records";
import { MiniMap } from "@/components/haldur/overview-prototype/mini-map";
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
