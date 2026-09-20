import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// The loopback ports an installed Hallvi uses, all derived from one number.
//
// They are fixed rather than found because a browser on another machine has to
// know them in advance. On a virtual machine the owner forwards these ports
// over SSH, and a port chosen at run time — the terminal's, or whichever one Pi
// picked for an application — would be a port nobody forwarded. Forwarding the
// interface alone reaches the interface and nothing behind it.
export function installedPorts(env = process.env) {
  const web = Number(env.HALLVI_PORT?.trim() || 4747);
  if (!Number.isInteger(web) || web < 1024 || web > 65000)
    throw new Error("HALLVI_PORT must be a port from 1024 to 65000.");
  return {
    web,
    /** The browser terminal's WebSocket. */
    terminal: web + 1,
    /** Where private application links open, one port per open link. */
    privateFirst: web + 10,
    privateLast: web + 19,
  };
}

/** Every port a remote browser needs, for an SSH configuration to forward. */
export function forwardedPorts(ports) {
  const list = [ports.web, ports.terminal];
  for (let port = ports.privateFirst; port <= ports.privateLast; port++)
    list.push(port);
  return list;
}

/**
 * What the computer with the browser runs. The SSH settings go in a file of
 * their own, so ~/.ssh/config is never edited and running the first command
 * again after a port change simply replaces them.
 */
export function remoteAccess({ user, address, name, ports }) {
  const host =
    name
      .toLowerCase()
      .replace(/\.(local|lan)$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "server";
  const file = `~/.ssh/hallvi-${host}`;
  return {
    host,
    file,
    config: [
      `Host ${host}`,
      `  HostName ${address}`,
      `  User ${user}`,
      "  ExitOnForwardFailure yes",
      "  ServerAliveInterval 30",
      ...forwardedPorts(ports).map(
        (port) => `  LocalForward 127.0.0.1:${port} 127.0.0.1:${port}`,
      ),
    ].join("\n"),
    // A non-interactive SSH shell rarely has ~/.local/bin on its PATH.
    setup: `ssh ${user}@${address} '~/.local/bin/hallvi remote --config ${user}@${address}' > ${file}`,
    connect: `ssh -F ${file} -N ${host}`,
    url: `http://127.0.0.1:${ports.web}`,
  };
}

/**
 * Records a new interface port in the settings file, keeping every other line.
 * Only the file changes here; restarting the service is the caller's business.
 */
export function saveInstalledPort(settings, value) {
  const ports = installedPorts({ HALLVI_PORT: value });
  const kept = existsSync(settings)
    ? readFileSync(settings, "utf8")
        .split("\n")
        .filter((line) => line && !line.startsWith("HALLVI_PORT="))
    : [];
  mkdirSync(dirname(settings), { recursive: true, mode: 0o700 });
  writeFileSync(
    settings,
    `${[...kept, `HALLVI_PORT=${ports.web}`].join("\n")}\n`,
    { mode: 0o600 },
  );
  return ports;
}
