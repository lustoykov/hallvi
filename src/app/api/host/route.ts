import { execFileSync } from "node:child_process";
import { hostname } from "node:os";

import { NextResponse } from "next/server";

import { runningCheckout, runningRelease } from "@/server/hallvi-release";

export const runtime = "nodejs";
// Read when asked, never at build time: a packaged release must name the
// machine it runs on, not the one that built it.
export const dynamic = "force-dynamic";

function hostName() {
  const label = process.env.HALLVI_HOST_LABEL?.trim();
  if (label) return label;
  // macOS hostnames can follow DHCP and become an IP address. ComputerName
  // is the friendly name the owner sees in System Settings.
  if (process.platform === "darwin") {
    try {
      const name = execFileSync("/usr/sbin/scutil", ["--get", "ComputerName"], {
        encoding: "utf8",
        timeout: 1_000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (name) return name;
    } catch {
      // Fall back to the hostname if the friendly name is unavailable.
    }
  }
  return hostname().replace(/\.(local|lan)$/i, "") || "this computer";
}

/**
 * Which machine this controller runs on, and which Hallvi is answering. Two
 * Hallvis reached through two loopback ports look identical in a browser, and
 * the owner opened the wrong one for a day. The name comes from this server,
 * not the browser or the address used to reach it, so forwarding a port does
 * not change the identity.
 *
 * On a development machine the installed Hallvi and every checkout share that
 * name, so a checkout also says which checkout it is and which retained
 * application it is attached to.
 *
 * The version and revision are here rather than somewhere of their own
 * because an update is finished when *this* process says it is the new one.
 * A swapped directory is not that; an answer from the program running in it
 * is.
 */
export function GET() {
  const release = runningRelease();
  return NextResponse.json({
    name: hostName(),
    version: release?.version ?? null,
    revision: release?.revision ?? null,
    development: runningCheckout(),
  });
}
