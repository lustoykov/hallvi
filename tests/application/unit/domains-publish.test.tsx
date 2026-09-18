// The one action the Domains page is for.
//
// It has three honest offers and they are not interchangeable: an
// invitation when nothing is connected, unfinished work when a name is
// half-published, and a way back when the name serves the application.
// Offering "Publish at a domain" over a half-published name reads as
// starting again, and offering it over a working one offers nothing at all.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CallersDirection } from "@/components/hallvi/reach-prototype/callers";
import { PageHead } from "@/components/hallvi/deployment-prototype/page-head";
import {
  publishOffer,
  type DomainState,
  type ReachView,
} from "@/components/hallvi/reach-prototype/reach-story";

const base: ReachView = {
  name: "Paper",
  address: null,
  domain: null,
  tls: { state: "unknown", detail: null },
  audience: "controller",
  controllerIp: null,
  callers: [],
  doors: [],
  processes: [],
  database: null,
  ssh: {
    word: "Nobody has tried SSH",
    tone: "planned",
    detail: "",
    told: "plan",
  },
  firewall: {
    state: "asked",
    provider: "unknown",
    name: null,
    at: null,
    detail: "",
  },
  guards: [],
  holes: [],
  invented: null,
};

const named = (state: DomainState["state"]): ReachView => ({
  ...base,
  audience: state === "serving" ? "public" : "controller",
  address: state === "serving" ? "https://paper.example.com" : null,
  domain: {
    name: "paper.example.com",
    provider: "cloudflare",
    state,
    detail: "",
  },
});

const render = (story: ReachView) =>
  renderToStaticMarkup(
    <CallersDirection
      story={story}
      now={Date.parse("2026-09-15T12:00:00.000Z")}
      head={null}
      activity={null}
      onAsk={() => {}}
      onOpenDestination={() => {}}
    />,
  );

describe("which offer the records put the page in", () => {
  it("invites publishing when no name is connected", () => {
    const offer = publishOffer(base);
    expect(offer.label).toBe("Publish at a domain…");
    expect(offer.primary).toBe(true);
  });

  // The owner types the hostname; nothing here should guess one for them.
  it("leaves the hostname to be typed rather than inventing one", () => {
    expect(publishOffer(base).draft).toBe(
      "Publish Paper at my own domain name. The hostname is: ",
    );
  });

  it("offers to finish the job while a name is not serving", () => {
    for (const state of [
      "pending-dns",
      "resolving",
      "unreachable",
      "failed",
    ] as const) {
      const offer = publishOffer(named(state));
      expect(offer.label).toBe("Finish publishing it");
      expect(offer.primary).toBe(false);
      expect(offer.draft).toContain("paper.example.com is not serving Paper");
    }
  });

  it("offers the way back only once the name serves the application", () => {
    const offer = publishOffer(named("serving"));
    expect(offer.label).toBe("Make it private again");
    expect(offer.draft).toContain("withdraw paper.example.com");
    // Withdrawing is not a licence to tidy up the rest of the server.
    expect(offer.draft).toContain("leave SSH and anything you did not create");
  });
});

describe("what the page says about it", () => {
  it("draws the offer for the state it is in", () => {
    expect(render(base)).toContain("Publish at a domain");
    expect(render(named("resolving"))).toContain("Finish publishing it");
    expect(render(named("serving"))).toContain("Make it private again");
  });

  it("no longer says connecting a name is unimplemented", () => {
    expect(render(base)).not.toContain("not implemented");
  });

  it("does not name an open port on a page that read no port", () => {
    expect(render(named("serving"))).not.toContain("Port 80 is open");
  });
});

// The header's own copy. A published address has no tunnel to be closed,
// and the pages that are not about reach at all pass restricted as false,
// so only the address itself can settle which failure this is.
describe("what the header says when the way in has stopped working", () => {
  const head = (openUrl: string | null, restricted: boolean) =>
    renderToStaticMarkup(
      <PageHead
        bar={null}
        title="Storage"
        name="Paper"
        openUrl={openUrl}
        restricted={restricted}
        reachable="closed"
        onReopen={() => {}}
      />,
    );

  it("calls a loopback address a tunnel, on a page that says nothing about reach", () => {
    const html = head("http://127.0.0.1:38123", false);
    expect(html).toContain("The tunnel is closed");
    // The same words the release band uses for the same action.
    expect(html).toContain("Open the connection again");
  });

  it("calls a published address an address", () => {
    const html = head("https://paper.example.com", false);
    expect(html).toContain("The address did not answer");
    expect(html).not.toContain("tunnel");
  });

  it("offers nothing to click either way", () => {
    expect(head("https://paper.example.com", false)).not.toContain("<a ");
    expect(head("http://127.0.0.1:38123", true)).not.toContain("<a ");
  });
});
