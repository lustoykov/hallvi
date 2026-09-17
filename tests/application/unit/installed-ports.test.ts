import { expect, it } from "vitest";

import {
  forwardedPorts,
  installedPorts,
} from "../../../scripts/installed-ports.mjs";

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
