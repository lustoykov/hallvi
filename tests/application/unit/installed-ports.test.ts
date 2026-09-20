import { execFileSync, spawnSync } from "node:child_process";
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

it("refuses a foreign service before changing the stored port", () => {
  const home = mkdtempSync(join(tmpdir(), "hallvi-port-owner-"));
  temporary.push(home);
  const bin = join(home, "bin");
  const state = join(home, "state");
  mkdirSync(bin);
  mkdirSync(state);
  const original = "HALLVI_PORT=4747\nHALLVI_TRACING=0\n";
  const settings = join(state, "hallvi.env");
  writeFileSync(settings, original);
  // Stub the service manager itself: even a broken guard cannot touch the
  // owner's real service. HOME alone is not isolation from launchd/systemd.
  for (const command of ["launchctl", "systemctl"]) {
    writeFileSync(
      join(bin, command),
      `#!/bin/sh
case " $* " in
  *" print "*) printf 'working directory = /another/hallvi/app\n' ;;
  *" show "*) printf 'WorkingDirectory=/another/hallvi/app\n' ;;
  *) printf 'unexpected mutation\n' >> '${join(home, "unexpected")}' ;;
esac
`,
      { mode: 0o700 },
    );
  }
  const result = spawnSync(
    process.execPath,
    ["scripts/cli.mjs", "port", "5747"],
    {
      encoding: "utf8",
      env: { ...process.env, HOME: home, HALLVI_DATA_DIR: state, PATH: bin },
    },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("belongs to another installation");
  expect(readFileSync(settings, "utf8")).toBe(original);
  expect(() => readFileSync(join(home, "unexpected"))).toThrow();
});
