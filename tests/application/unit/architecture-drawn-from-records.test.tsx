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
  BOX,
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
  edges: { from: string; to: string; network: string }[] = [],
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

/** Where a wire begins: the `M x y` every one of these paths opens with. */
const startOf = (d: string) => {
  const [, x, y] = /^M(-?[\d.]+) (-?[\d.]+)/.exec(d)!;
  return { x: Number(x), y: Number(y) };
};

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

describe("every wire on the map joins two things that are drawn", () => {
  it("brings a visit in at the boundary it crosses when nothing is drawn outside", () => {
    const layout = layoutFor(
      modelOf([topology([web, volume] as never[], [disk])]),
    );
    // The server's own left edge, where the firewall wall has a door in it —
    // not the empty column to the left of it, which nothing has been drawn in.
    for (const leg of layout.legs.visit)
      for (const d of leg) expect(startOf(d).x).toBeGreaterThanOrEqual(262);
    expect(startOf(layout.legs.visit[0][0]).x).toBe(262);
  });

  it("still brings it in from the controller when one is on the map", () => {
    const layout = layoutFor(
      modelOf([
        topology(
          [part("hallvi", "controller", "Hallvi"), web, volume] as never[],
          [disk],
        ),
      ]),
    );
    expect(startOf(layout.legs.visit[0][0]).x).toBe(196);
  });

  it("draws no fork off a release that is not itself drawn", () => {
    // A map of backing services and no application: there is no release run
    // along the bottom of the server for a fork to leave, and drawing one
    // anyway left an elbow joined to nothing at either end.
    const layout = layoutFor(modelOf([topology([service] as never[])]));
    expect(layout.legs.release.flat()).toEqual([]);
    expect(layout.wires.filter((wire) => wire.journey === "release")).toEqual(
      [],
    );
  });

  it("forks the release once there is a release to fork from", () => {
    const layout = layoutFor(modelOf([topology([web, service] as never[])]));
    expect(layout.legs.release.flat().length).toBe(2);
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

describe("the doors in the firewall", () => {
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
    expect(html).toContain("1 open, 1 refused");
    // It says "refused" rather than where it would admit from, which is what
    // an open port says and is how the two came to read alike.
    expect(html).toContain("refused");
    expect(html).not.toContain("the container network");
  });

  it("says so when every port on record refuses", () => {
    const html = draw([
      topology([web] as never[]),
      door("postgres", "5432", "the container network", false),
    ]);
    expect(html).toContain("5432");
    // A finding, not the same as "rules not drawn", which reads as nobody
    // having looked.
    expect(html).toContain("1 refused");
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
    expect(draw(records)).toContain("1 unconfirmed");
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

  it("counts a port it had no room to draw rather than dropping it", () => {
    // Eight doors is more than the wall's band can hold. A port the map
    // cannot show is a port the reader cannot know about, so the count says
    // how many are missing.
    const many = Array.from({ length: 8 }, (_, index) =>
      door(`d${index}`, `${9000 + index}`, "anywhere", true),
    );
    const model = modelOf([topology([web] as never[]), ...many]);
    const layout = layoutFor(model);
    expect(layout.undrawnGates).toBeGreaterThan(0);
    const drawn = model.parts.filter(
      (part) => part.kind === "gate" && layout.rects[part.id],
    ).length;
    expect(drawn + layout.undrawnGates).toBe(8);
    expect(draw([topology([web] as never[]), ...many])).toContain(
      `${layout.undrawnGates} more on record`,
    );
  });

  it("counts a port that refuses as refused, not as a door that is open", () => {
    const html = draw([
      topology([web] as never[]),
      door("https", "443", "anywhere", true),
      door("postgres", "5432", "the container network", false),
    ]);
    expect(html).toContain("1 open, 1 refused");
  });

  it("cuts the wall open for a door that admits and not for one that refuses", () => {
    const shut = layoutFor(
      modelOf([
        topology([web] as never[]),
        door("https", "443", "anywhere", true),
        door("postgres", "5432", "the container network", false),
      ]),
    ).wall;
    const openToo = layoutFor(
      modelOf([
        topology([web] as never[]),
        door("https", "443", "anywhere", true),
        door("alt", "8443", "anywhere", true),
      ]),
    ).wall;
    // The two doorways the journeys cross are drawn either way; an extra
    // door earns a third gap only by being open.
    expect(shut.wall.split("M").length - 1).toBe(3);
    expect(openToo.wall.split("M").length - 1).toBe(4);
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

  it("keeps a port that refuses off the path a visit travels", () => {
    const layout = layoutFor(
      modelOf([
        topology([web] as never[]),
        door("https", "443", "anywhere", true),
        door("postgres", "5432", "the container network", false),
      ]),
    );
    expect(layout.stops.visit).toContain("gate:http");
    expect(layout.stops.visit).not.toContain("postgres");
  });

  it("says the rules are not drawn rather than counting zero", () => {
    const html = draw([topology([web] as never[])]);
    expect(html).toContain("rules not drawn");
  });
});

describe("what a port leads to", () => {
  const gate = (id: string, name: string) =>
    ({ id, kind: "gate", name, role: "a way in", plain: "a way in" }) as never;
  const service = part("db", "private", "PostgreSQL");

  it("draws a wire to what a record says is behind the port", () => {
    const layout = layoutFor(
      modelOf([
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
        door("dbp", "5432", "the office network", true),
      ]),
    );
    const wire = layout.legs.visit
      .flat()
      .find((d) => d.startsWith(`M${BOX.http.x + BOX.http.w} `));
    expect(wire, "a wire leaves the port that has an edge").toBeTruthy();
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
    expect(layoutFor(model).legs.visit.flat()).toHaveLength(1);
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
    expect(
      layoutFor(model)
        .legs.visit.flat()
        .some((d) => d.startsWith(`M${BOX.http.x + BOX.http.w} `)),
    ).toBe(false);
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
    expect(layoutFor(model).legs.data.flat().length).toBe(1);
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
    expect(layoutFor(model).legs.data).toEqual([]);
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
