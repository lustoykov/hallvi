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
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";

import { managedSshOptions } from "./managed-ssh";
import type { InformationContent, OperatorSettings } from "./operator-data";
import { listInformation } from "./saved-information";

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

/** Printed by the server before the first line, so "live" means connected. */
const READY = "hallvi-following";

/** A few minutes of backlog so the page opens on something, then follow. */
export function followCommand(source: AccessLogSource) {
  return `echo ${READY}; ${followOnly(source)}`;
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

/** One line of Caddy's JSON access log, or null for anything else. */
export function parseCaddyLine(line: string): AccessLine | null {
  const start = line.indexOf("{");
  if (start < 0) return null;
  let entry: {
    ts?: unknown;
    status?: unknown;
    duration?: unknown;
    request?: {
      method?: unknown;
      uri?: unknown;
      client_ip?: unknown;
      remote_ip?: unknown;
    };
  };
  try {
    entry = JSON.parse(line.slice(start));
  } catch {
    return null;
  }
  const request = entry.request;
  if (
    !request ||
    typeof request.uri !== "string" ||
    typeof entry.status !== "number"
  )
    return null;
  const address = request.client_ip ?? request.remote_ip;
  return {
    at: typeof entry.ts === "number" ? Math.round(entry.ts * 1000) : Date.now(),
    method: typeof request.method === "string" ? request.method : "GET",
    path: request.uri.split(/[?#]/)[0].slice(0, 200) || "/",
    status: entry.status,
    ms:
      typeof entry.duration === "number"
        ? Math.round(entry.duration * 1000)
        : 0,
    visitor: visitorOf(typeof address === "string" ? address : ""),
  };
}

/** Follows the log until the signal aborts or the session ends. */
export function followAccessLog(
  host: NonNullable<OperatorSettings["host"]>,
  source: AccessLogSource,
  onLine: (line: AccessLine) => void,
  signal: AbortSignal,
  onReady: () => void = () => {},
) {
  return new Promise<{ exitCode: number | null; said: string }>(
    (resolve, reject) => {
      const child = spawn(
        "ssh",
        [
          ...managedSshOptions(host),
          "-T",
          "-o",
          "ConnectTimeout=10",
          "-o",
          "ServerAliveInterval=15",
          "-o",
          "ServerAliveCountMax=2",
          `${host.user}@${host.address}`,
          "bash -s",
        ],
        { signal },
      );
      let rest = "";
      let said = "";
      child.stdout.on("data", (chunk: Buffer) => {
        const lines = (rest + chunk.toString("utf8")).split("\n");
        rest = (lines.pop() ?? "").slice(-20_000);
        for (const text of lines) {
          if (text.trim() === READY) {
            onReady();
            continue;
          }
          const parsed = parseCaddyLine(text);
          if (parsed) onLine(parsed);
          else if (text.trim()) said = text.trim().slice(0, 300);
        }
      });
      child.stderr.on("data", (chunk: Buffer) => {
        said = chunk.toString("utf8").trim().slice(-300) || said;
      });
      child.on("error", (error) =>
        signal.aborted ? resolve({ exitCode: null, said }) : reject(error),
      );
      child.on("close", (exitCode) => resolve({ exitCode, said }));
      child.stdin.on("error", () => {});
      child.stdin.end(followCommand(source) + "\n");
    },
  );
}
