// The traffic fixture (scripts/traffic-fixture.ts) writes the history the
// traffic pages are judged on, so it has to come out the same every time and
// read like each proxy's own log. What matters here: one seed writes the
// same bytes, files are named as the real rotation names them, and every
// line is one the reader for its format can take, with script events the
// contract's own decoder accepts.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";

import { parseCaddyLine } from "@/server/access-log";
import { EVENT_PREFIX, eventOf } from "@/server/traffic/contract";

const root = mkdtempSync(join(tmpdir(), "hallvi-traffic-fixture-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function backfill(format: string, out: string, seed = "3") {
  const dir = join(root, out);
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      resolve("scripts/traffic-fixture.ts"),
      "backfill",
      ...["--format", format, "--shape", "spa", "--days", "1"],
      ...["--seed", seed, "--end", "2026-09-20T06:00:00Z", "--out", dir],
      ...["--releases", "2026-09-19T09:30:00Z"],
    ],
    { encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);
  const files = readdirSync(dir)
    .filter((name) => name !== "traffic-fixture.json")
    .sort();
  return files.map((name) => ({ name, bytes: readFileSync(join(dir, name)) }));
}

function linesOf(files: { name: string; bytes: Buffer }[]) {
  return files.flatMap(({ name, bytes }) =>
    (name.endsWith(".gz") ? gunzipSync(bytes) : bytes)
      .toString("utf8")
      .trimEnd()
      .split("\n")
      .map((line) => ({ line, entry: JSON.parse(line) })),
  );
}

describe("the traffic fixture", () => {
  it("writes the same files for the same seed, named as Caddy names them", () => {
    const first = backfill("caddy-json", "first");
    expect(backfill("caddy-json", "again")).toEqual(first);
    expect(backfill("caddy-json", "other", "4")).not.toEqual(first);
    for (const { name } of first)
      expect(name).toMatch(
        /^access-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.\d{3}-size\.log\.gz$/,
      );

    const caddy = linesOf(first);
    const kinds = new Set(
      caddy.map(({ entry }) => entry.request.headers["X-Hallvi-Fixture"]?.[0]),
    );
    expect(["bot", "browser", "client", "hallvi"]).toEqual(
      expect.arrayContaining([...kinds]),
    );
    // Pi's filter leaves no query string; today's live reader takes every
    // line but Hallvi's own checks.
    expect(
      caddy.filter(
        ({ line, entry }) =>
          entry.request.uri.includes("?") ||
          (parseCaddyLine(line) === null) !==
            (entry.request.headers["X-Hallvi-Fixture"][0] === "hallvi"),
      ),
    ).toEqual([]);
    const events = caddy.filter(
      ({ entry }) =>
        entry.request.uri.startsWith(EVENT_PREFIX) &&
        entry.request.headers["X-Hallvi-Fixture"][0] === "browser",
    );
    expect(events.length).toBeGreaterThan(100);
    expect(
      events.filter(({ entry }) => eventOf(entry.request.uri) === null),
    ).toEqual([]);
  }, 60_000);

  it("writes lines Traefik's and nginx's readers can take", () => {
    const traefik = backfill("traefik-json", "traefik");
    // logrotate with delaycompress, as Traefik's logs are rotated.
    expect(traefik.map((file) => file.name)).toEqual([
      "access.log.1",
      "access.log.2.gz",
    ]);
    expect(
      linesOf(traefik).filter(
        ({ entry }) =>
          Object.keys(entry).join() !== Object.keys(entry).sort().join() ||
          !entry["request_X-Hallvi-Fixture"] ||
          !Number.isFinite(Date.parse(entry.StartUTC)) ||
          typeof entry.DownstreamStatus !== "number",
      ),
    ).toEqual([]);

    // Hallvi's own nginx line: every value a string, no query anywhere.
    expect(
      linesOf(backfill("hallvi-json", "nginx")).filter(
        ({ entry: { hallvi, ...fields } }) =>
          hallvi !== 1 ||
          Object.values(fields).some((value) => typeof value !== "string") ||
          /[?#]/.test(fields.path + fields.referrer),
      ),
    ).toEqual([]);
  }, 60_000);
});
