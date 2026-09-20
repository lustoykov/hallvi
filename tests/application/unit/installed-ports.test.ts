import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

import {
  forwardedPorts,
  installedPorts,
  saveInstalledPort,
} from "../../../scripts/installed-ports.mjs";

const temporary: string[] = [];

afterEach(() => {
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
});

it("derives every loopback port from one number, without overlap", () => {
  const ports = installedPorts({});
  expect(ports.web).toBe(4747);
  const all = forwardedPorts(ports);
  expect(new Set(all).size).toBe(all.length);
  expect(all).toContain(ports.terminal);
  expect(all).toContain(ports.privateLast);
  expect(installedPorts({ HALLVI_PORT: "5100" }).terminal).toBe(5101);
  expect(() => installedPorts({ HALLVI_PORT: "80" })).toThrow();
});

function hallvi(home: string, ...args: string[]) {
  return execFileSync(process.execPath, ["scripts/cli.mjs", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      HALLVI_DATA_DIR: join(home, "state"),
      SSH_CONNECTION: "",
    },
  });
}

it("hands the other computer two commands and forwards every port to loopback", () => {
  const home = mkdtempSync(join(tmpdir(), "hallvi-remote-"));
  temporary.push(home);
  const config = hallvi(home, "remote", "--config", "owner@example.test");
  expect(config).toContain("HostName example.test");
  expect(config).toContain("ExitOnForwardFailure yes");
  for (const port of forwardedPorts(installedPorts({})))
    expect(config).toContain(
      `LocalForward 127.0.0.1:${port} 127.0.0.1:${port}`,
    );
  // The guide names a real target, never a placeholder to edit, and keeps
  // the owner's own ~/.ssh/config out of it.
  const guide = hallvi(home, "remote", "owner@example.test");
  expect(guide).toContain("ssh owner@example.test '~/.local/bin/hallvi remote");
  expect(guide).toMatch(/ssh -F ~\/\.ssh\/hallvi-\S+ -N \S+/);
  expect(guide).not.toContain("server-address");
  expect(guide).not.toContain(">> ~/.ssh/config");
});

// Never through the command: `hallvi port` restarts the service, and launchd
// knows one `com.hallvi` per user whatever HOME says, so running it here would
// replace the developer's own installation.
it("moves every port together and keeps the other settings", () => {
  const home = mkdtempSync(join(tmpdir(), "hallvi-port-"));
  temporary.push(home);
  const settings = join(home, "state", "hallvi.env");
  mkdirSync(join(home, "state"));
  writeFileSync(settings, "HALLVI_PORT=4747\nHALLVI_TRACING=0\n");
  expect(forwardedPorts(saveInstalledPort(settings, "5747"))).toContain(5766);
  expect(readFileSync(settings, "utf8")).toBe(
    "HALLVI_TRACING=0\nHALLVI_PORT=5747\n",
  );
  expect(() => saveInstalledPort(settings, "80")).toThrow();
  expect(readFileSync(settings, "utf8")).toContain("HALLVI_PORT=5747");
});
