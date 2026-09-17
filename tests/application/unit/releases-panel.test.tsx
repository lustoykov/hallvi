// The one thing on this page the reader is most likely to click.
//
// The release card offered "Open app" over a live URL while the page header
// three lines above said the tunnel was closed. Both were reading access —
// one from a record, one from an actual probe — and only the probe knows
// whether the address answers now.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ReleasesPanel } from "@/components/haldur/releases-panel";
import type { ReleaseView } from "@/components/haldur/release-records";

const AT = "2026-09-15T10:00:00.000Z";
const NOW = Date.parse("2026-09-15T12:00:00.000Z");

const view = (mode: "private" | "public"): ReleaseView => ({
  running: {
    id: "r1",
    at: AT,
    revision: "a1b2c3d4e5f6",
    short: "a1b2c3d",
    image: "ghcr.io/qa/shop:a1b2c3d",
    server: "shop-host",
    changes: ["First release"],
    note: "",
    outcome: "deployed",
    checks: [{ label: "The container started", passed: true }],
  },
  latest: null,
  all: [],
  access: {
    url: mode === "private" ? "http://127.0.0.1:18000" : "https://shop.example",
    mode,
    at: AT,
    localOnly: mode === "private",
  },
});

const draw = (props: Parameters<typeof ReleasesPanel>[0]) =>
  renderToStaticMarkup(<ReleasesPanel {...props} />);

describe("offering a way in", () => {
  it("offers reopening, not a URL, when the tunnel is closed", () => {
    const html = draw({
      view: view("private"),
      now: NOW,
      reachable: "closed",
      onReopen: () => undefined,
      onAsk: () => undefined,
    });
    // Not "Reopen access": the owner asked what that meant, and the honest
    // answer is that a connection this Mac holds open has dropped.
    expect(html).toContain("Open the connection again");
    expect(html).toContain("The tunnel is closed");
    // Never a link to an address that has just been found not to answer.
    expect(html).not.toContain('href="http://127.0.0.1:18000"');
  });

  it("links the address when the tunnel answers", () => {
    const html = draw({
      view: view("private"),
      now: NOW,
      reachable: "open",
      onAsk: () => undefined,
    });
    expect(html).toContain('href="http://127.0.0.1:18000"');
    expect(html).toContain("from this Mac only");
  });

  it("says it is still checking rather than claiming the tunnel is up", () => {
    const html = draw({
      view: view("private"),
      now: NOW,
      reachable: "checking",
      onAsk: () => undefined,
    });
    expect(html).toContain("checking that the tunnel still answers");
  });

  it("does not withhold a public address because this Mac's tunnel is down", () => {
    // A public address is answered by the server, whatever this Mac is doing.
    const html = draw({
      view: view("public"),
      now: NOW,
      reachable: "closed",
      onReopen: () => undefined,
      onAsk: () => undefined,
    });
    expect(html).toContain('href="https://shop.example"');
    expect(html).not.toContain("Reopen access");
  });
});
