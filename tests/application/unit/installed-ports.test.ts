import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";

import {
  forwardedPorts,
  installedPorts,
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
  expect(installedPorts({ HALDUR_PORT: "5100" }).terminal).toBe(5101);
  expect(() => installedPorts({ HALDUR_PORT: "80" })).toThrow();
});

it("binds every generated laptop forward explicitly to loopback", () => {
  const home = mkdtempSync(join(tmpdir(), "haldur-remote-"));
  temporary.push(home);
  const output = execFileSync(
    process.execPath,
    ["scripts/cli.mjs", "remote", "owner@example.test"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: home,
        HALDUR_DATA_DIR: join(home, "state"),
      },
    },
  );
  for (const port of forwardedPorts(installedPorts({})))
    expect(output).toContain(
      `LocalForward 127.0.0.1:${port} 127.0.0.1:${port}`,
    );
});
