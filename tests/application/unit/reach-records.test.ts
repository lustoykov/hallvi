// Domains and Security, read from records.
//
// The sign of a refusal is the thing to get right. A port that refused a
// connection is the door doing its job; a page that coloured every failed
// connection red would report a working firewall as a broken one. And no
// firewall record is a hole, not a tick — an unread policy is unknown.

import { beforeEach, describe, expect, it } from "vitest";

import { reachFromRecords } from "@/components/server-guy/reach-records";
import {
  APP,
  NOW,
  check,
  fact,
  record,
  resetRecordIds,
  states,
} from "../fixtures/records";

const read = (records: Parameters<typeof reachFromRecords>[0]["records"]) =>
  reachFromRecords({
    records,
    applicationId: APP,
    applicationName: "Shop",
    now: NOW,
  });

beforeEach(resetRecordIds);

const privateAccess = () =>
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

describe("security", () => {
  it("says nothing has been established, not that nothing can reach in", () => {
    const story = read([]);
    expect(story.doors).toEqual([]);
    expect(story.firewall.state).toBe("asked");
    expect(story.holes.map((hole) => hole.id)).toContain("nothing");
    expect(story.holes.find((hole) => hole.id === "nothing")?.detail).toMatch(
      /not the same as nothing being able to/,
    );
  });

  it("counts a refused port as a guard, not a failure", () => {
    const at = "2026-09-13T11:50:00.000Z";
    const story = read([
      states(
        { kind: "door", id: "public-3000" },
        {
          at,
          facts: [fact("port", "3000")],
          checks: [
            check("refused", "passed", "reachability", {
              detail: "curl from outside timed out",
            }),
          ],
        },
      ),
    ]);
    expect(story.doors[0].reach).toBe("closed");
    expect(story.guards).toEqual([
      {
        id: "refused:public-3000",
        title: "Port 3000 refuses connections",
        at,
        detail: "curl from outside timed out",
      },
    ]);
    expect(story.holes.some((hole) => hole.id.startsWith("open:"))).toBe(false);
  });

  it("calls a port open to everyone a hole", () => {
    const story = read([
      states(
        { kind: "door", id: "http" },
        {
          facts: [fact("port", "80"), fact("sources", "0.0.0.0/0")],
          checks: [check("open", "passed")],
        },
      ),
    ]);
    expect(story.doors[0].reach).toBe("internet");
    expect(story.holes.some((hole) => hole.id === "open:http")).toBe(true);
  });

  it("treats an unread firewall as a hole rather than a tick", () => {
    const story = read([privateAccess()]);
    expect(story.firewall.state).toBe("asked");
    expect(story.holes.some((hole) => hole.id === "firewall")).toBe(true);
  });

  it("reads a firewall back when a record states one", () => {
    const at = "2026-09-13T11:45:00.000Z";
    const story = read([
      states(
        { kind: "firewall", id: "sg-38e37237" },
        {
          at,
          facts: [
            fact("provider", "Hetzner"),
            fact("rules", "22 from anywhere; everything else denied"),
          ],
          checks: [check("configured", "passed", "configuration")],
        },
      ),
    ]);
    expect(story.firewall).toEqual({
      state: "read",
      provider: "Hetzner",
      name: "sg-38e37237",
      at,
      detail: "22 from anywhere; everything else denied",
    });
    expect(story.holes.some((hole) => hole.id === "firewall")).toBe(false);
  });

  it("says plainly when a record states there is no firewall", () => {
    const story = read([
      states({ kind: "firewall", id: "none" }, { presence: "absent" }),
    ]);
    expect(story.firewall.state).toBe("none");
    expect(story.firewall.detail).toMatch(/no firewall/);
  });

  it("names a port on record that nothing has checked", () => {
    const story = read([
      states({ kind: "door", id: "ssh" }, { facts: [fact("port", "22")] }),
    ]);
    expect(story.doors[0].unasked).toBe(true);
    expect(story.holes.some((hole) => hole.id === "unasked:ssh")).toBe(true);
  });

  it("reads SSH from the host's own check, and ages it honestly", () => {
    const story = read([
      states(
        { kind: "host", id: "hetzner-1" },
        {
          at: "2026-09-12T09:00:00.000Z",
          checks: [check("ssh", "passed", "reachability")],
        },
      ),
    ]);
    expect(story.ssh.tone).toBe("stale");
    expect(story.ssh.word).toBe("SSH answered, a while ago");
  });
});

describe("domains", () => {
  it("shows the address in use when no name is recorded", () => {
    const story = read([privateAccess()]);
    expect(story.domain).toBeNull();
    expect(story.address).toBe("http://127.0.0.1:8080");
    expect(story.audience).toBe("controller");
    expect(story.callers[0].headline).toBe("It answers through the tunnel");
  });

  it("does not let a name imply that HTTPS works", () => {
    const story = read([
      states(
        { kind: "domain", id: "shop.example" },
        {
          facts: [
            fact("name", "shop.example"),
            fact("registrar", "Cloudflare"),
          ],
          checks: [check("resolves", "passed")],
        },
      ),
    ]);
    expect(story.domain?.state).toBe("resolving");
    expect(story.domain?.provider).toBe("cloudflare");
    // No certificate subject, so no claim about HTTPS either way.
    expect(story.tls.state).toBe("unknown");
    expect(story.callers.at(-1)?.secure).toBe(false);
  });

  it("separates resolving from serving", () => {
    const story = read([
      states(
        { kind: "domain", id: "shop.example" },
        { checks: [check("resolves", "passed")] },
      ),
    ]);
    expect(story.callers.at(-1)?.headline).toBe(
      "The name resolves; nothing has checked what answers",
    );
  });

  it("reads a valid certificate with who issued it", () => {
    const story = read([
      states(
        { kind: "domain", id: "shop.example" },
        { checks: [check("resolves", "passed"), check("serves", "passed")] },
      ),
      states(
        { kind: "certificate", id: "shop.example" },
        {
          facts: [
            fact("issuer", "Let's Encrypt", "identity", "reported"),
            fact("expires", "2026-12-01", "identity", "reported"),
          ],
          checks: [check("valid", "passed")],
        },
      ),
    ]);
    expect(story.tls).toEqual({
      state: "valid",
      issuer: "Let's Encrypt",
      expiresAt: "2026-12-01",
      detail: null,
    });
    expect(story.callers.at(-1)?.outcome).toBe("loads");
  });

  it("never invents a caller", () => {
    expect(read([]).callers).toEqual([]);
    expect(read([]).invented).toBeNull();
  });
});

describe("how a way in is described", () => {
  it("keeps a source written in words as one source", () => {
    // "Server loopback via SSH tunnel" is one thing described in prose, and
    // splitting it on spaces turned it into five imaginary networks.
    const story = read([
      states(
        { kind: "door", id: "loopback" },
        {
          facts: [
            fact("port", "127.0.0.1:3000"),
            fact("sources", "Server loopback via SSH tunnel"),
          ],
          checks: [check("open", "passed")],
        },
      ),
    ]);
    expect(story.doors[0].sources).toEqual(["Server loopback via SSH tunnel"]);
    expect(story.doors[0].reach).toBe("restricted");
  });

  it("still splits a real list of sources", () => {
    const story = read([
      states(
        { kind: "door", id: "ssh" },
        {
          facts: [
            fact("port", "22"),
            fact("sources", "203.0.113.4, 198.51.100.7"),
          ],
          checks: [check("open", "passed")],
        },
      ),
    ]);
    expect(story.doors[0].sources).toEqual(["203.0.113.4", "198.51.100.7"]);
  });

  it("names both ends of a tunnel rather than printing a question mark", () => {
    const story = read([
      states(
        { kind: "access", id: "grafana-private-access" },
        {
          facts: [fact("local-port", "33000"), fact("remote-port", "3000")],
          checks: [check("http", "passed")],
        },
      ),
    ]);
    expect(story.doors[0].port).toBe("33000 → 3000");
  });

  it("says a port is not recorded rather than inventing one", () => {
    const story = read([
      states(
        { kind: "door", id: "prometheus-host-port" },
        { checks: [check("refused", "passed")] },
      ),
    ]);
    expect(story.doors[0].port).toBe("not recorded");
    expect(story.guards[0].title).toBe(
      "prometheus-host-port refuses connections",
    );
  });

  it("reads anywhere and ::/0 as open to everyone, like 0.0.0.0/0", () => {
    for (const source of ["anywhere", "::/0", "0.0.0.0/0"]) {
      const story = read([
        states(
          { kind: "door", id: "http" },
          {
            facts: [fact("port", "80"), fact("sources", source)],
            checks: [check("open", "passed")],
          },
        ),
      ]);
      expect(story.doors[0].reach).toBe("internet");
    }
  });
});

describe("what a way in is called when its ports are in the content", () => {
  it("reads a tunnel's two ends from the access record", () => {
    // The product itself wrote those ports into application-access content,
    // not into facts. An access subject with no port facts is still a way in
    // with two known ends, and "port not recorded" was wrong about it.
    const story = read([
      privateAccess(),
      states(
        { kind: "access", id: "private-tunnel" },
        {
          checks: [check("http", "passed")],
        },
      ),
    ]);
    expect(story.doors[0].port).toBe("8080 → 3000");
  });

  it("uses the check's own label when Pi wrote no detail", () => {
    const story = read([
      states(
        { kind: "door", id: "app" },
        {
          facts: [fact("port", "3000")],
          checks: [check("open", "passed")],
        },
      ),
    ]);
    // "Checked, with no detail recorded" told a reader about our bookkeeping
    // rather than about their server.
    expect(story.doors[0].detail).toBe("open");
  });
});

describe("the wall a deny-by-default firewall makes", () => {
  const withDefault = (value: string) =>
    read([
      states(
        { kind: "firewall", id: "fw" },
        {
          facts: [
            fact("provider", "Hetzner Cloud"),
            fact("default", value),
            fact("rules", "TCP 22 and ICMP from IPv4/IPv6"),
          ],
          checks: [check("configured", "passed", "configuration")],
        },
      ),
    ]);

  it("draws everything-else as closed", () => {
    // Without this door a read, deny-by-default policy showed the same
    // headline as no policy at all: "nothing stands between the internet
    // and this server".
    const rest = withDefault("Deny unless listed").doors.find(
      (door) => door.id === "rest",
    );
    expect(rest?.reach).toBe("closed");
    expect(rest?.detail).toBe("Deny unless listed");
  });

  it("does not draw it for a policy that allows by default", () => {
    expect(
      withDefault("Allow unless listed").doors.some((d) => d.id === "rest"),
    ).toBe(false);
  });

  it("does not draw it when no policy was read", () => {
    expect(read([]).doors.some((door) => door.id === "rest")).toBe(false);
  });
});

// A configured name and a working application are two different claims, and
// the gap between them is where a proxied name lives: it resolves, it serves
// a valid certificate, and the origin behind it is dead. Every case here is
// one that used to read as success.
describe("a name, and whether anything answers on it", () => {
  const domain = { kind: "domain" as const, id: "shop-name" };

  const named = (
    checks: ReturnType<typeof check>[],
    facts: ReturnType<typeof fact>[] = [],
    at = "2026-09-13T12:00:00.000Z",
  ) =>
    read([
      states(domain, {
        at,
        facts: [
          fact("name", "shop.example.com", "identity"),
          fact("registrar", "Cloudflare"),
          ...facts,
        ],
        checks,
      }),
    ]);

  it("a record nobody has resolved is not a resolving name", () => {
    const story = named(
      [check("configured", "passed", "configuration")],
      [fact("origin", "203.0.113.7")],
    );
    expect(story.domain?.state).toBe("pending-dns");
    expect(story.domain?.detail).toMatch(/holds the record/);
    expect(story.domain?.detail).toMatch(/Nobody has resolved/);
  });

  it("a name that resolves does not mean the application answers", () => {
    const story = named([check("resolves", "passed")]);
    expect(story.domain?.state).toBe("resolving");
    expect(story.domain?.detail).toMatch(/Nothing has checked what answers/);
    const caller = story.callers.find((item) => item.id === "domain");
    expect(caller?.outcome).not.toBe("loads");
    expect(caller?.sure).toBe("asked");
  });

  it("a valid certificate is not evidence the application answers", () => {
    // The case that mattered: under a proxy the certificate belongs to the
    // proxy and is valid while the origin is down.
    const story = read([
      states(domain, {
        at: "2026-09-13T12:00:00.000Z",
        facts: [
          fact("name", "shop.example.com", "identity"),
          fact("proxied", "true"),
        ],
        checks: [check("resolves", "passed")],
      }),
      states(
        { kind: "certificate", id: "shop-cert" },
        {
          at: "2026-09-13T12:00:00.000Z",
          facts: [fact("issuer", "Cloudflare Inc ECC CA-3")],
          checks: [check("valid", "passed", "configuration")],
        },
      ),
    ]);
    expect(story.tls.state).toBe("valid");
    expect(story.domain?.state).toBe("resolving");
    expect(
      story.callers.find((item) => item.id === "domain")?.outcome,
    ).not.toBe("loads");
  });

  it("a configured, proxied name whose application does not answer is unreachable", () => {
    const story = named(
      [
        check("configured", "passed", "configuration"),
        check("resolves", "passed"),
        check("serves", "failed", "reachability", {
          detail:
            "Cloudflare returned 522 after 15s; the origin never answered.",
        }),
      ],
      [fact("origin", "46.62.253.6"), fact("proxied", "true")],
    );
    expect(story.domain?.state).toBe("unreachable");
    expect(story.domain?.proxied).toBe(true);
    expect(story.domain?.origin).toBe("46.62.253.6");
    const caller = story.callers.find((item) => item.id === "domain");
    expect(caller?.outcome).toBe("no-answer");
    expect(caller?.headline).toMatch(/does not/i);
    expect(caller?.detail).toMatch(/522/);
  });

  it("only a serves check makes the name read as working", () => {
    const story = named([
      check("resolves", "passed"),
      check("serves", "passed", "reachability", {
        detail: "HTTP 200 in 120ms.",
      }),
    ]);
    expect(story.domain?.state).toBe("serving");
    expect(story.callers.find((item) => item.id === "domain")?.outcome).toBe(
      "loads",
    );
  });

  it("a name that served a week ago is not serving now", () => {
    // Reachability ages. The reading keeps its detail and loses its green.
    const story = named(
      [check("resolves", "passed"), check("serves", "passed")],
      [],
      "2026-09-01T12:00:00.000Z",
    );
    expect(story.domain?.state).toBe("resolving");
    expect(story.domain?.detail).toMatch(/last checked/);
  });

  it("a failure survives ageing, and stays a failure", () => {
    const story = named(
      [check("resolves", "passed"), check("serves", "failed")],
      [],
      "2026-08-01T12:00:00.000Z",
    );
    expect(story.domain?.state).toBe("unreachable");
  });

  it("a name that does not resolve says so, above everything else", () => {
    const story = named([
      check("configured", "passed", "configuration"),
      check("resolves", "failed", "reachability", {
        detail: "NXDOMAIN from 1.1.1.1.",
      }),
    ]);
    expect(story.domain?.state).toBe("failed");
    expect(story.callers.find((item) => item.id === "domain")?.outcome).toBe(
      "no-name",
    );
  });

  it("says when the record points somewhere this application is not", () => {
    const story = read([
      states(
        { kind: "host", id: "host-1" },
        { facts: [fact("address", "192.0.2.10")] },
      ),
      states(domain, {
        at: "2026-09-13T12:00:00.000Z",
        facts: [
          fact("name", "shop.example.com", "identity"),
          fact("origin", "46.62.253.6"),
        ],
        checks: [check("resolves", "passed")],
      }),
    ]);
    expect(story.domain?.concern).toMatch(/46\.62\.253\.6/);
    expect(story.domain?.concern).toMatch(/192\.0\.2\.10/);
  });

  it("says nothing about a mismatch when the origin is this server", () => {
    const story = read([
      states(
        { kind: "host", id: "host-1" },
        { facts: [fact("address", "192.0.2.10")] },
      ),
      states(domain, {
        at: "2026-09-13T12:00:00.000Z",
        facts: [
          fact("name", "shop.example.com", "identity"),
          fact("origin", "192.0.2.10"),
        ],
        checks: [check("resolves", "passed")],
      }),
    ]);
    expect(story.domain?.concern).toBeNull();
  });

  // Pi writes this word itself, and picked "Enabled" the first time a real
  // name was checked. A parser that knew only "true" would have drawn a
  // proxied name as a direct one.
  it.each([
    ["Enabled", true],
    ["enabled", true],
    ["true", true],
    ["Yes", true],
    ["on", true],
    ["Proxied", true],
    ["Orange cloud", true],
    ["Disabled", false],
    ["false", false],
    ["No", false],
    ["DNS only", false],
    ["Grey cloud", false],
  ])("reads %s as proxied=%s", (said, expected) => {
    const story = named([check("resolves", "passed")], [fact("proxied", said)]);
    expect(story.domain?.proxied).toBe(expected);
  });

  it("a proxy state nobody recorded is unknown, not direct", () => {
    const story = named(
      [check("resolves", "passed")],
      [fact("origin", "203.0.113.7")],
    );
    expect(story.domain?.proxied).toBeNull();
  });

  // A proxied name is served over the provider's certificate. Nothing here
  // has read it, and saying "there is no certificate" from that silence is
  // the same mistake as calling an unchecked server dead.
  it("no certificate record means nobody looked, not that there is none", () => {
    const story = named([check("resolves", "passed")]);
    expect(story.tls.state).toBe("unknown");
    expect(story.tls.detail).toMatch(/Nothing has checked/);
  });

  it("a certificate subject with no check is also unknown", () => {
    const story = read([
      states(
        { kind: "certificate", id: "c" },
        { facts: [fact("issuer", "R10")] },
      ),
    ]);
    expect(story.tls.state).toBe("unknown");
  });

  it("only a written absence says there is no certificate", () => {
    const story = read([
      states({ kind: "certificate", id: "c" }, { presence: "absent" }),
    ]);
    expect(story.tls.state).toBe("not-configured");
  });

  it("an absent domain is an absence, and a missing one is nobody looking", () => {
    expect(read([]).domain).toBeNull();
    expect(read([states(domain, { presence: "absent" })]).domain).toBeNull();
  });
});
