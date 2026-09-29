// The traffic fixture (scripts/traffic-fixture.ts) writes the history the
// traffic pages are judged on, so it has to come out the same every time and
// read like each proxy's own log. What matters here: one seed writes the
// same bytes, files are named as the real rotation names them, and Hallvi's
// own reader takes every line of every format — all but Hallvi's own checks,
// which it leaves out on purpose — with script events the contract decodes.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";

import {
  EVENT_PREFIX,
  eventOf,
  type LogFormat,
} from "@/server/traffic/contract";
import { parseLine } from "@/server/traffic/parse";

const root = mkdtempSync(join(tmpdir(), "hallvi-traffic-fixture-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

function backfill(format: LogFormat, out: string, seed = "3", days = "1") {
  const dir = join(root, out);
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      resolve("scripts/traffic-fixture.ts"),
      "backfill",
      ...["--format", format, "--shape", "spa", "--days", days],
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

/** Each line, what the fixture marked it as, and what Hallvi reads. */
function read(format: LogFormat, files: { name: string; bytes: Buffer }[]) {
  return files.flatMap(({ name, bytes }) =>
    (name.endsWith(".gz") ? gunzipSync(bytes) : bytes)
      .toString("utf8")
      .trimEnd()
      .split("\n")
      .map((text) => {
        const entry = JSON.parse(text);
        const kind: string =
          entry.request?.headers?.["X-Hallvi-Fixture"]?.[0] ??
          entry["request_X-Hallvi-Fixture"] ??
          entry.fixture;
        return { kind, line: parseLine(format, text) };
      }),
  );
}

describe("the traffic fixture", () => {
  it("writes the same files for the same seed, named as Caddy names them", () => {
    const first = backfill("caddy-json", "first", "3", "2");
    expect(backfill("caddy-json", "again", "3", "2")).toEqual(first);
    expect(backfill("caddy-json", "other", "4", "2")).not.toEqual(first);
    // Caddy 2.11 rolling every 24 hours: the last roll at --end, the one
    // before it at the write that opened the next file. Hallvi's listing
    // reads the two as neighbours only if that write is within two seconds
    // of the time in the name; later, and the night between is a gap.
    const [older, newer] = first;
    expect(newer.name).toBe("access-2026-09-20T06-00-00.000-time.log.gz");
    const stamp = /^access-(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d\.\d{3})-time/
      .exec(older.name)!
      .slice(1);
    const rolled = Date.parse(
      `${stamp[0]}T${stamp[1]}:${stamp[2]}:${stamp[3]}Z`,
    );
    const opened = JSON.parse(
      gunzipSync(newer.bytes).toString("utf8").split("\n")[0],
    ).ts;
    expect(opened * 1000 - rolled).toBeGreaterThanOrEqual(0);
    expect(opened * 1000 - rolled).toBeLessThan(2_000);
  }, 60_000);

  it("writes lines Hallvi reads, in every format", () => {
    const files = {
      "caddy-json": backfill("caddy-json", "caddy"),
      "traefik-json": backfill("traefik-json", "traefik"),
      "hallvi-json": backfill("hallvi-json", "nginx"),
    };
    // logrotate with delaycompress, as nginx's and Traefik's logs rotate.
    expect(files["traefik-json"].map((file) => file.name)).toEqual([
      "access.log.1",
      "access.log.2.gz",
    ]);
    for (const format of Object.keys(files) as LogFormat[]) {
      const lines = read(format, files[format]);
      expect(
        lines.filter(
          ({ kind, line }) =>
            !["browser", "bot", "client", "hallvi"].includes(kind) ||
            (line === null) !== (kind === "hallvi") ||
            line?.path.includes("?"),
        ),
        format,
      ).toEqual([]);
      const events = lines.filter(
        ({ kind, line }) =>
          kind === "browser" && line?.path.startsWith(EVENT_PREFIX),
      );
      expect(events.length, format).toBeGreaterThan(100);
      expect(
        events.filter(({ line }) => eventOf(line!.path) === null),
        format,
      ).toEqual([]);
    }
  }, 60_000);
});
