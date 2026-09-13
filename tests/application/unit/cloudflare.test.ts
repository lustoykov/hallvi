// The Cloudflare adapter.
//
// Network calls are stubbed: what is worth testing here is the credential
// never leaving the server, the fixed origin, and the one distinction that
// costs an afternoon when it is missed — managing R2 is not writing to R2.

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
  });

  it("says plainly when nothing is configured, without calling out", async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    stub(VERIFY);
    const connection = await cloudflare.verifyCloudflare();
    expect(connection.connected).toBe(false);
    expect(connection.error).toContain("No CLOUDFLARE_API_TOKEN");
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
        buckets: [{ name: "server-guy-backups", creation_date: "2026-01-01" }],
      },
    });
    const buckets = await cloudflare.cloudflareBuckets();
    expect(fetched[0]).toContain(`/accounts/${ACCOUNT}/r2/buckets`);
    expect(buckets).toEqual([
      { name: "server-guy-backups", createdAt: "2026-01-01" },
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
