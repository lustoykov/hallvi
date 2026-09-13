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
    // No certificate subject, so no claim about HTTPS.
    expect(story.tls.state).toBe("not-configured");
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
