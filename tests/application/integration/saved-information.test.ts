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
