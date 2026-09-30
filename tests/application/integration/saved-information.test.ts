import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { closeDatabase, insertApplication, listInformation } from "@/server/db";
import { saveInformation } from "@/server/saved-information";
import { establishSecret, requestSecret } from "@/server/application-secrets";
import { pushTestDatabase } from "../../test-database";

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hv-handoff-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(process.env.HALLVI_DB_PATH!);
});
afterAll(async () => {
  await closeDatabase();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

it("returns and persists redacted problem prose on creation and update, using this application's secrets", async () => {
  const app = await insertApplication({
    name: "Shop",
    repositoryUrl: "https://github.com/qa/shop",
    repositoryOwner: "qa",
    repositoryName: "shop",
  });
  const other = await insertApplication({
    name: "Other app",
    repositoryUrl: "https://github.com/qa/other",
    repositoryOwner: "qa",
    repositoryName: "other",
  });
  const held = "synthetic-shop-password";
  const foreign = "synthetic-other-password";
  for (const [id, value] of [
    [app.id, held],
    [other.id, foreign],
  ]) {
    requestSecret(id, { name: "DATABASE_PASSWORD", why: "Fixture only." });
    establishSecret(id, "DATABASE_PASSWORD", value);
  }
  const token = `ghp_${"x".repeat(24)}`;
  const packet = {
    title: `Receipt fails with ${held}`,
    body: `## Revision\nUnknown.\n\n## Reproduction\nCreate a pear order.\n\n## Expected / actual\nA receipt; worker reports an exception.\n\n## Evidence\npassword=${held}; token=${token}.\nDifferent application fixture label: ${foreign}.\n\n## Acceptance\nA new pear order returns its 4.00 EUR receipt.`,
    presentation: null,
  };
  const saved = await saveInformation(app.id, packet);
  expect(saved.title).toBe("Receipt fails with {{secret:DATABASE_PASSWORD}}");
  expect(saved.body).toContain("password={{secret:DATABASE_PASSWORD}}");
  expect(saved.body).toContain("token=[REDACTED]");
  expect(saved.body).toContain(foreign);
  expect(saved.body).toContain("Unknown.");
  expect(saved.body).toContain(
    "A new pear order returns its 4.00 EUR receipt.",
  );
  expect(JSON.stringify(saved)).not.toContain(held);
  expect(JSON.stringify(saved)).not.toContain(token);
  expect((await listInformation(app.id))[0]).toEqual(saved);

  const updated = await saveInformation(
    app.id,
    {
      ...packet,
      body: `${packet.body}\n\n## Attempt\nA retry still reports password=${held}.`,
    },
    saved.id,
  );
  expect(updated.id).toBe(saved.id);
  expect(updated.body).toContain(
    "A retry still reports password={{secret:DATABASE_PASSWORD}}",
  );
  expect(JSON.stringify((await listInformation(app.id))[0])).not.toContain(
    held,
  );
  expect((await listInformation(app.id))[0].body).toBe(updated.body);
});

// A proof found Pi updating a cdn record with facts: [] and erasing
// caches-pages. An update still replaces the record, but the result names
// what it dropped so Pi can put back a fact it meant to keep.
it("names the facts an update dropped, with what they held", async () => {
  const app = await insertApplication({
    name: "Cached",
    repositoryUrl: "https://github.com/qa/cached",
    repositoryOwner: "qa",
    repositoryName: "cached",
  });
  const cdn = (facts: { key: string; label: string; value: string }[]) => ({
    title: "Cloudflare caches pages",
    body: "A second request came back HIT.",
    establishedAt: "2026-09-29T12:00:00.000Z",
    presentation: {
      states: { ref: { kind: "cdn", id: "cloudflare" }, presence: "present" },
      views: ["cdn"],
      role: "status",
      status: "verified",
      checks: [
        {
          key: "caching",
          label: "Caching",
          status: "passed",
          claim: "configuration",
          basis: "observed",
        },
      ],
      facts: facts.map((fact) => ({
        ...fact,
        claim: "configuration",
        basis: "observed",
      })),
    },
  });
  const providerFact = {
    key: "provider",
    label: "Provider",
    value: "Cloudflare",
  };
  const cachesFact = {
    key: "caches-pages",
    label: "Caches pages",
    value: "yes",
  };
  const saved = await saveInformation(app.id, cdn([providerFact, cachesFact]));
  expect(saved).not.toHaveProperty("warning");

  const kept = await saveInformation(
    app.id,
    cdn([providerFact, { ...cachesFact, value: "no" }]),
    saved.id,
  );
  expect(kept).not.toHaveProperty("warning");

  const erased = await saveInformation(app.id, cdn([]), saved.id);
  expect(erased).toMatchObject({
    warning: expect.stringMatching(
      /removed provider \("Cloudflare"\), caches-pages \("no"\)/,
    ),
  });
});
