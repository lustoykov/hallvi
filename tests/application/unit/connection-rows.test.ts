// The Connections inventory's actions.
//
// Every one of these rows used to link to /applications whatever it said on
// the button, so "Connect" for a provider with no form anywhere led to the
// applications list, and Hetzner's own error told the reader to go to the
// Settings page that sent them there. What is worth protecting is that each
// row leads somewhere that can do the thing it names, and that a row which
// needs an application never quietly picks one.

import { describe, expect, it } from "vitest";

import {
  connectionRows,
  type ConnectionFacts,
} from "../../../src/server/connection-rows";

const GAPS = ["An R2 Access Key ID", "Its Secret Access Key"];

function facts(overrides: Partial<ConnectionFacts> = {}): ConnectionFacts {
  return {
    hetznerConnected: false,
    cloudflare: {
      connected: false,
      configured: false,
      status: null,
      account: null,
      error: "No Cloudflare token is connected on this controller.",
    },
    buckets: null,
    storage: { connected: false },
    uploadGaps: GAPS,
    applications: [],
    ...overrides,
  };
}
const row = (input: ConnectionFacts, id: string) =>
  connectionRows(input).find((item) => item.id === id)!;

describe("what a connection row offers", () => {
  it("opens a form here for every credential that is not connected", () => {
    const rows = connectionRows(facts());
    expect(
      rows.map((item) => [item.id, item.action.kind, item.action.label]),
    ).toEqual([
      ["hetzner", "form", "Connect"],
      ["cloudflare", "form", "Connect"],
      ["r2-uploads", "form", "Connect"],
    ]);
    expect(
      rows.map((item) => (item.action.kind === "form" ? item.action.form : "")),
    ).toEqual(["hetzner", "cloudflare", "backup-storage"]);
  });

  it("keeps the management token and the backup key apart", () => {
    const connected = facts({
      cloudflare: {
        connected: true,
        configured: true,
        status: "active",
        account: "b".repeat(32),
        error: null,
      },
      buckets: 14,
      applications: [{ id: "one", name: "Archive" }],
    });
    // Cloudflare connected, storage still not: the storage row says the token
    // above cannot write an object, and still offers its own form.
    const storage = row(connected, "r2-uploads");
    expect(storage.state).toBe("not-connected");
    expect(storage.detail).toContain("not an S3 credential");
    expect(storage.detail).toContain("an r2 access key id");
    expect(storage.action).toEqual({
      kind: "form",
      form: "backup-storage",
      label: "Connect",
    });
    expect(row(connected, "cloudflare").credential).toBe(
      "Account bbbbbbbb… · 14 R2 buckets visible",
    );
  });

  it("offers a replacement, not a dead end, when the provider rejects a token", () => {
    const failing = row(
      facts({
        cloudflare: {
          connected: false,
          configured: true,
          status: null,
          account: null,
          error: "Cloudflare refused the request (HTTP 403).",
        },
      }),
      "cloudflare",
    );
    expect(failing.state).toBe("failed");
    expect(failing.detail).toBe("Cloudflare refused the request (HTTP 403).");
    expect(failing.action).toEqual({
      kind: "form",
      form: "cloudflare",
      label: "Replace the token",
    });
  });
});

describe("a row that needs an application never chooses one", () => {
  const connectedFacts = (applications: ConnectionFacts["applications"]) =>
    facts({
      hetznerConnected: true,
      storage: {
        connected: true,
        provider: "r2",
        bucket: "archive-backups",
        host: "example.r2.cloudflarestorage.com",
      },
      applications,
    });

  it("says there are none and offers to add one", () => {
    const hetzner = row(connectedFacts([]), "hetzner");
    expect(hetzner.action).toEqual({
      kind: "link",
      href: "/applications/new",
      label: "Add application",
    });
    expect(hetzner.note).toContain("no applications yet");
    expect(hetzner.note).toContain("will not choose one for you");
  });

  it("names the only application it would open", () => {
    const rows = connectedFacts([{ id: "abc", name: "Archive" }]);
    expect(row(rows, "hetzner").action).toEqual({
      kind: "link",
      href: "/applications/abc",
      label: "Manage servers in Archive",
    });
    expect(row(rows, "r2-uploads").action).toEqual({
      kind: "link",
      href: "/applications/abc#backups",
      label: "Backups in Archive",
    });
    expect(row(rows, "hetzner").note).toBeUndefined();
  });

  it("hands the choice back when there is more than one", () => {
    const several = connectedFacts([
      { id: "abc", name: "Archive" },
      { id: "def", name: "Status page" },
    ]);
    expect(row(several, "hetzner").action).toEqual({
      kind: "link",
      href: "/applications",
      label: "Choose an application",
    });
    expect(row(several, "r2-uploads").note).toContain("yours to pick");
    // Nothing on this page addresses one application in particular.
    for (const item of connectionRows(several))
      if (item.action.kind === "link")
        expect(item.action.href).not.toMatch(/\/applications\/[^n]/);
  });
});
