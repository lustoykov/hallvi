// The owner's own interactive shell on an application's server.
//
// This is not Pi's execution: it is a separate SSH session the owner drives by
// hand. It reuses runHostCommand's credential and verification policy — the
// managed key, the pinned known-hosts file, strict host-key checking and batch
// authentication — but not its command lifecycle, because a shell has no
// deadline and no captured result. Sessions live in memory only; a controller
// restart means a new shell.

import { homedir } from "node:os";
import { spawn, type IPty } from "node-pty";

import { operatorSettings } from "./operator-execution";
import type { OperatorSettings } from "./operator-data";

type Host = NonNullable<OperatorSettings["host"]>;

export type TerminalFailure =
  "ssh-unavailable" | "credentials" | "host-key" | "timeout" | "unknown";

export type TerminalState =
  | { name: "connecting" }
  | { name: "connected" }
  | { name: "failed"; failure: TerminalFailure; detail: string }
  | { name: "ended"; code: number | null; signal: number | null };

export interface TerminalTarget {
  user: string;
  address: string;
  port: number;
}

interface Listener {
  output: (chunk: Buffer) => void;
  state: (state: TerminalState) => void;
}

/** The reasons ssh gives, in the order we should recognise them. */
const failures: { failure: TerminalFailure; detail: string; test: RegExp }[] = [
  {
    failure: "host-key",
    detail:
      "The server presented a different host key than the one on record. Haldur will not connect past that; ask in the conversation to review the connection.",
    test: /host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED|key_from_blob|no matching host key/i,
  },
  {
    failure: "credentials",
    detail:
      "The saved key was not accepted, so the server refused the login. Nothing was changed on the server.",
    test: /permission denied|no such identity|could not open a connection to your authentication agent|too many authentication failures/i,
  },
  {
    failure: "timeout",
    detail:
      "The server did not answer on SSH. It may be off, still starting, or unreachable from this machine.",
    test: /connection timed out|operation timed out|no route to host|network is unreachable|connection refused|could not resolve hostname/i,
  },
];

function classify(text: string): { failure: TerminalFailure; detail: string } {
  for (const entry of failures)
    if (entry.test.test(text))
      return { failure: entry.failure, detail: entry.detail };
  return {
    failure: "unknown",
    detail: "The SSH session ended before a prompt was ready.",
  };
}

/**
 * The same options runHostCommand uses, minus its command lifecycle: -tt asks
 * for a remote pty rather than -T's plain pipe, and no command is appended so
 * the login shell starts in the saved user's own home directory.
 */
function sshArguments(host: Host) {
  return [
    "-F",
    "/dev/null",
    "-tt",
    "-i",
    host.privateKeyPath,
    "-p",
    String(host.port),
    "-o",
    `UserKnownHostsFile=${host.knownHostsPath}`,
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "ConnectTimeout=10",
    "-o",
    "ServerAliveInterval=15",
    "-o",
    "ServerAliveCountMax=2",
    `${host.user}@${host.address}`,
  ];
}

export class TerminalSession {
  readonly id: string;
  readonly applicationId: string;
  readonly target: TerminalTarget;
  private pty: IPty | null = null;
  private listener: Listener | null = null;
  private opening = "";
  private state: TerminalState = { name: "connecting" };
  private disposed = false;

  constructor(
    id: string,
    applicationId: string,
    private readonly host: Host,
    size: Size,
  ) {
    this.id = id;
    this.applicationId = applicationId;
    this.target = { user: host.user, address: host.address, port: host.port };
    try {
      this.pty = spawn("ssh", sshArguments(host), {
        name: "xterm-256color",
        cols: size.cols,
        rows: size.rows,
        // The owner's own machine is where ssh runs; the remote shell starts
        // in the saved user's home directory because no command is given.
        cwd: homedir(),
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: process.env.HOME ?? homedir(),
          TERM: "xterm-256color",
          LANG: process.env.LANG ?? "en_US.UTF-8",
        },
      });
    } catch (error) {
      this.publish({
        name: "failed",
        failure: "ssh-unavailable",
        detail:
          (error as NodeJS.ErrnoException).code === "ENOENT"
            ? "No ssh client was found on this machine."
            : "The ssh client could not be started on this machine.",
      });
      return;
    }
    this.pty.onData((data) => this.received(data));
    this.pty.onExit(({ exitCode, signal }) => this.exited(exitCode, signal));
  }

  private received(data: string) {
    // Until a prompt is plausibly up, hold on to what ssh says: if it exits
    // now, that text is the only evidence of why.
    if (this.state.name === "connecting") {
      this.opening = (this.opening + data).slice(-4000);
      if (!failures.some((entry) => entry.test.test(this.opening)))
        this.publish({ name: "connected" });
    }
    this.listener?.output(Buffer.from(data, "utf8"));
  }

  private exited(code: number, signal: number | undefined) {
    this.pty = null;
    if (this.state.name === "connecting") {
      const { failure, detail } = classify(this.opening);
      this.publish({ name: "failed", failure, detail });
      return;
    }
    this.publish({ name: "ended", code, signal: signal ?? null });
  }

  private publish(state: TerminalState) {
    this.state = state;
    this.listener?.state(state);
  }

  /** One transport owns a session; attaching replaces any earlier listener. */
  attach(listener: Listener) {
    this.listener = listener;
    listener.state(this.state);
  }

  detach(listener: Listener) {
    if (this.listener === listener) this.listener = null;
  }

  get live() {
    return this.pty !== null;
  }

  get currentState(): TerminalState {
    return this.state;
  }

  /** An existing shell must never outlive a changed application target. */
  checkTarget() {
    let current: Host | null = null;
    try {
      current = hostFor(this.applicationId);
    } catch {
      // Removed applications and unreadable settings invalidate the session.
    }
    if (
      current &&
      current.address === this.host.address &&
      current.user === this.host.user &&
      current.port === this.host.port &&
      current.privateKeyPath === this.host.privateKeyPath &&
      current.knownHostsPath === this.host.knownHostsPath &&
      current.serverId === this.host.serverId &&
      current.providerConnectionId === this.host.providerConnectionId
    )
      return true;
    this.publish({
      name: "failed",
      failure: "credentials",
      detail:
        "The application's server connection changed. Connect again to use its current server.",
    });
    this.dispose();
    return false;
  }

  write(data: Buffer) {
    this.pty?.write(data.toString("utf8"));
  }

  resize(size: Size) {
    try {
      this.pty?.resize(size.cols, size.rows);
    } catch {
      // A pty that exited between the check and the call is not an error.
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.listener = null;
    const pty = this.pty;
    this.pty = null;
    if (!pty) return;
    try {
      pty.kill();
    } catch {
      // Already gone.
    }
  }
}

export interface Size {
  cols: number;
  rows: number;
}

/** Dimensions a real terminal could have; anything else is refused. */
export function readSize(value: unknown): Size | null {
  if (typeof value !== "object" || value === null) return null;
  const { cols, rows } = value as { cols?: unknown; rows?: unknown };
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) return null;
  const size = { cols: cols as number, rows: rows as number };
  if (size.cols < 2 || size.cols > 1000) return null;
  if (size.rows < 2 || size.rows > 500) return null;
  return size;
}

export function hostFor(applicationId: string) {
  return operatorSettings(applicationId).host;
}
