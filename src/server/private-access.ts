import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { operatorSettings } from "./operator-execution";

const exec = promisify(execFile);
const optionsSchema = z.object({
  remotePort: z.number().int().min(1).max(65535),
  localPort: z.number().int().min(1024).max(65535).optional(),
});

/**
 * The ports an installation opens private links on, when it fixes them.
 *
 * An installed Hallvi may be on a virtual machine, with its owner's
 * browser on another machine reaching it over SSH. A link on a port nobody
 * forwarded opens nothing there, so the installation names a small range in
 * advance, the owner forwards exactly that range, and links stay inside it.
 * Development leaves this unset and keeps choosing freely.
 */
function privateRange() {
  const match = /^(\d+)-(\d+)$/.exec(
    process.env.HALLVI_PRIVATE_PORTS?.trim() ?? "",
  );
  return match ? { first: Number(match[1]), last: Number(match[2]) } : null;
}

function free(port: number) {
  return new Promise<boolean>((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

function controlSocket(
  applicationId: string,
  host: unknown,
  remotePort: number,
  localPort: number,
) {
  const identity = createHash("sha256")
    .update(JSON.stringify([applicationId, host, remotePort, localPort]))
    .digest("hex")
    .slice(0, 24);
  // Keep control socket paths short enough for macOS Unix sockets.
  return join(`/tmp/hallvi-ssh-${process.getuid!()}`, identity);
}

async function masterAlive(
  socket: string,
  target: string,
  signal?: AbortSignal,
) {
  try {
    await exec(
      "ssh",
      [
        "-F",
        "/dev/null",
        "-S",
        socket,
        "-o",
        "BatchMode=yes",
        "-O",
        "check",
        target,
      ],
      { timeout: 5000, signal },
    );
    return true;
  } catch {
    return false;
  }
}

/** Local forwarding only; neither end can bind a public interface. */
export async function openServerPort(
  applicationId: string,
  options: z.input<typeof optionsSchema>,
  signal?: AbortSignal,
) {
  const parsed = optionsSchema.parse(options);
  const { remotePort } = parsed;
  const host = operatorSettings(applicationId).host;
  if (!host) throw new Error("Connect a server before opening private access.");
  signal?.throwIfAborted();
  mkdirSync(`/tmp/hallvi-ssh-${process.getuid!()}`, {
    recursive: true,
    mode: 0o700,
  });
  const target = `${host.user}@${host.address}`;
  const range = privateRange();
  let localPort = parsed.localPort ?? 8080;
  if (range) {
    const { first, last } = range;
    if (
      parsed.localPort !== undefined &&
      (parsed.localPort < first || parsed.localPort > last)
    )
      throw new Error(
        `This installation opens private links on ports ${first}-${last} only, because those are the ports its owner forwards to their browser. Omit localPort and one is chosen.`,
      );
    if (parsed.localPort === undefined) {
      // The link this application already has comes first, then a free port.
      // A master holds its port, so only occupied ports are worth asking ssh.
      let chosen: number | undefined;
      let open: number | undefined;
      for (let port = first; port <= last && chosen === undefined; port++) {
        signal?.throwIfAborted();
        if (await free(port)) open ??= port;
        else if (
          await masterAlive(
            controlSocket(applicationId, host, remotePort, port),
            target,
            signal,
          )
        )
          chosen = port;
      }
      chosen ??= open;
      if (chosen === undefined)
        throw new Error(
          `Every private link port (${first}-${last}) is in use on the machine running Hallvi.`,
        );
      localPort = chosen;
    }
  }
  const socket = controlSocket(applicationId, host, remotePort, localPort);
  const connection = [
    "-F",
    "/dev/null",
    "-S",
    socket,
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
  ];
  let reused = false;
  try {
    await exec("ssh", [...connection, "-O", "check", target], {
      signal,
      timeout: 15000,
    });
    reused = true;
  } catch {
    signal?.throwIfAborted();
    await exec(
      "ssh",
      [
        ...connection,
        "-M",
        "-f",
        "-N",
        "-T",
        "-o",
        "ExitOnForwardFailure=yes",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=2",
        "-L",
        `127.0.0.1:${localPort}:127.0.0.1:${remotePort}`,
        target,
      ],
      { signal, timeout: 20000 },
    );
  }
  const url = `http://127.0.0.1:${localPort}`;
  let httpStatus: number | null = null;
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000),
    });
    httpStatus = response.status;
    await response.body?.cancel();
  } catch {
    signal?.throwIfAborted();
  }
  return {
    url,
    httpStatus,
    remotePort,
    localPort,
    reused,
    access: range
      ? "On the machine running Hallvi, while its SSH tunnel is alive, and in the owner's browser on another machine when they forward this installation's ports to it. This does not change server listeners or firewalls; verify those separately."
      : "Only on the PC running Hallvi, while its SSH tunnel is alive. This does not change server listeners or firewalls; verify those separately.",
    // 127.0.0.1 means a different machine in each of the three places this
    // operator works, and the workspace is the one that looks most like the
    // controller and is least like it. Saying so here costs nothing; finding
    // out by running curl costs a turn and reads as a broken tunnel.
    verifiedFrom:
      httpStatus === null
        ? "The controller asked this URL and got no answer. Your workspace shell cannot test it either — the workspace has its own loopback, not this PC's. Check the application on the server with server_bash."
        : `The controller asked this URL itself and got HTTP ${httpStatus}. Do not check it from your workspace shell: the workspace has its own loopback, not this PC's, so curl there fails however well the tunnel works.`,
  };
}

/**
 * Whether the tunnel this controller opened is still there.
 *
 * A private URL is only reachable while an SSH master this process started is
 * alive, and that master dies with a restart, a reboot, or a lost network. The
 * record that says "reached at 127.0.0.1:38123" was true when it was written
 * and the page kept offering the link long after it had stopped working — the
 * one link on the page a reader will actually click.
 *
 * `ssh -O check` against the same control socket is the product's own answer
 * to its own question, so this is an observation rather than a guess.
 */
export async function privateAccessOpen(
  applicationId: string,
  remotePort: number,
  localPort: number,
) {
  const host = operatorSettings(applicationId).host;
  if (!host) return false;
  return masterAlive(
    controlSocket(applicationId, host, remotePort, localPort),
    `${host.user}@${host.address}`,
  );
}
