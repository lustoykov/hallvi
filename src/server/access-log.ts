// The proxy's access log, followed while somebody is looking.
//
// Overview draws requests as they arrive. Nothing collects between looks, so
// "live" has to mean live: the controller opens one SSH session per open
// page, follows the log, and closes it when the page goes away.
//
// The command is the controller's, not Pi's. It is one of two fixed shapes
// built from an `access-log` record whose fields cannot carry shell, it only
// reads, and it is the same kind of thing as the machine check on the
// connections card. That is why it sits outside the permission boundary: the
// boundary decides whether model-authored commands run, and there is no
// model-authored text here to decide about.
import { createHash, randomBytes } from "node:crypto";

import type { InformationContent, OperatorSettings } from "./operator-data";
import { listInformation } from "./saved-information";
import { LOG_FORMATS, type TrafficLine } from "./traffic/contract";
import { parseLine } from "./traffic/parse";
import { onServer, READY } from "./traffic/sources";

export { HALLVI_USER_AGENT } from "./traffic/parse";

export type AccessLogSource = Extract<
  InformationContent,
  { kind: "access-log" }
>["source"];

/** One request, with nothing in it that identifies the person who made it. */
export interface AccessLine {
  at: number;
  method: string;
  /** The path only. Query strings carry tokens and search terms. */
  path: string;
  status: number;
  ms: number;
  /** Stable for one controller process, meaningless outside it. */
  visitor: string;
}

/** Where the newest current record says the log is, if any record does. */
export function accessLogSource(applicationId: string): AccessLogSource | null {
  for (const record of listInformation(applicationId)) {
    const content = record.presentation?.content;
    if (content?.kind === "access-log") return content.source;
  }
  return null;
}

/**
 * What the stream says about itself. `no-server` and `no-log` are answers,
 * not errors: the page draws them, and the second offers to ask Hallvi to
 * turn access logging on.
 */
export type TrafficEvent =
  | { type: "state"; state: "no-server" | "no-log" | "connecting" | "live" }
  | { type: "state"; state: "lost"; detail: string }
  | { type: "lines"; lines: AccessLine[] };

/** A few minutes of backlog so the page opens on something, then follow. */
export function followCommand(source: AccessLogSource) {
  const readable =
    source.type === "file"
      ? `test -r '${source.path}' || { echo 'The access log is not readable.'; exit 1; }; `
      : "";
  return `${readable}echo ${READY}; ${followOnly(source)}`;
}
function followOnly(source: AccessLogSource) {
  if (source.type === "file") return `exec tail -n 400 -F '${source.path}'`;
  const logs = `logs --since 5m --follow '${source.name}'`;
  return `if docker ps >/dev/null 2>&1; then exec docker ${logs} 2>&1; else exec sudo -n docker ${logs} 2>&1; fi`;
}

// Addresses never leave the controller. The page only needs to tell visitors
// apart, and the salt dies with the process so the label cannot be joined to
// anything kept elsewhere.
const salt = randomBytes(16);
const visitorOf = (address: string) =>
  createHash("sha256").update(salt).update(address).digest("hex").slice(0, 10);

const accessLineOf = (line: TrafficLine | null): AccessLine | null =>
  line && {
    at: line.at,
    method: line.method || "GET",
    path: line.path.slice(0, 200),
    status: line.status,
    ms: line.ms,
    visitor: visitorOf(line.address),
  };

/** One line of Caddy's JSON access log, or null for anything else. */
export function parseCaddyLine(line: string): AccessLine | null {
  return accessLineOf(parseLine("caddy-json", line));
}

/**
 * One line of any log Hallvi reads, or null for anything else. The stream is
 * told where the log is, not what wrote it, and no format's line can be taken
 * for another's.
 */
export function parseAccessLine(text: string): AccessLine | null {
  for (const format of LOG_FORMATS) {
    const line = parseLine(format, text);
    if (line) return accessLineOf(line);
  }
  return null;
}

/** Follows the log until the signal aborts or the session ends. */
export function followAccessLog(
  host: NonNullable<OperatorSettings["host"]>,
  source: AccessLogSource,
  onLine: (line: AccessLine) => void,
  signal: AbortSignal,
  onReady: () => void = () => {},
) {
  // The command holds no `$`, backtick or double quote: its only variable
  // part is a name or path whose shape excludes them.
  return onServer(
    host,
    `bash -c "${followCommand(source)}"`,
    (text) => {
      const line = parseAccessLine(text);
      if (line) onLine(line);
    },
    { follow: true, signal, onReady },
  );
}
