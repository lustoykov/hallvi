// The access log on the server, read with fixed commands.
//
// Traffic history needs three things of every log it counts: the files the
// server still holds and the time each covers, the lines of a stretch of time,
// and new lines as they are written. A log that cannot do all three gives live
// data and no history.
//
// Every command here is Hallvi's own text and only reads. A record supplies
// closed-shape values — a path or a container name — and the rest are whole
// seconds and file names the server listed, which are used only once they
// match a rotation pattern. Like the live follow on Overview these are
// observations, outside the permission boundary: there is no model-authored
// text in them to decide about. Where Hallvi's user cannot read the log, a
// command runs itself again through `sudo -n`, as the docker variant always
// has, and says so in words when that is not allowed either.

import { spawn } from "node:child_process";

import { managedSshOptions } from "../managed-ssh";
import {
  accessLogSourceSchema,
  type InformationContent,
  type OperatorSettings,
} from "../operator-data";
import type { LogFormat, TrafficLine } from "./contract";
import { lineTime, parseLine, type ParseOptions } from "./parse";

export type AccessLogRecord = Extract<
  InformationContent,
  { kind: "access-log" }
>;
export type LogSource = AccessLogRecord["source"];
type Host = NonNullable<OperatorSettings["host"]>;

/** A stretch of time in epoch milliseconds, from included, to excluded. */
export interface Span {
  from: number;
  to: number;
}

/**
 * A file the server still holds, or a container's whole log, with the time it
 * holds every request of. Quiet time counts: a file covers until the next one
 * began, and the file being written covers until now.
 */
export interface LogFile extends Span {
  /** The file's name beside the log, or the container's name. */
  name: string;
  /** The file's size and last write, epoch ms; null for a container. */
  bytes: number | null;
  modified: number | null;
  /** Which file the name meant when it was listed; null for a container. */
  inode: string | null;
}

export interface ReadResult {
  /** The parts of the range the log held and was read in full. */
  covered: Span[];
  /** The parts a retained file held but could not be read. */
  unreadable: Span[];
}

/** Printed once the log is open, so "live" means connected and reading. */
export const READY = "hallvi-following";

// Every command is `bash -c '<script>' hallvi <values>`. The script is fixed
// text in single quotes, so the login shell hands it to bash untouched, and
// each value arrives as a positional parameter: data to bash, never script.
// Values are closed shapes, and are quoted as well.
function command(script: string, values: string[]) {
  for (const value of values)
    if (!/^[A-Za-z0-9_.\/-]+$/.test(value))
      throw new Error(`Not a value a log command takes: ${value}`);
  return `bash -c '${script}' hallvi ${values.map((value) => `'${value}'`).join(" ")}`;
}

// Whatever a command reads, Hallvi's user must be able to read: the log's
// directory and each of its files. When it cannot and sudo allows it without
// a password, the command runs itself again as root; otherwise it says what
// it could not read, rather than leaving a silent hole in the history.
const UNREADABLE = [
  'args=("$@")',
  'unreadable() { if [ "$(id -u)" != 0 ] && sudo -n true 2>/dev/null; then exec sudo -n bash -c "$BASH_EXECUTION_STRING" hallvi "${args[@]}"; fi; echo "$1 is not readable by $(id -un)."; exit 4; }',
  'cd -- "${1%/*}/" 2>/dev/null && [ -r . ] || unreadable "${1%/*}/"',
];
const DOCKER = 'd=docker; docker ps >/dev/null 2>&1 || d="sudo -n docker"';

// $1 is the log's path. Its rotated files sit beside it: logrotate's
// access.log.1 and access.log.2.gz, Caddy's access-<UTC time>[-reason].log.gz.
// A name with anything but letters, digits, dots, dashes and underscores is
// skipped here and refused again when read back.
const LIST_FILES = [
  ...UNREADABLE,
  'name=${1##*/}; stem=${name%.*}; ext=${name#"$stem"}; files=()',
  'for f in "$name".[0-9]* "$stem"-[0-9]*"$ext" "$stem"-[0-9]*"$ext".gz "$name"; do',
  '  [ -f "$f" ] || continue',
  "  case $f in *[^A-Za-z0-9._-]*) continue ;; esac",
  '  [ -r "$f" ] || unreadable "$f"',
  '  files+=("$f")',
  "done",
  'echo "hallvi-now $(date +%s)"',
  'for f in "${files[@]}"; do',
  '  read -r i _ < <(ls -di -- "$f")',
  '  echo "hallvi-file $f $(wc -c < "$f") $(date -r "$f" +%s) $i"',
  '  gzip -cdf -- "$f" 2>/dev/null | head -n 3; echo',
  "done",
].join("\n");

// $1 is the log's path; the rest are files beside it, oldest first. Each is
// preceded by its size and last write, so a file that rotated on between the
// listing and the read shows it. A file that ends part way through a line
// gets its line ended, so the next file's first line is never glued to it.
const READ_FILES = [
  ...UNREADABLE,
  "shift",
  'for f in "$@"; do [ ! -e "$f" ] || [ -r "$f" ] || unreadable "$f"; done',
  'for f in "$@"; do',
  '  echo "hallvi-file $f $(wc -c < "$f" 2>/dev/null) $(date -r "$f" +%s 2>/dev/null)"',
  '  gzip -cdf -- "$f"; s=$?; echo',
  '  [ "$s" = 0 ] || echo "hallvi-unreadable $f"',
  "done",
].join("\n");

// The rotated files first, then the file being written from its first line,
// following it by name through the next rotation. One command, so no line
// written between a read and a follow can fall between them.
//
// Each file arrives as its name, inode and size when listed, the file being
// written last. A rotation since the listing moves a name onto another file,
// or empties the file being written: the command then stops before reading
// that file and says `hallvi-moved`, and the collector lists again and starts
// over rather than lose what the name no longer holds. A file that cannot be
// read says `hallvi-unreadable`, and its time is a gap.
const FOLLOW_FILES = [
  ...UNREADABLE,
  "name=${1##*/}",
  '[ -r "$name" ] || unreadable "$name"',
  "shift",
  'for ((k = 1; k <= $#; k += 3)); do f=${!k}; [ ! -e "$f" ] || [ -r "$f" ] || unreadable "$f"; done',
  'same() { local i s; [ -e "$1" ] || return 1; read -r i _ < <(ls -di -- "$1"); s=$(wc -c < "$1") || return 1; [ "$i" = "$2" ] || return 1; if [ "$1" = "$name" ]; then [ "$s" -ge "$3" ]; else [ "$s" -eq "$3" ]; fi; }',
  `echo ${READY}`,
  "while [ $# -ge 3 ]; do",
  '  same "$1" "$2" "$3" 2>/dev/null || { echo "hallvi-moved $1"; exit 5; }',
  '  [ "$1" != "$name" ] || exec tail -n +1 -F -- "$name"',
  '  gzip -cdf -- "$1"; s=$?; echo',
  '  [ "$s" = 0 ] || echo "hallvi-unreadable $1"',
  "  shift 3",
  "done",
].join("\n");

// What Overview and Traffic draw while they are open: the last lines, then
// each new one. The same fixed text and the same read-only `sudo -n` fallback
// as history, so a user who reads the log through sudo sees it live as well.
const LIVE_FILE = [
  ...UNREADABLE,
  "name=${1##*/}",
  '[ -r "$name" ] || unreadable "$name"',
  `echo ${READY}`,
  'exec tail -n 2000 -F -- "$name"',
].join("\n");

// A container's output, with docker's own time on every line: what `--since`
// and `--until` choose by. Docker's complaints have no time, which is how
// they are told apart from the log.
const LIST_CONTAINER = [
  DOCKER,
  'echo "hallvi-now $(date +%s)"',
  'echo "hallvi-first $($d logs --timestamps "$1" 2>&1 | head -n 1)"',
  'echo "hallvi-last $($d logs --timestamps --tail 1 "$1" 2>&1 | tail -n 1)"',
].join("\n");
const READ_CONTAINER = [
  DOCKER,
  'exec $d logs --timestamps --since "$2" --until "$3" "$1" 2>&1',
].join("\n");
const FOLLOW_CONTAINER = [
  DOCKER,
  `echo ${READY}`,
  'exec $d logs --timestamps --since "$2" --follow "$1" 2>&1',
].join("\n");
const LIVE_CONTAINER = [
  DOCKER,
  `echo ${READY}`,
  'exec $d logs --since 5m --follow "$1" 2>&1',
].join("\n");

const valuesOf = (source: LogSource) => {
  const checked = accessLogSourceSchema.parse(source);
  return checked.type === "file" ? [checked.path] : [checked.name];
};
const seconds = (ms: number) => String(Math.max(0, Math.floor(ms / 1000)));
// Docker picks lines by its own clock, the proxy stamps them by the
// request's end; a minute either side, and the lines choose themselves.
const SLACK = 60_000;

export function listLogCommand(source: LogSource) {
  return command(
    source.type === "file" ? LIST_FILES : LIST_CONTAINER,
    valuesOf(source),
  );
}

/** Files are named as `listLog` found them; a container is read by time. */
export function readLogCommand(
  source: LogSource,
  files: string[],
  range: Span,
) {
  if (source.type === "container")
    return command(READ_CONTAINER, [
      ...valuesOf(source),
      seconds(range.from - SLACK),
      seconds(range.to + SLACK),
    ]);
  return command(READ_FILES, [
    ...valuesOf(source),
    ...rotatedOnly(source.path, files, true),
  ]);
}

/**
 * Rotated files to read first, then the file being written, followed: each
 * as the listing found it, so a rotation since then is noticed.
 */
export function followLogCommand(
  source: LogSource,
  files: Pick<LogFile, "name" | "inode" | "bytes">[],
  since: number,
) {
  if (source.type === "container")
    return command(FOLLOW_CONTAINER, [
      ...valuesOf(source),
      seconds(since - SLACK),
    ]);
  const current = baseOf(source.path);
  const rotated = files.filter((file) => file.name !== current);
  rotatedOnly(
    source.path,
    rotated.map((file) => file.name),
    false,
  );
  return command(FOLLOW_FILES, [
    ...valuesOf(source),
    ...[
      ...rotated,
      // Not there when listed: whatever the name holds now is new.
      files.find((file) => file.name === current) ?? {
        name: current,
        inode: null,
        bytes: 0,
      },
    ].flatMap((file) => [
      file.name,
      file.inode ?? "-",
      String(file.bytes ?? 0),
    ]),
  ]);
}

/** The last lines of the log, then each new one: the live stream's. */
export function liveLogCommand(source: LogSource) {
  return command(
    source.type === "file" ? LIVE_FILE : LIVE_CONTAINER,
    valuesOf(source),
  );
}

// A name read back from the server is used only if it is the log or one of
// its rotations, whatever else the directory holds.
function rotatedOnly(path: string, names: string[], current: boolean) {
  const base = baseOf(path);
  for (const name of names) {
    const rotation = rotationOf(base, name);
    if (!rotation || (!current && "current" in rotation))
      throw new Error(`Not a file of this log: ${name}`);
  }
  return names;
}

const baseOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");

/** The file being written, logrotate's numbered one, or Caddy's stamped one. */
type Rotation = { current: true } | { number: number } | { rolledAt: number };

/** How a name beside the log came to be there; null if it is not the log's. */
function rotationOf(base: string, name: string): Rotation | null {
  if (name === base) return { current: true };
  const numbered = new RegExp(`^${escaped(base)}\\.(\\d{1,5})(\\.gz)?$`).exec(
    name,
  );
  if (numbered) return { number: Number(numbered[1]) };
  const dot = base.lastIndexOf(".");
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot) : "";
  // Caddy 2.11 adds why it rolled (size, time, manual); older Caddy does not.
  const stamped = new RegExp(
    `^${escaped(stem)}-(\\d{4}-\\d\\d-\\d\\d)T(\\d\\d)-(\\d\\d)-(\\d\\d\\.\\d{3})(?:-[a-z]+)?${escaped(ext)}(\\.gz)?$`,
  ).exec(name);
  if (!stamped) return null;
  const rolledAt = Date.parse(
    `${stamped[1]}T${stamped[2]}:${stamped[3]}:${stamped[4]}Z`,
  );
  return Number.isFinite(rolledAt) ? { rolledAt } : null;
}

interface Found {
  name: string;
  bytes: number | null;
  modified: number;
  inode: string | null;
  first: number | null;
  rotation: Rotation;
}

/**
 * What a file listing says, oldest first. Two neighbouring files cover the
 * time between them unless one is missing between them: logrotate's numbers
 * skip one, or Caddy's next file began well after the moment it rolled.
 */
function filesOf(path: string, format: LogFormat, output: string[]): LogFile[] {
  const base = baseOf(path);
  let now: number | null = null;
  const found = new Map<string, Found>();
  let reading: Found | null = null;
  for (const text of output) {
    const said = /^hallvi-(now|file) (.*)$/.exec(text.trim());
    if (said?.[1] === "now") {
      now = Number(said[2]) * 1000;
    } else if (said?.[1] === "file") {
      const [name = "", bytes, modified, inode] = said[2].trim().split(/\s+/);
      const rotation = rotationOf(base, name);
      reading =
        rotation && !found.has(name) && Number.isFinite(Number(modified))
          ? {
              name,
              bytes: Number.isFinite(Number(bytes)) ? Number(bytes) : null,
              modified: Number(modified) * 1000,
              inode: inode && /^\d+$/.test(inode) ? inode : null,
              first: null,
              rotation,
            }
          : null;
      if (reading) found.set(name, reading);
    } else if (reading && reading.first === null) {
      reading.first = lineTime(format, text);
    }
  }
  const from = (file: Found) => file.first ?? file.modified;
  const files = [...found.values()].sort((a, b) =>
    "current" in a.rotation
      ? 1
      : "current" in b.rotation
        ? -1
        : from(a) - from(b),
  );
  return files.map((file, index) => {
    const next = files[index + 1];
    // The end of the second the file was last written in.
    let to = file.modified + 1000;
    if ("current" in file.rotation && now !== null) to = now + 1000;
    else if (next && adjacent(file, next, from(next))) to = from(next);
    return {
      name: file.name,
      bytes: file.bytes,
      modified: file.modified,
      inode: file.inode,
      from: from(file),
      to: Math.max(to, from(file)),
    };
  });
}

function adjacent(file: Found, next: Found, nextFrom: number) {
  const { rotation } = file;
  if ("number" in rotation)
    return "current" in next.rotation
      ? rotation.number === 1
      : "number" in next.rotation &&
          next.rotation.number === rotation.number - 1;
  // Caddy rolls on the write that would not fit, and that write opens the
  // next file: its first line is the moment in this file's name.
  if ("rolledAt" in rotation) return nextFrom <= rotation.rolledAt + 2000;
  return true;
}

const STAMP = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z)(?:\s|$)/;
const stampOf = (text: string) => {
  const stamp = STAMP.exec(text)?.[1];
  return stamp ? Date.parse(stamp) : null;
};

/** What a container listing says: its oldest retained line to now. */
export function containerOf(name: string, output: string[]): LogFile[] {
  const said = (key: string) =>
    output
      .find((text) => text.startsWith(`hallvi-${key} `))
      ?.slice(key.length + 8)
      .trim() ?? "";
  const first = said("first");
  if (!first) return [];
  const from = stampOf(first);
  // Without a time it is docker speaking: no such container, no permission.
  if (from === null) throw new Error(first.slice(0, 200));
  const now = Number(said("now")) * 1000;
  const last = stampOf(said("last")) ?? from;
  return [
    {
      name,
      bytes: null,
      modified: null,
      inode: null,
      from,
      to: Math.max(Number.isFinite(now) ? now + 1000 : last + 1, from),
    },
  ];
}

const optionsOf = (log: AccessLogRecord): ParseOptions => ({
  pageKey: log.pageKey,
  hosts: log.hosts,
});

/** The files the server still holds, oldest first, and what each covers. */
export async function listLog(
  host: Host,
  log: AccessLogRecord,
  signal?: AbortSignal,
) {
  const output: string[] = [];
  const { exitCode, said } = await onServer(
    host,
    listLogCommand(log.source),
    (text) => output.push(text),
    { signal },
  );
  signal?.throwIfAborted();
  if (exitCode !== 0)
    throw new Error(said || "The access log could not be listed.");
  return log.source.type === "file"
    ? filesOf(log.source.path, log.format, output)
    : containerOf(log.source.name, output);
}

/**
 * Every request of a range, in the order the log holds them, and how much of
 * the range the log could answer for. A range is `from` included, `to`
 * excluded, so neighbouring days never share a line.
 */
export async function readLog(
  host: Host,
  log: AccessLogRecord,
  range: Span,
  onLine: (line: TrafficLine) => void,
  signal?: AbortSignal,
): Promise<ReadResult> {
  const files = (await listLog(host, log, signal)).filter(
    (file) => file.from < range.to && file.to > range.from,
  );
  if (!files.length) return { covered: [], unreadable: [] };
  const options = optionsOf(log);
  const failed = new Set<string>();
  const listed = new Map(files.map((file) => [file.name, file]));
  const current = log.source.type === "file" ? baseOf(log.source.path) : "";
  // Rotation at the moment of reading — logrotate's nightly run meets the
  // recount of the day that just ended — leaves a name on another file: the
  // one being written starts again, a numbered one moves up. The file being
  // written only grows and a rotated one never changes, so either shows it,
  // and what it held is read again later under its new name.
  const moved = (file: LogFile, bytes: number, modified: number) =>
    file.name === current
      ? !(bytes >= (file.bytes ?? 0))
      : bytes !== file.bytes || modified !== file.modified;
  const { exitCode, said } = await onServer(
    host,
    readLogCommand(
      log.source,
      files.map((file) => file.name),
      range,
    ),
    (text) => {
      if (text.startsWith("hallvi-")) {
        const [marker, name = "", bytes, modified] = text.trim().split(/\s+/);
        const file = listed.get(name);
        if (
          marker === "hallvi-unreadable" ||
          (file && moved(file, Number(bytes), Number(modified) * 1000))
        )
          failed.add(name);
        return;
      }
      const line = parseLine(log.format, text, options);
      if (line && line.at >= range.from && line.at < range.to) onLine(line);
    },
    { signal },
  );
  signal?.throwIfAborted();
  if (exitCode !== 0)
    throw new Error(said || "The access log could not be read.");
  const within = (file: Span) => ({
    from: Math.max(file.from, range.from),
    to: Math.min(file.to, range.to),
  });
  return {
    covered: joined(files.filter((f) => !failed.has(f.name)).map(within)),
    unreadable: joined(files.filter((f) => failed.has(f.name)).map(within)),
  };
}

/**
 * Every request from `since` on, then each new one as it is written, until
 * the signal aborts or the connection ends. `files` is the listing the
 * caller measured coverage by: exactly those files are read, and `moved`
 * names the first one a rotation took from under it since, so the caller
 * lists again and starts over. What went wrong is in `said`.
 */
export async function followLog(
  host: Host,
  log: AccessLogRecord,
  files: LogFile[],
  since: number,
  on: {
    line: (line: TrafficLine) => void;
    ready?: () => void;
    /** A listed file that could not be read: its time is a gap. */
    unreadable?: (name: string) => void;
  },
  signal: AbortSignal,
) {
  const { source } = log;
  const options = optionsOf(log);
  let moved: string | null = null;
  const result = await onServer(
    host,
    followLogCommand(
      source,
      source.type === "file"
        ? files.filter(
            (file) => file.name === baseOf(source.path) || file.to > since,
          )
        : [],
      since,
    ),
    (text) => {
      const marker = /^hallvi-(moved|unreadable) (\S+)\s*$/.exec(text);
      if (marker?.[1] === "moved") moved = marker[2];
      else if (marker) on.unreadable?.(marker[2]);
      if (marker) return;
      const line = parseLine(log.format, text, options);
      if (line && line.at >= since) on.line(line);
    },
    { follow: true, signal, onReady: on.ready },
  );
  return { ...result, moved: moved as string | null };
}

function joined(spans: Span[]) {
  const sorted = spans
    .filter((span) => span.to > span.from)
    .sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  for (const span of sorted) {
    const last = out.at(-1);
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else out.push({ ...span });
  }
  return out;
}

// tail's word that the log rotated and it moved on: news, not a reason. Taken
// for one, a follow that later lost its connection blamed the rotation.
const ROTATED =
  /^tail: .*(has appeared|has been replaced|following new file|file truncated)/;

/**
 * Runs one of these commands on the server and hands on its output line by
 * line. What went wrong is said in words by ssh, sudo, docker or tail; a line
 * of the log itself is never an explanation — on a real server the last
 * unread line was Caddy's error entry, address and all.
 */
export function onServer(
  host: Host,
  remote: string,
  onText: (text: string) => void,
  {
    follow = false,
    signal,
    onReady = () => {},
  }: { follow?: boolean; signal?: AbortSignal; onReady?: () => void } = {},
) {
  return new Promise<{ exitCode: number | null; said: string }>(
    (resolve, reject) => {
      const child = spawn(
        "ssh",
        [
          ...managedSshOptions(host),
          // A follow gets a terminal, and the command as an argument rather
          // than on stdin. Without one, closing the page ended the SSH
          // session and left the follow running on the server until its next
          // write — on a quiet site, indefinitely. With one, the server hangs
          // the process up when the connection goes. A read that ends by
          // itself needs none, and its JSON compresses well on the way.
          ...(follow ? ["-tt"] : ["-o", "Compression=yes"]),
          "-o",
          "ConnectTimeout=10",
          // A page that says "live" has to find out quickly that it is not:
          // three missed answers, five seconds apart. At the shell's 15 and 2
          // a blackholed connection went on claiming live for 40 seconds.
          "-o",
          "ServerAliveInterval=5",
          "-o",
          "ServerAliveCountMax=3",
          "-o",
          "LogLevel=ERROR",
          `${host.user}@${host.address}`,
          remote,
        ],
        { signal, stdio: ["pipe", "pipe", "pipe"] },
      );
      // Left open and unused for a follow: end-of-input on a terminal is a
      // keystroke. A read has nothing to say to the server.
      child.stdin.on("error", () => {});
      if (!follow) child.stdin.end();
      let rest = "";
      let said = "";
      // Decoded as a stream: a character split across two reads stays whole.
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        // A terminal ends its lines with a carriage return as well. A line
        // that never ends is cut rather than held without limit.
        const lines = (rest + chunk).split(/\r?\n/);
        rest = (lines.pop() ?? "").slice(-256_000);
        for (const text of lines) {
          if (text.trim() === READY) {
            onReady();
            continue;
          }
          if (
            text.trim() &&
            !text.includes("{") &&
            !text.startsWith("hallvi-") &&
            !STAMP.test(text) &&
            !ROTATED.test(text)
          )
            said = text.trim().slice(0, 200);
          onText(text);
        }
      });
      child.stderr.on("data", (chunk: string) => {
        said = chunk.trim().slice(-300) || said;
      });
      child.on("error", (error) =>
        signal?.aborted ? resolve({ exitCode: null, said }) : reject(error),
      );
      child.on("close", (exitCode) => {
        // What was written last, without an end of line, is still a line.
        if (rest.trim() && rest.trim() !== READY) onText(rest);
        resolve({ exitCode, said });
      });
    },
  );
}
