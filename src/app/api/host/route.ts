import { hostname } from "node:os";

import { NextResponse } from "next/server";

import { runningCheckout, runningRelease } from "@/server/hallvi-release";

export const runtime = "nodejs";
// Read when asked, never at build time: a packaged release must name the
// machine it runs on, not the one that built it.
export const dynamic = "force-dynamic";

/**
 * Which machine this controller runs on, and which Hallvi is answering. Two
 * Hallvis reached through two loopback ports look identical in a browser, and
 * the owner opened the wrong one for a day. The name is what `hostname`
 * prints: nothing secret, nothing the person who can already open this page
 * could not read in a terminal.
 *
 * On the owner's MacBook the installed Hallvi and every checkout share that
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
    name: hostname().replace(/\.(local|lan)$/i, "") || "this computer",
    version: release?.version ?? null,
    revision: release?.revision ?? null,
    development: runningCheckout(),
  });
}
