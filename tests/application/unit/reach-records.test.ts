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
