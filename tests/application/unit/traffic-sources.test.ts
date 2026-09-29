// Reading the access log on the server. What matters here: rotated files come
// back oldest first with the time each covers, a missing file reads as a gap
// rather than as quiet, a range read keeps exactly its own lines, a file that
// cannot be read is said, and nothing a directory or a record holds can
// become shell.
//
// The commands run for real, through a shell, the way sshd runs them: a
// stand-in `ssh` on PATH hands its last argument to `/bin/sh -c`, as the
// server's login shell would. The files are real gzip and real rotation names
// (Caddy 2.11's and logrotate's), holding real proxy lines with their times
// moved.

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TrafficLine } from "@/server/traffic/contract";
import {
  followLogCommand,
  listLog,
  listLogCommand,
  readLog,
  readLogCommand,
  type AccessLogRecord,
} from "@/server/traffic/sources";

const real = (name: string) =>
  readFileSync(
    new URL(`../../fixtures/access-logs/${name}`, import.meta.url),
    "utf8",
  ).split("\n")[0];
const caddy = (at: string) =>
  real("caddy-2.11.4.log").replace(
    /"ts":[0-9.]+/,
    `"ts":${Date.parse(at) / 1000}`,
  );
const nginx = (at: string) =>
  real("nginx-1.30.5-hallvi.log").replace(
    /"time":"[0-9.]+"/,
    `"time":"${(Date.parse(at) / 1000).toFixed(3)}"`,
  );

const root = mkdtempSync(join(tmpdir(), "hallvi-readers-"));
const host = {
  address: "server.test",
  user: "hallvi",
  port: 22,
  privateKeyPath: "/test/key",
  knownHostsPath: "/test/hosts",
};
const log = (
  format: AccessLogRecord["format"],
  path: string,
): AccessLogRecord => ({
  kind: "access-log",
  proxy: format,
  format,
  source: { type: "file", path },
});

/** A file of lines, gzip'd when its name says so, last written `modified`. */
function file(path: string, lines: string[], modified: string) {
  const text = lines.map((line) => `${line}\n`).join("");
  writeFileSync(path, path.endsWith(".gz") ? gzipSync(text) : text);
  const at = Date.parse(modified) / 1000;
  utimesSync(path, at, at);
}

const caddyDir = join(root, "caddy");
const nginxDir = join(root, "nginx");
const path = process.env.PATH;
beforeAll(() => {
  mkdirSync(join(root, "bin"));
  writeFileSync(
    join(root, "bin", "ssh"),
    '#!/bin/sh\neval "last=\\${$#}"\nexec /bin/sh -c "$last"\n',
  );
  chmodSync(join(root, "bin", "ssh"), 0o755);
  process.env.PATH = `${join(root, "bin")}:${path}`;

  // Caddy: a file from the day before, then a gap where one was deleted,
  // then three files that follow one another. Each rolled on the write that
  // opens the next, which is the moment in its name.
  mkdirSync(caddyDir);
  file(
    join(caddyDir, "access-2026-09-27T12-00-00.000-size.log.gz"),
    [caddy("2026-09-27T06:00:00Z"), caddy("2026-09-27T11:00:00Z")],
    "2026-09-27T12:00:00Z",
  );
  file(
    join(caddyDir, "access-2026-09-28T10-00-00.000-size.log.gz"),
    [
      caddy("2026-09-28T08:00:00Z"),
      caddy("2026-09-28T09:00:00Z"),
      caddy("2026-09-28T09:59:59Z"),
    ],
    "2026-09-28T10:00:00Z",
  );
  file(
    join(caddyDir, "access-2026-09-28T16-00-00.000-time.log.gz"),
    [
      caddy("2026-09-28T10:00:00Z"),
      caddy("2026-09-28T12:00:00Z"),
      caddy("2026-09-28T15:00:00Z"),
    ],
    "2026-09-28T16:00:00Z",
  );
  file(
    join(caddyDir, "access.log"),
    [caddy("2026-09-28T16:00:00Z"), caddy("2026-09-28T20:00:00Z")],
    "2026-09-28T20:00:00Z",
  );
  // Names a listing can hand back, none of which may become shell.
  for (const name of [
    "access.log.3;touch PWNED",
    "access.log.4$(touch PWNED)",
    "access.log.5`touch PWNED`",
    "access.log.6'x'",
    "access.log.7 8",
    "access.log.8\nhallvi-file access.log.1 1 1",
  ])
    writeFileSync(join(caddyDir, name), "");

  // logrotate: access.log.2 was deleted, so .3 and .1 do not meet; .1 was
  // rotated into the file being written. The .3 file lost its end on the way.
  mkdirSync(nginxDir);
  file(
    join(nginxDir, "hallvi.log.3.gz"),
    [nginx("2026-09-26T00:10:00Z"), nginx("2026-09-26T23:50:00Z")],
    "2026-09-26T23:50:00Z",
  );
  const broken = readFileSync(join(nginxDir, "hallvi.log.3.gz"));
  writeFileSync(join(nginxDir, "hallvi.log.3.gz"), broken.subarray(0, -8));
  const lastWrite = Date.parse("2026-09-26T23:50:00Z") / 1000;
  utimesSync(join(nginxDir, "hallvi.log.3.gz"), lastWrite, lastWrite);
  file(
    join(nginxDir, "hallvi.log.1"),
    [nginx("2026-09-28T00:05:00Z"), nginx("2026-09-28T23:55:00Z")],
    "2026-09-28T23:55:00Z",
  );
  file(
    join(nginxDir, "hallvi.log"),
    [nginx("2026-09-29T00:03:00Z"), nginx("2026-09-29T06:00:00Z")],
    "2026-09-29T06:00:00Z",
  );
});
afterAll(() => {
  process.env.PATH = path;
  rmSync(root, { recursive: true, force: true });
});

const iso = (ms: number) => new Date(ms).toISOString();
const spans = (list: { from: number; to: number }[]) =>
  list.map((span) => [iso(span.from), iso(span.to)]);

describe("the access log on the server", () => {
  it("lists Caddy's rotated files oldest first, and a deleted one is a gap", async () => {
    const before = Date.now();
    const files = await listLog(
      host,
      log("caddy-json", join(caddyDir, "access.log")),
    );
    expect(files.map((f) => f.name)).toEqual([
      "access-2026-09-27T12-00-00.000-size.log.gz",
      "access-2026-09-28T10-00-00.000-size.log.gz",
      "access-2026-09-28T16-00-00.000-time.log.gz",
      "access.log",
    ]);
    expect(spans(files.slice(0, 3))).toEqual([
      // Its successor is gone: it covers only up to its own last write.
      ["2026-09-27T06:00:00.000Z", "2026-09-27T12:00:01.000Z"],
      // Quiet time counts: each covers until the next began.
      ["2026-09-28T08:00:00.000Z", "2026-09-28T10:00:00.000Z"],
      ["2026-09-28T10:00:00.000Z", "2026-09-28T16:00:00.000Z"],
    ]);
    // The file being written covers until now.
    expect(iso(files[3].from)).toBe("2026-09-28T16:00:00.000Z");
    expect(files[3].to).toBeGreaterThanOrEqual(
      Math.floor(before / 1000) * 1000,
    );
    // Nothing a name held ran, anywhere.
    for (const dir of [root, caddyDir, process.cwd()])
      expect(readdirSync(dir)).not.toContain("PWNED");
  });

  it("reads exactly a range, across files, and says what the log did not cover", async () => {
    const source = log("caddy-json", join(caddyDir, "access.log"));
    const read = async (from: string, to: string) => {
      const lines: TrafficLine[] = [];
      const result = await readLog(
        host,
        source,
        { from: Date.parse(from), to: Date.parse(to) },
        (line) => lines.push(line),
      );
      return { at: lines.map((line) => iso(line.at)), ...result };
    };
    // `from` is included and `to` is not, so neighbouring days never share
    // the line written at midnight.
    const day = await read("2026-09-28T09:00:00Z", "2026-09-28T16:00:00Z");
    expect(day.at).toEqual([
      "2026-09-28T09:00:00.000Z",
      "2026-09-28T09:59:59.000Z",
      "2026-09-28T10:00:00.000Z",
      "2026-09-28T12:00:00.000Z",
      "2026-09-28T15:00:00.000Z",
    ]);
    expect(spans(day.covered)).toEqual([
      ["2026-09-28T09:00:00.000Z", "2026-09-28T16:00:00.000Z"],
    ]);
    const across = await read("2026-09-27T00:00:00Z", "2026-09-28T12:00:00Z");
    expect(across.at).toHaveLength(6);
    expect(spans(across.covered)).toEqual([
      ["2026-09-27T06:00:00.000Z", "2026-09-27T12:00:01.000Z"],
      ["2026-09-28T08:00:00.000Z", "2026-09-28T12:00:00.000Z"],
    ]);
    const before = await read("2026-09-20T00:00:00Z", "2026-09-21T00:00:00Z");
    expect(before).toEqual({ at: [], covered: [], unreadable: [] });
  });

  it("follows logrotate's numbers, and says which file it could not read", async () => {
    const source = log("hallvi-json", join(nginxDir, "hallvi.log"));
    const files = await listLog(host, source);
    expect(files.map((f) => f.name)).toEqual([
      "hallvi.log.3.gz",
      "hallvi.log.1",
      "hallvi.log",
    ]);
    expect(spans(files.slice(0, 2))).toEqual([
      // hallvi.log.2 is missing, so .3 ends at its own last write.
      ["2026-09-26T00:10:00.000Z", "2026-09-26T23:50:01.000Z"],
      ["2026-09-28T00:05:00.000Z", "2026-09-29T00:03:00.000Z"],
    ]);
    const lines: TrafficLine[] = [];
    const result = await readLog(
      host,
      source,
      {
        from: Date.parse("2026-09-26T00:00:00Z"),
        to: Date.parse("2026-09-29T00:00:00Z"),
      },
      (line) => lines.push(line),
    );
    expect(spans(result.unreadable)).toEqual([
      ["2026-09-26T00:10:00.000Z", "2026-09-26T23:50:01.000Z"],
    ]);
    expect(spans(result.covered)).toEqual([
      ["2026-09-28T00:05:00.000Z", "2026-09-29T00:00:00.000Z"],
    ]);
    expect(lines.at(-1)?.at).toBe(Date.parse("2026-09-28T23:55:00Z"));
  });

  it("builds every command from fixed text and closed-shape values", () => {
    const shape = /^bash -c '[^']*' hallvi( '[A-Za-z0-9_./-]+')+$/;
    const file = { type: "file" as const, path: "/var/log/caddy/access.log" };
    const container = { type: "container" as const, name: "shop-caddy-1" };
    const range = { from: 1790692978288, to: 1790696578288 };
    const rotated = ["access-2026-09-28T10-00-00.000-size.log.gz"];
    for (const command of [
      listLogCommand(file),
      listLogCommand(container),
      readLogCommand(file, [...rotated, "access.log"], range),
      readLogCommand(container, [], range),
      followLogCommand(file, rotated, range.from),
      followLogCommand(container, [], range.from),
    ])
      expect(command).toMatch(shape);
    expect(readLogCommand(container, [], range)).toMatch(
      /' hallvi 'shop-caddy-1' '1790692918' '1790696638'$/,
    );
    for (const hostile of [
      () => listLogCommand({ type: "file", path: "/var/log/x'; reboot #" }),
      () => listLogCommand({ type: "container", name: "$(reboot)" }),
      () => readLogCommand(file, ["access.log.1;reboot"], range),
      () => readLogCommand(file, ["../../../etc/shadow"], range),
      () => readLogCommand(file, ["other.log"], range),
      // The file being written is followed, never read first as rotated.
      () => followLogCommand(file, ["access.log"], range.from),
    ])
      expect(hostile).toThrow();
  });

  it("says in words when there is no log to list", () => {
    const result = spawnSync(
      "/bin/sh",
      [
        "-c",
        listLogCommand({
          type: "file",
          path: "/hallvi-review-nonexistent/access.log",
        }),
      ],
      { encoding: "utf8", timeout: 5000 },
    );
    expect(result.status).toBe(4);
    expect(result.stdout).toContain(
      "/hallvi-review-nonexistent/ is not readable by",
    );
    expect(existsSync("/hallvi-review-nonexistent")).toBe(false);
  });
});
