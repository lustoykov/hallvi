import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { operatorSettings } from "./operator-execution";

const exec = promisify(execFile);
const optionsSchema = z.object({
  remotePort: z.number().int().min(1).max(65535),
  localPort: z.number().int().min(1024).max(65535).default(8080),
});

/** Local forwarding only; neither end can bind a public interface. */
export async function openServerPort(
  applicationId: string,
  options: z.input<typeof optionsSchema>,
  signal?: AbortSignal,
) {
  const { remotePort, localPort } = optionsSchema.parse(options);
  const host = operatorSettings(applicationId).host;
  if (!host) throw new Error("Connect a server before opening private access.");
  signal?.throwIfAborted();
  // Keep control socket paths short enough for macOS Unix sockets.
  const directory = `/tmp/server-guy-ssh-${process.getuid!()}`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const identity = createHash("sha256")
    .update(JSON.stringify([applicationId, host, remotePort, localPort]))
    .digest("hex")
    .slice(0, 24);
  const socket = join(directory, identity);
  const target = `${host.user}@${host.address}`;
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
    access:
      "Only on the PC running Server Guy, while its SSH tunnel is alive. This does not change server listeners or firewalls; verify those separately.",
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
  const identity = createHash("sha256")
    .update(JSON.stringify([applicationId, host, remotePort, localPort]))
    .digest("hex")
    .slice(0, 24);
  const socket = join(`/tmp/server-guy-ssh-${process.getuid!()}`, identity);
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
        `${host.user}@${host.address}`,
      ],
      { timeout: 5000 },
    );
    return true;
  } catch {
    return false;
  }
}
