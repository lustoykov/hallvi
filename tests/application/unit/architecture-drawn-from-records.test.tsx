// What the map draws when the topology is not the only thing that knows.
//
// A topology is composition: Pi writes what the application is made of. The
// machine it runs on, the watcher outside it and the place its copies land are
// each written down under their own subject instead — which is how Backups
// could say "Data on hetzner-999999" and Monitoring "Watcher checked 4 min
// ago" while Architecture drew a server card with no name in its header, no
// watcher at all, and nothing off the server.
//
// And what the map must never draw is a line that starts or ends in blank
// canvas. An edge arriving out of nowhere reads as a piece the page failed to
// render, which is worse than saying nothing: the reader cannot tell a bug
// from a part Pi has not looked at.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { architectureFromRecords } from "@/components/hallvi/architecture-records";
import {
  JourneyDirection,
  layoutFor,
} from "@/components/hallvi/architecture-prototype/journey-v2";
import type { SavedInformation } from "@/server/operator-data";

const APPLICATION = "8f4a1c02-5d3e-4f8a-9b27-6c1e0a44d9f3";
const NOW = Date.parse("2026-09-20T18:00:00.000Z");
const AT = "2026-09-20T17:55:00.000Z";
const EARLIER = "2026-09-19T17:55:00.000Z";

let counter = 0;
const fact = (key: string, value: string) =>
  ({
    key,
    label: key,
    value,
    claim: "configuration",
    basis: "observed",
  }) as never;
const check = (key: string, status: "passed" | "failed") =>
  ({ key, label: key, status, claim: "liveness", basis: "observed" }) as never;

function states(
  ref: { kind: string; id: string },
  input: { at?: string; title: string; facts?: never[]; checks?: never[] },
): SavedInformation {
  const at = input.at ?? AT;
  return {
    id: `rec-${++counter}`,
    applicationId: APPLICATION,
    title: input.title,
    body: "",
    evidence: [],
    establishedAt: at,
    createdAt: at,
    updatedAt: at,
    retiredAt: null,
    presentation: {
      states: { ref, presence: "present" },
      views: ["architecture"],
      role: "observation",
      status: "verified",
      checks: input.checks ?? [],
      facts: input.facts ?? [],
    },
  } as unknown as SavedInformation;
}

const part = (id: string, kind: string, name: string) =>
  ({ id, kind, name, role: "a part", plain: "a part" }) as never;

/** A map of exactly the parts named, and nothing else. */
function topology(
  parts: never[],
  edges: { from: string; to: string; network: string; label?: string }[] = [],
): SavedInformation {
  return {
    id: `rec-${++counter}`,
    applicationId: APPLICATION,
    title: "How this is put together",
    body: "",
    evidence: [],
    establishedAt: AT,
    createdAt: AT,
    updatedAt: AT,
    retiredAt: null,
    presentation: {
      states: {
        ref: { kind: "application", id: APPLICATION },
        presence: "present",
      },
      views: ["architecture"],
      role: "outcome",
      status: "verified",
      checks: [],
      content: { kind: "topology", from: "observed", parts, edges } as never,
    },
  } as unknown as SavedInformation;
}

const modelOf = (records: SavedInformation[]) =>
  architectureFromRecords({
    records,
    applicationId: APPLICATION,
    applicationName: "Shop",
    now: NOW,
  })!;

const draw = (records: SavedInformation[]) =>
  renderToStaticMarkup(
    <JourneyDirection
      model={modelOf(records)}
      onOpenDestination={() => undefined}
      onAsk={() => undefined}
    />,
  );

const door = (id: string, port: string, sources: string, open: boolean) =>
  states(
    { kind: "door", id },
    {
      title: open
        ? `Port ${port} is open to everyone`
        : `Port ${port} refuses from outside`,
      facts: [fact("port", port), fact("sources", sources)] as never[],
      checks: [check(open ? "open" : "refused", "passed")] as never[],
    },
  );

const web = part("shop-web", "web", "Shop");
const volume = part("shop-data", "volume", "Shop data");
const service = part("shop-db", "private", "PostgreSQL");
const disk = { from: "shop-web", to: "shop-data", network: "disk" };

describe("recorded routes", () => {
  it("does not invent an inbound or release route when none was recorded", () => {
    const layout = layoutFor(
      modelOf([topology([web, volume] as never[], [disk])]),
    );
    expect(layout.legs.visit).toEqual([]);
    expect(layout.legs.release).toEqual([]);
    expect(layout.legs.data.flat()).toHaveLength(1);
  });

  it("draws the gateway and preserves both public and loopback endpoint labels", () => {
    const records = [
      topology(
        [
          part("internet", "source", "Internet"),
          part("caddy", "tls", "Caddy"),
          web,
        ] as never[],
        [
          {
            from: "internet",
            to: "caddy",
            network: "public",
            label: "HTTPS 443",
          },
          {
            from: "caddy",
            to: "shop-web",
            network: "loopback",
            label: "127.0.0.1:8000",
          },
        ],
      ),
    ];
    const model = modelOf(records);
    expect(layoutFor(model).rects.caddy).toBeDefined();
    expect(layoutFor(model).legs.visit.flat()).toHaveLength(2);
    const html = draw(records);
    expect(html).toContain("HTTPS 443");
    expect(html).toContain("127.0.0.1:8000");
    expect(html).not.toContain("Where the code came from");
    expect(html).not.toContain('class="axj2-wall"');
  });
});

describe("the machine the application runs on", () => {
  it("is named from its own record when the map does not name it", () => {
    const records = [
      topology([web, volume] as never[], [disk]),
      states(
        { kind: "host", id: "hetzner-999999" },
        {
          title: "The host is up",
          facts: [fact("region", "Helsinki (hel1)")] as never[],
          checks: [check("ssh", "passed")] as never[],
        },
      ),
    ];
    const model = modelOf(records);
    expect(model.byId.host?.name).toBe("hetzner-999999");
    expect(model.region).toBe("Helsinki (hel1)");
    expect(draw(records)).toContain("hetzner-999999");
  });

  it("says nobody has looked rather than leaving its header blank", () => {
    const html = draw([topology([web, volume] as never[], [disk])]);
    expect(
      modelOf([topology([web, volume] as never[], [disk])]).byId.host,
    ).toBeUndefined();
    expect(html).toContain("This server");
    expect(html).toContain("Not assessed");
  });
});

describe("whether anything is watching", () => {
  it("draws the watcher on record instead of the placeholder", () => {
    const records = [
      topology([web] as never[]),
      states(
        { kind: "monitor", id: "uptime" },
        {
          title: "An uptime check is watching",
          facts: [fact("interval", "60 s")] as never[],
          checks: [check("answering", "passed")] as never[],
        },
      ),
    ];
    const model = modelOf(records);
    expect(model.monitored).toBe(true);
    expect(model.gaps).toEqual([]);
    const html = draw(records);
    expect(html).toContain("Something is watching this");
    expect(html).not.toContain("Nothing is watching this");
  });

  it("keeps the placeholder when nobody has looked", () => {
    const html = draw([topology([web] as never[])]);
    expect(html).toContain("Nothing is watching this");
    expect(html).toContain("Not assessed");
  });
});

describe("connection observations, separate from firewall policy", () => {
  it("draws every way in on record, not only the first", () => {
    // The map had two slots and put every non-SSH door in the first of them,
    // so a second one kept its own id, got no place, and was never drawn.
    const html = draw([
      topology([web] as never[]),
      door("https", "443", "anywhere", true),
      door("alt", "8443", "the office", true),
    ]);
    expect(html).toContain("443");
    expect(html).toContain("8443");
    expect(html).toContain("anywhere");
    expect(html).toContain("the office");
  });

  it("draws a port that refuses, and says so in as many words", () => {
    // This page is the overview. Leaving the port off had the firewall's own
    // count referring to something nobody could see — and the fault was never
    // that it was drawn, but that it was drawn as a peer of a port that
    // answers, with only a missing gap in a dashed line telling them apart.
    const html = draw([
      topology([web] as never[]),
      door("https", "443", "anywhere", true),
      door("postgres", "5432", "the container network", false),
    ]);
    expect(html).toContain("443");
    expect(html).toContain("5432");
    expect(html).toContain("Open when checked");
    expect(html).toContain("Did not connect when checked");
    // It says "refused" rather than where it would admit from, which is what
    // an open port says and is how the two came to read alike.
    expect(html).toContain("refused");
    expect(html).toContain("Recorded scope: ");
  });

  it("says so when every port on record refuses", () => {
    const html = draw([
      topology([web] as never[]),
      door("postgres", "5432", "the container network", false),
    ]);
    expect(html).toContain("5432");
    // A finding, not the same as "rules not drawn", which reads as nobody
    // having looked.
    expect(html).toContain("Did not connect when checked");
  });

  it("does not count an unsuccessful check as an open or refused port", () => {
    const records = [
      topology([web] as never[]),
      states(
        { kind: "door", id: "unknown" },
        {
          title: "The port was checked without an answer",
          facts: [fact("port", "8080")] as never[],
          checks: [check("open", "failed")] as never[],
        },
      ),
    ];
    expect(
      modelOf(records).parts.find((part) => part.kind === "gate")?.admits,
    ).toBe("unknown");
    expect(draw(records)).toContain("Not confirmed");
  });

  it("uses the latest connection result when a door changes state", () => {
    const records = [
      topology([web] as never[]),
      states(
        { kind: "door", id: "site" },
        {
          at: EARLIER,
          title: "The port refused",
          checks: [check("refused", "passed")] as never[],
        },
      ),
      states(
        { kind: "door", id: "site" },
        {
          title: "The port answered",
          checks: [check("open", "passed")] as never[],
        },
      ),
    ];
    expect(
      modelOf(records).parts.find((part) => part.kind === "gate")?.admits,
    ).toBe("open");
  });

  it("shows every check even when there are more than fit on a diagram boundary", () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      door(`d${index}`, `${9000 + index}`, "anywhere", true),
    );
    const html = draw([topology([web] as never[]), ...many]);
    for (let port = 9000; port < 9008; port++)
      expect(html).toContain(String(port));
    expect(html).not.toContain("more on record");
  });

  it("counts a port that refuses as refused, not as a door that is open", () => {
    const html = draw([
      topology([web] as never[]),
      door("https", "443", "anywhere", true),
      door("postgres", "5432", "the container network", false),
    ]);
    expect(html).toContain("Open when checked");
    expect(html).toContain("Did not connect when checked");
  });

  it("does not turn connection results into firewall claims or assume a private service has no open ports", () => {
    const html = draw([
      topology([web, service] as never[]),
      door("postgres", "5432", "container network", false),
    ]);
    expect(html).toContain("Recorded results, not firewall rules");
    expect(html).not.toContain('class="axj2-wall"');
    expect(html).not.toContain("no ports open");
    expect(html).toContain("Destination not recorded");
  });

  it("reads a way in Pi called access, when that is what it wrote", () => {
    const html = draw([
      topology([web] as never[]),
      states(
        { kind: "access", id: "tunnel" },
        {
          title: "Reachable through the tunnel only",
          facts: [fact("port", "8080"), fact("sources", "Hallvi")] as never[],
          checks: [check("open", "passed")] as never[],
        },
      ),
    ]);
    expect(html).toContain("8080");
  });

  it("keeps a distinct access beside a door", () => {
    const records = [
      topology([web] as never[]),
      door("https", "443", "anywhere", true),
      states(
        { kind: "access", id: "tunnel" },
        {
          title: "The private way in",
          facts: [fact("port", "8080")] as never[],
          checks: [check("open", "passed")] as never[],
        },
      ),
    ];
    expect(
      modelOf(records).parts.filter((part) => part.kind === "gate"),
    ).toHaveLength(2);
    expect(draw(records)).toContain("8080");
  });

  it("reads sources by their key when Pi gives the fact a human label", () => {
    const records = [
      topology([web] as never[]),
      states(
        { kind: "door", id: "private" },
        {
          title: "Private port",
          facts: [
            fact("port", "5432"),
            {
              key: "sources",
              label: "Allowed from",
              value: "the office network",
              claim: "configuration",
              basis: "observed",
            } as never,
          ] as never[],
          checks: [check("open", "passed")] as never[],
        },
      ),
    ];
    expect(
      modelOf(records).parts.find((part) => part.kind === "gate")?.sources,
    ).toBe("the office network");
    expect(draw(records)).toContain("the office network");
  });

  it("keeps unattached checks off the animated route regardless of result", () => {
    const layout = layoutFor(
      modelOf([
        topology([web] as never[]),
        door("https", "443", "anywhere", true),
        door("postgres", "5432", "container network", false),
      ]),
    );
    expect(layout.stops.visit).not.toContain("gate:http");
    expect(layout.stops.visit).not.toContain("postgres");
  });

  it("says the rules are not drawn rather than counting zero", () => {
    const html = draw([topology([web] as never[])]);
    expect(html).toContain("No connection checks recorded.");
  });
});

describe("what a port leads to", () => {
  const gate = (id: string, name: string) =>
    ({ id, kind: "gate", name, role: "a way in", plain: "a way in" }) as never;
  const service = part("db", "private", "PostgreSQL");

  it("shows the recorded destination beside its connection result", () => {
    const records = [
      topology([web, service, gate("dbp", "Port 5432")] as never[], [
        { from: "dbp", to: "db", network: "private" },
      ]),
      door("dbp", "5432", "the office", true),
    ];
    expect(
      modelOf(records).parts.find((part) => part.kind === "gate")?.serves,
    ).toBe("db");
    expect(draw(records)).toMatch(/Open when checked<\/span><span>PostgreSQL/);
  });

  it("never infers it from the port's name", () => {
    // A door Pi called `postgres` is not evidence that PostgreSQL is behind
    // it. Only an edge says so.
    const model = modelOf([
      topology([web, service, gate("postgres", "Port 5432")] as never[], []),
      door("postgres", "5432", "the office network", true),
    ]);
    const port = model.parts.find((one) => one.kind === "gate")!;
    expect(port.serves).toBeUndefined();
    expect(layoutFor(model).legs.visit.flat()).toHaveLength(0);
  });

  it("draws no wire out of a port that refuses", () => {
    // What it would have reached is in its inspector. A line from it would
    // draw a route nothing has travelled.
    const model = modelOf([
      topology(
        [
          web,
          service,
          gate("front", "Port 443"),
          gate("dbp", "Port 5432"),
        ] as never[],
        [{ from: "dbp", to: "db", network: "private" }],
      ),
      door("front", "443", "anywhere", true),
      door("dbp", "5432", "the office network", false),
    ]);
    const port = model.parts.find((one) => one.id === "dbp")!;
    expect(port.serves).toBe("db");
    expect(layoutFor(model).legs.visit.flat()).toEqual([]);
  });

  it("still draws a door on record that the map did not name", () => {
    // Deriving doors used to stop entirely the moment the topology declared
    // one gate, which silently dropped every other door on record.
    const html = draw([
      topology([web, gate("front", "Port 443")] as never[]),
      door("front", "443", "anywhere", true),
      door("stray", "9090", "anywhere", true),
    ]);
    expect(html).toContain("443");
    expect(html).toContain("9090");
  });
});

describe("the place off the server that copies reach", () => {
  const copy = (id: string, at: string, kind: string, where: string) =>
    states(
      { kind: "backup-copy", id },
      {
        at,
        title: "A copy was written",
        facts: [
          fact("destination", where),
          fact("destination-kind", kind),
        ] as never[],
        checks: [check("written", "passed")] as never[],
      },
    );

  it("is drawn from the newest copy that reached one", () => {
    const records = [
      topology([web, volume] as never[], [disk]),
      copy("yesterday", EARLIER, "off-site", "Cloudflare R2"),
      copy("today", AT, "off-site", "Cloudflare R2"),
    ];
    const model = modelOf(records);
    expect(model.byId.offsite?.name).toBe("Cloudflare R2");
    const html = draw(records);
    expect(html).toContain("Off the server");
    expect(html).toContain("Cloudflare R2");
    expect(layoutFor(model).legs.data.flat().length).toBe(2);
  });

  it("is not drawn when the newest copy stayed on the server", () => {
    // Backups' own rule, and the reason for it: an off-site copy from last
    // week does not move this morning's local copy off the server.
    const records = [
      topology([web, volume] as never[], [disk]),
      copy("last-week", EARLIER, "off-site", "s3://shop-backups"),
      copy("last-night", AT, "same-server", "/var/backups/shop"),
    ];
    const model = modelOf(records);
    expect(model.byId.offsite).toBeUndefined();
    expect(layoutFor(model).legs.data.flat()).toHaveLength(1);
    const html = draw(records);
    expect(html).not.toContain("Off the server");
    expect(html).not.toContain("s3://shop-backups");
  });

  it("is not drawn, and reads as unassessed, when nobody has looked", () => {
    const model = modelOf([topology([web, volume] as never[], [disk])]);
    expect(model.byId.offsite).toBeUndefined();
    expect(
      model.journeys.find((journey) => journey.id === "data")?.summary,
    ).toContain("has not been assessed");
  });
});
