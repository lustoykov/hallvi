// The one action the Access page is for.
//
// It has three honest offers and they are not interchangeable: an
// invitation when nothing is connected, unfinished work when a name is
// half-published, and a way back when the name serves the application.
// Offering "Publish at a domain" over a half-published name reads as
// starting again, and offering it over a working one offers nothing at all.

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";

import { AccessPage } from "@/components/hallvi/access-page";
import { PageHead } from "@/components/hallvi/deployment-prototype/page-head";
import {
  publishOffer,
  type DomainState,
} from "@/components/hallvi/reach-records";
import type { SavedInformation } from "@/server/operator-data";

import {
  APP,
  NOW,
  check,
  fact,
  record,
  resetRecordIds,
  states,
} from "../fixtures/records";

beforeEach(resetRecordIds);

const domain = (state: DomainState["state"]): DomainState => ({
  name: "paper.example.com",
  provider: "cloudflare",
  state,
  detail: "",
});

/** A private application nobody has published: no name, a tunnel address. */
const tunnelled = () =>
  record({
    about: [{ kind: "application", id: APP }],
    url: "http://127.0.0.1:8080",
    content: {
      kind: "application-access",
      mode: "private",
      server: "host-1",
      localPort: 8080,
      remotePort: 3000,
    },
  });

/** A name on record, at whichever point of publishing the checks establish. */
const named = (serving: boolean): SavedInformation[] => [
  serving
    ? record({
        about: [{ kind: "application", id: APP }],
        url: "https://paper.example.com",
        content: {
          kind: "application-access",
          mode: "public",
          server: "host-1",
        },
      })
    : tunnelled(),
  states(
    { kind: "domain", id: "paper-example-com" },
    {
      facts: [fact("name", "paper.example.com")],
      checks: serving
        ? [check("resolves", "passed"), check("serves", "passed")]
        : [check("resolves", "passed")],
    },
  ),
];

const render = (records: SavedInformation[]) =>
  renderToStaticMarkup(
    <AccessPage
      records={records}
      applicationId={APP}
      applicationName="Paper"
      now={NOW}
      chrome={{ bar: null, header: null, activity: null }}
      onAsk={() => {}}
    />,
  );

describe("which offer the records put the page in", () => {
  it("invites publishing when no name is connected", () => {
    const offer = publishOffer({ name: "Paper", domain: null });
    expect(offer.label).toBe("Publish at a domain…");
    expect(offer.primary).toBe(true);
  });

  // The owner types the hostname; nothing here should guess one for them.
  it("leaves the hostname to be typed rather than inventing one", () => {
    expect(publishOffer({ name: "Paper", domain: null }).draft).toBe(
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
      const offer = publishOffer({ name: "Paper", domain: domain(state) });
      expect(offer.label).toBe("Finish publishing it");
      expect(offer.primary).toBe(false);
      expect(offer.draft).toContain("paper.example.com is not serving Paper");
    }
  });

  // A name that answered, a while ago, is published. What has aged is the
  // evidence, and "finish publishing it" claims a finished job is unfinished.
  it("offers another look at a name whose reading has aged", () => {
    const offer = publishOffer({
      name: "Paper",
      domain: {
        ...domain("resolving"),
        lastServedAt: "2026-09-06T11:55:00.000Z",
      },
    });
    expect(offer.label).toBe("Check it from outside");
    expect(offer.draft).toContain("answered when it was last checked");
  });

  it("offers the way back only once the name serves the application", () => {
    const offer = publishOffer({ name: "Paper", domain: domain("serving") });
    expect(offer.label).toBe("Make it private again");
    expect(offer.draft).toContain("withdraw paper.example.com");
    // Withdrawing is not a licence to tidy up the rest of the server.
    expect(offer.draft).toContain("leave SSH and anything you did not create");
  });
});

describe("what the page says about it", () => {
  it("draws the offer for the state the records put it in", () => {
    expect(render([tunnelled()])).toContain("Publish at a domain");
    expect(render(named(false))).toContain("Finish publishing it");
    expect(render(named(true))).toContain("Make it private again");
  });

  // On an application no name reaches, publishing is what the board is for,
  // so it leads rather than sitting beside the Open link.
  it("leads with the invitation when nothing reaches the application", () => {
    expect(render([tunnelled()])).toContain("Only this computer reaches Paper");
  });

  it("keeps the offer beside the Open link once a name is on record", () => {
    expect(render(named(false))).not.toContain("Only this computer reaches");
  });

  it("no longer says connecting a name is unimplemented", () => {
    expect(render([tunnelled()])).not.toContain("not implemented");
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
