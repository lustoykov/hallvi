// The Cloudflare adapter.
//
// Network calls are stubbed: what is worth testing here is the credential
// never leaving the server, the fixed origin, and the one distinction that
// costs an afternoon when it is missed — managing R2 is not writing to R2.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VERIFY = { success: true, result: { status: "active" } };
const ACCOUNT = "a".repeat(32);

let fetched: string[] = [];
let headers: Record<string, string>[] = [];

function stub(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      fetched.push(url);
      headers.push(init.headers as Record<string, string>);
      return { ok, status, json: async () => body } as Response;
    }),
  );
}

let cloudflare: typeof import("@/server/cloudflare");

beforeEach(async () => {
  fetched = [];
  headers = [];
  process.env.CLOUDFLARE_API_TOKEN = "test-token-not-real";
  process.env.CLOUDFLARE_ACCOUNT_ID = ACCOUNT;
  // A token may now be saved on the controller instead of set in the
  // environment. Point that directory at an empty one, so these cases cannot
  // read a developer's real connection and report it as the fixture's.
  process.env.HALLVI_CONFIG_DIR = mkdtempSync(
    join(tmpdir(), "cloudflare-test-"),
  );
  cloudflare = await import("@/server/cloudflare");
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CLOUDFLARE_API_TOKEN;
  delete process.env.CLOUDFLARE_ACCOUNT_ID;
});

describe("verifying", () => {
  it("asks Cloudflare rather than assuming a set variable works", async () => {
    stub(VERIFY);
    const connection = await cloudflare.verifyCloudflare();
    expect(fetched[0]).toBe(
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
    );
    expect(connection.connected).toBe(true);
    expect(connection.status).toBe("active");
  });

  it("sends the token as a bearer and returns none of it", async () => {
    stub(VERIFY);
    const connection = await cloudflare.verifyCloudflare();
    expect(headers[0].Authorization).toBe("Bearer test-token-not-real");
    expect(JSON.stringify(connection)).not.toContain("test-token-not-real");
  });

  it("reports an inactive token as not connected, and says so", async () => {
    stub({ success: true, result: { status: "expired" } });
    const connection = await cloudflare.verifyCloudflare();
    expect(connection.connected).toBe(false);
    expect(connection.error).toContain("expired");
  });

  it("turns a refusal into an honest error rather than throwing at a page", async () => {
    stub(
      { success: false, errors: [{ code: 9109, message: "Invalid token" }] },
      false,
      403,
    );
    const connection = await cloudflare.verifyCloudflare();
    expect(connection.connected).toBe(false);
    expect(connection.error).toContain("Invalid token");
    expect(connection.error).toContain("403");
    expect(connection.configured).toBe(true);
  });

  it("says plainly when nothing is configured, without calling out", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    stub(VERIFY);
    const connection = await cloudflare.verifyCloudflare();
    expect(connection.connected).toBe(false);
    // The row above this message offers a form; "not connected" and "the
    // provider refused it" are different rows, so they are different fields.
    expect(connection.configured).toBe(false);
    expect(connection.error).toContain("No Cloudflare token is connected");
    expect(fetched).toEqual([]);
  });
});

describe("the fixed origin", () => {
  it("refuses a path that would send the credential elsewhere", async () => {
    stub(VERIFY);
    await expect(cloudflare.cloudflareRecords("../../evil")).rejects.toThrow(
      /32 hexadecimal/,
    );
  });

  it("refuses an account id that is not one", async () => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "../../evil";
    stub(VERIFY);
    await expect(cloudflare.cloudflareBuckets()).rejects.toThrow(
      /32 hexadecimal/,
    );
  });
});

describe("R2", () => {
  it("lists buckets from the account", async () => {
    stub({
      success: true,
      result: {
        buckets: [{ name: "hallvi-backups", creation_date: "2026-01-01" }],
      },
    });
    const buckets = await cloudflare.cloudflareBuckets();
    expect(fetched[0]).toContain(`/accounts/${ACCOUNT}/r2/buckets`);
    expect(buckets).toEqual([
      { name: "hallvi-backups", createdAt: "2026-01-01" },
    ]);
  });

  it("keeps managing R2 and writing to R2 apart", () => {
    // This token can create a bucket and cannot put an object in one. A
    // connected tick that implied otherwise would send someone looking for a
    // bug in the uploader for an afternoon.
    expect(cloudflare.r2UploadGaps()).toEqual([
      "An R2 Access Key ID",
      "Its Secret Access Key",
      "The bucket to write into",
      "The account's S3 endpoint",
    ]);
  });
});

describe("reading one name", () => {
  const ZONE = "b".repeat(32);
  /** Zones first, then that zone's records: one body per call, in order. */
  function sequence(bodies: unknown[]) {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        fetched.push(url);
        headers.push(init.headers as Record<string, string>);
        return {
          ok: true,
          status: 200,
          json: async () => bodies[call++],
        } as Response;
      }),
    );
  }
  const zones = (names: string[]) => ({
    success: true,
    result: names.map((name, index) => ({
      id: index === 0 ? ZONE : `${index}`.repeat(32),
      name,
      status: "active",
    })),
  });
  const records = (rows: object[]) => ({ success: true, result: rows });

  it("finds the record and says whether the provider stands in front", async () => {
    sequence([
      zones(["example.com"]),
      records([
        {
          id: "1",
          type: "A",
          name: "app.example.com",
          content: "203.0.113.7",
          proxied: true,
        },
      ]),
    ]);
    const reading = await cloudflare.cloudflareDomain("app.example.com");
    expect(reading.zone).toBe("example.com");
    expect(reading.record?.content).toBe("203.0.113.7");
    expect(reading.proxied).toBe(true);
  });

  it("a visible zone without the name is an absence, not a failure", async () => {
    // The difference decides whether a page may write presence:"absent".
    sequence([zones(["example.com"]), records([])]);
    const reading = await cloudflare.cloudflareDomain("app.example.com");
    expect(reading.zone).toBe("example.com");
    expect(reading.record).toBeNull();
    expect(reading.proxied).toBe(false);
  });

  it("a zone this token cannot see is a failure, not an absence", async () => {
    sequence([zones(["other.com"])]);
    await expect(
      cloudflare.cloudflareDomain("app.example.com"),
    ).rejects.toThrow(/No zone this token can see/);
  });

  it("the most specific zone holds the name", async () => {
    sequence([
      zones(["sub.example.com", "example.com"]),
      records([
        {
          id: "1",
          type: "A",
          name: "app.sub.example.com",
          content: "203.0.113.9",
        },
      ]),
    ]);
    const reading = await cloudflare.cloudflareDomain("app.sub.example.com");
    expect(reading.zone).toBe("sub.example.com");
  });

  it("refuses anything that is not a domain name", async () => {
    for (const bad of ["not a name", "../zones", "http://x.com", "x"])
      await expect(cloudflare.cloudflareDomain(bad)).rejects.toThrow(
        /is not a domain name/,
      );
  });

  it("never puts the name in the path unescaped", async () => {
    sequence([zones(["example.com"]), records([])]);
    await cloudflare.cloudflareDomain("APP.Example.com.");
    // The name is matched in memory; only the zone id reaches the URL.
    expect(fetched.every((url) => !url.includes("app.example.com"))).toBe(true);
    expect(fetched[1]).toContain(`/zones/${ZONE}/dns_records`);
  });
});

// Writing a record. The safety here is the shape of the call — one exact
// name and one exact type, so there is no request it can make that touches
// something the caller did not name — and the two refusals: taking a name
// away from whatever already has it, and deleting a record that is not ours.
describe("pointing a name at a server", () => {
  const ZONE = "b".repeat(32);
  let sent: { url: string; method: string; body: unknown }[] = [];

  function zone(records: Record<string, unknown>[]) {
    sent = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        const method = init.method ?? "GET";
        sent.push({
          url,
          method,
          body: init.body ? JSON.parse(String(init.body)) : null,
        });
        const result = url.includes("/dns_records")
          ? method === "GET"
            ? records
            : { id: "new" }
          : [
              {
                id: ZONE,
                name: "example.com",
                status: "active",
                name_servers: ["ns1.example.net"],
              },
            ];
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, result }),
        } as Response;
      }),
    );
  }

  const held = (over: Record<string, unknown> = {}) => ({
    id: "rec-1",
    type: "A",
    name: "app.example.com",
    content: "203.0.113.10",
    proxied: false,
    ...over,
  });

  const wrote = () => sent.filter((call) => call.method !== "GET");

  it("creates the record when the name is free", async () => {
    zone([]);
    const outcome = await cloudflare.writeDomainRecord({
      name: "app.example.com",
      type: "A",
      content: "203.0.113.10",
    });
    expect(outcome.action).toBe("created");
    expect(outcome.previous).toBeNull();
    expect(wrote()).toHaveLength(1);
    expect(wrote()[0].method).toBe("POST");
    expect(wrote()[0].body).toMatchObject({
      type: "A",
      name: "app.example.com",
      content: "203.0.113.10",
      proxied: false,
    });
  });

  it("leaves the root and its neighbours alone when it writes a subdomain", async () => {
    // Setup finds the zone by walking up from a subdomain, so the zone a
    // token is scoped to is routinely a name the owner is already using.
    // The record that goes out must still be the subdomain's alone.
    zone([
      held({ id: "root", name: "example.com", content: "198.51.100.5" }),
      held({ id: "other", name: "www.example.com", content: "198.51.100.6" }),
    ]);
    const outcome = await cloudflare.writeDomainRecord({
      name: "app.example.com",
      type: "A",
      content: "203.0.113.10",
    });
    expect(outcome).toMatchObject({
      action: "created",
      name: "app.example.com",
      zone: "example.com",
      previous: null,
    });
    expect(wrote()).toHaveLength(1);
    expect(wrote()[0].method).toBe("POST");
    expect(wrote()[0].body).toMatchObject({ name: "app.example.com" });
    // Nothing addressed either of the records that were already there.
    expect(sent.some((call) => /rec-1|root|other/.test(call.url))).toBe(false);
  });

  it("refuses to take a name away from whatever already has it", async () => {
    zone([held({ content: "198.51.100.5" })]);
    await expect(
      cloudflare.writeDomainRecord({
        name: "app.example.com",
        type: "A",
        content: "203.0.113.10",
      }),
    ).rejects.toThrow(/198\.51\.100\.5.*Nothing was changed/s);
    expect(wrote()).toHaveLength(0);
  });

  it("takes it over only when the owner has decided to", async () => {
    zone([held({ content: "198.51.100.5" })]);
    const outcome = await cloudflare.writeDomainRecord({
      name: "app.example.com",
      type: "A",
      content: "203.0.113.10",
      replace: true,
    });
    expect(outcome.action).toBe("updated");
    expect(outcome.previous).toEqual({
      content: "198.51.100.5",
      proxied: false,
    });
    expect(wrote()[0].method).toBe("PUT");
  });

  it("writes nothing when the record already says what was asked for", async () => {
    zone([held()]);
    const outcome = await cloudflare.writeDomainRecord({
      name: "app.example.com",
      type: "A",
      content: "203.0.113.10",
    });
    expect(outcome.action).toBe("unchanged");
    expect(wrote()).toHaveLength(0);
  });

  // The failure this field exists for: browsers prefer IPv6, so a leftover
  // AAAA breaks the name for the visitors who have one while the IPv4 path
  // a check just proved stays perfect.
  it("reports the other addresses the name still hands out", async () => {
    zone([held(), held({ id: "rec-2", type: "AAAA", content: "2001:db8::1" })]);
    const outcome = await cloudflare.writeDomainRecord({
      name: "app.example.com",
      type: "A",
      content: "203.0.113.10",
    });
    expect(
      outcome.others.map((item) => `${item.type} ${item.content}`),
    ).toEqual(["AAAA 2001:db8::1"]);
  });

  it("will not put an address of the wrong family in a record", async () => {
    zone([]);
    await expect(
      cloudflare.writeDomainRecord({
        name: "app.example.com",
        type: "AAAA",
        content: "203.0.113.10",
      }),
    ).rejects.toThrow(/IPv6/);
    expect(sent).toHaveLength(0);
  });

  it("refuses a name no visible zone covers, rather than guessing one", async () => {
    zone([]);
    await expect(
      cloudflare.writeDomainRecord({
        name: "app.elsewhere.test",
        type: "A",
        content: "203.0.113.10",
      }),
    ).rejects.toThrow(/No zone this token can see/);
  });

  it("removes only the record whose address it was given", async () => {
    zone([held()]);
    const outcome = await cloudflare.removeDomainRecord({
      name: "app.example.com",
      type: "A",
      content: "203.0.113.10",
    });
    expect(outcome.action).toBe("removed");
    expect(wrote()[0].method).toBe("DELETE");
  });

  it("refuses to delete a record pointing somewhere else", async () => {
    zone([held({ content: "198.51.100.5" })]);
    await expect(
      cloudflare.removeDomainRecord({
        name: "app.example.com",
        type: "A",
        content: "203.0.113.10",
      }),
    ).rejects.toThrow(/not the record this application published/);
    expect(wrote()).toHaveLength(0);
  });

  it("treats an already absent record as removed rather than an error", async () => {
    zone([]);
    const outcome = await cloudflare.removeDomainRecord({
      name: "app.example.com",
      type: "A",
      content: "203.0.113.10",
    });
    expect(outcome.action).toBe("removed");
    expect(wrote()).toHaveLength(0);
  });
});
