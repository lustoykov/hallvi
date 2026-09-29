// Hallvi's cache rule at Cloudflare.
//
// A zone's cache rules are one ordered list, and the only request that could
// clobber the owner's rules is the one that replaces that list. The fake
// below keeps the list as Cloudflare would and records every request, so
// each case can show that only Hallvi's rule was ever addressed.

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ZONE = "f".repeat(32);
const RULESET = "e".repeat(32);
const OWNER_RULE = "1".repeat(32);
const HOST = "shop.example.com";

interface Rule {
  id: string;
  [key: string]: unknown;
}

let cloudflare: typeof import("@/server/cloudflare");
let rules: Rule[] | null;
let sent: { method: string; path: string; body: unknown }[];
let minted: number;

function reply(result: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    json: async () =>
      status < 400
        ? { success: true, result }
        : { success: false, errors: [{ code: 10003, message: "not found" }] },
  } as Response;
}

function fakeCloudflare(start: Rule[] | null) {
  rules = start ? structuredClone(start) : null;
  sent = [];
  minted = 0;
  const mint = () => (++minted).toString(16).padStart(32, "a");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const method = init.method ?? "GET";
      const path = url.replace("https://api.cloudflare.com/client/v4", "");
      const body = init.body ? JSON.parse(String(init.body)) : null;
      sent.push({ method, path, body });
      if (path.startsWith("/zones?"))
        return reply([{ id: ZONE, name: "example.com", status: "active" }]);
      const entry = `/zones/${ZONE}/rulesets/phases/http_request_cache_settings/entrypoint`;
      const list = `/zones/${ZONE}/rulesets/${RULESET}/rules`;
      if (path === entry)
        return rules ? reply({ id: RULESET, rules }) : reply(null, 404);
      if (method === "POST" && path === `/zones/${ZONE}/rulesets`) {
        rules = body.rules.map((rule: object) => ({ id: mint(), ...rule }));
        return reply({ id: RULESET, rules });
      }
      if (method === "POST" && path === list && rules) {
        const { position, ...rule } = body;
        const at = position?.before
          ? rules.findIndex((item) => item.id === position.before)
          : rules.length;
        rules.splice(at, 0, { id: mint(), ...rule });
        return reply({ id: RULESET, rules });
      }
      const one = path.startsWith(`${list}/`)
        ? path.slice(list.length + 1)
        : "";
      const index = rules?.findIndex((item) => item.id === one) ?? -1;
      if (rules && index >= 0 && method === "PATCH") {
        rules[index] = { id: one, ...body };
        return reply({ id: RULESET, rules });
      }
      if (rules && index >= 0 && method === "DELETE") {
        rules.splice(index, 1);
        return reply({ id: RULESET, rules });
      }
      throw new Error(`The fake has no answer for ${method} ${path}`);
    }),
  );
}

// The owner's own rule, with fields Hallvi never writes, so a rewrite of it
// would show.
const ownerRule: Rule = {
  id: OWNER_RULE,
  version: "3",
  action: "set_cache_settings",
  expression:
    '(http.host eq "shop.example.com" and starts_with(http.request.uri.path, "/admin"))',
  description: "never cache the admin",
  enabled: true,
  action_parameters: { cache: false },
  last_updated: "2026-09-01T10:00:00Z",
  ref: "owner-admin",
};

const hallviRule = (over: Partial<Rule> = {}): Rule => ({
  id: "b".repeat(32),
  action: "set_cache_settings",
  expression: `(http.host eq "${HOST}" and not starts_with(http.request.uri.path, "/_hv/e/"))`,
  description: `managed-by=hallvi cache-pages host=${HOST} app=shop`,
  enabled: true,
  action_parameters: {
    cache: true,
    edge_ttl: { mode: "bypass_by_default" },
    browser_ttl: { mode: "respect_origin" },
  },
  ...over,
});

const writes = () => sent.filter((call) => call.method !== "GET");

beforeEach(async () => {
  process.env.CLOUDFLARE_API_TOKEN = "test-token-not-real";
  process.env.HALLVI_CONFIG_DIR = mkdtempSync(join(tmpdir(), "cache-rules-"));
  cloudflare = await import("@/server/cloudflare");
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CLOUDFLARE_API_TOKEN;
});

describe("setting Hallvi's cache rule", () => {
  it("adds it above the owner's rules and leaves theirs byte for byte", async () => {
    fakeCloudflare([ownerRule]);
    const outcome = await cloudflare.setCacheRule({
      hostname: HOST,
      owner: "shop",
    });
    expect(outcome.action).toBe("created");
    expect(outcome.previous).toBeNull();
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({
      method: "POST",
      path: `/zones/${ZONE}/rulesets/${RULESET}/rules`,
      body: {
        position: { before: OWNER_RULE },
        description: `managed-by=hallvi cache-pages host=${HOST} app=shop`,
      },
    });
    // The application's own max-age reaches browsers: without browser_ttl
    // the zone's Browser Cache TTL (often 4 hours) would replace it.
    expect((writes()[0].body as Rule).action_parameters).toEqual({
      cache: true,
      edge_ttl: { mode: "bypass_by_default" },
      browser_ttl: { mode: "respect_origin" },
    });
    // First, so the owner's later rule still wins where both match.
    expect(rules!.map((rule) => rule.id)).toEqual([
      "a".repeat(31) + "1",
      OWNER_RULE,
    ]);
    expect(rules![1]).toEqual(ownerRule);
    expect(outcome.others).toHaveLength(1);
    expect(outcome.rule?.expression).toContain('"shop.example.com"');
  });

  it("creates the zone's list when it has none, without writing the entrypoint", async () => {
    fakeCloudflare(null);
    const outcome = await cloudflare.setCacheRule({ hostname: HOST });
    expect(outcome.action).toBe("created");
    expect(writes()).toEqual([
      expect.objectContaining({
        method: "POST",
        path: `/zones/${ZONE}/rulesets`,
        body: expect.objectContaining({
          kind: "zone",
          phase: "http_request_cache_settings",
        }),
      }),
    ]);
    expect(outcome.rule).not.toBeNull();
    expect(outcome.others).toEqual([]);
  });

  it("brings its own rule back to what Hallvi writes and addresses nothing else", async () => {
    // A rule written before browser_ttl was added, as on real zones.
    const earlier = { cache: true, edge_ttl: { mode: "bypass_by_default" } };
    const stale = hallviRule({ action_parameters: earlier });
    fakeCloudflare([stale, ownerRule]);
    const outcome = await cloudflare.setCacheRule({
      hostname: HOST,
      owner: "shop",
    });
    expect(outcome.action).toBe("updated");
    expect(outcome.previous?.settings).toEqual(earlier);
    expect(writes()).toHaveLength(1);
    expect(writes()[0]).toMatchObject({
      method: "PATCH",
      path: `/zones/${ZONE}/rulesets/${RULESET}/rules/${stale.id}`,
      body: { action_parameters: { browser_ttl: { mode: "respect_origin" } } },
    });
    expect(rules![1]).toEqual(ownerRule);
  });

  it("writes nothing when its rule already says what it would write", async () => {
    fakeCloudflare([hallviRule(), ownerRule]);
    const outcome = await cloudflare.setCacheRule({
      hostname: HOST,
      owner: "shop",
    });
    expect(outcome.action).toBe("unchanged");
    expect(writes()).toEqual([]);
  });

  it("never replaces the zone's list", async () => {
    fakeCloudflare([ownerRule]);
    await cloudflare.setCacheRule({ hostname: HOST });
    await cloudflare.setCacheRule({ hostname: HOST, owner: "shop" });
    await cloudflare.removeCacheRule({ hostname: HOST });
    expect(sent.some((call) => call.method === "PUT")).toBe(false);
    expect(sent.some((call) => call.path.includes(OWNER_RULE))).toBe(false);
    expect(rules).toEqual([ownerRule]);
  });
});

describe("removing Hallvi's cache rule", () => {
  it("deletes only its own rule and says what stood there", async () => {
    fakeCloudflare([hallviRule(), ownerRule]);
    const outcome = await cloudflare.removeCacheRule({ hostname: HOST });
    expect(outcome.action).toBe("removed");
    expect(outcome.previous?.description).toContain("managed-by=hallvi");
    expect(outcome.rule).toBeNull();
    expect(writes()).toEqual([
      expect.objectContaining({
        method: "DELETE",
        path: `/zones/${ZONE}/rulesets/${RULESET}/rules/${"b".repeat(32)}`,
      }),
    ]);
    expect(rules).toEqual([ownerRule]);
  });

  it("refuses to remove a rule for the name that Hallvi did not write", async () => {
    fakeCloudflare([ownerRule]);
    await expect(
      cloudflare.removeCacheRule({ hostname: HOST }),
    ).rejects.toThrow(/not written by Hallvi.*Nothing was removed/s);
    expect(writes()).toEqual([]);
  });

  it("does not take another hostname's Hallvi rule for its own", async () => {
    const neighbour = hallviRule({
      id: "c".repeat(32),
      description: "managed-by=hallvi cache-pages host=www.example.com",
      expression: '(http.host eq "www.example.com")',
    });
    fakeCloudflare([neighbour]);
    const outcome = await cloudflare.removeCacheRule({ hostname: HOST });
    expect(outcome).toMatchObject({ action: "removed", previous: null });
    expect(writes()).toEqual([]);
    expect(rules).toEqual([neighbour]);
  });

  it("treats a zone with no cache rules as nothing to remove", async () => {
    fakeCloudflare(null);
    const outcome = await cloudflare.removeCacheRule({ hostname: HOST });
    expect(outcome).toMatchObject({
      action: "removed",
      previous: null,
      rule: null,
    });
    expect(writes()).toEqual([]);
  });
});

describe("reading", () => {
  it("reports no rule for a zone that has never had a cache rule", async () => {
    fakeCloudflare(null);
    const reading = await cloudflare.readCacheRule(HOST);
    expect(reading).toEqual({
      hostname: HOST,
      zone: "example.com",
      rule: null,
      others: [],
    });
  });

  it("names the permission when the token may only edit DNS", async () => {
    // The token the domain card guides is DNS edit and zone read, nothing
    // more; Cloudflare answers a cache-rule read with 403.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/zones?")
          ? reply([{ id: ZONE, name: "example.com", status: "active" }])
          : ({
              ok: false,
              status: 403,
              json: async () => ({
                success: false,
                errors: [{ code: 10000, message: "Authentication error" }],
              }),
            } as Response),
      ),
    );
    await expect(cloudflare.setCacheRule({ hostname: HOST })).rejects.toThrow(
      /Cache Rules › Edit.*example\.com|example\.com.*Cache Rules › Edit/s,
    );
  });

  it("tells Hallvi's rule apart from the owner's", async () => {
    fakeCloudflare([hallviRule(), ownerRule]);
    const reading = await cloudflare.readCacheRule(HOST);
    expect(reading.rule?.description).toContain("managed-by=hallvi");
    expect(reading.others.map((rule) => rule.description)).toEqual([
      "never cache the admin",
    ]);
  });
});
