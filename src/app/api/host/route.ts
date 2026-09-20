import { hostname } from "node:os";

import { NextResponse } from "next/server";

import { quietUpdateHint, runningRelease } from "@/server/hallvi-release";

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
    // Read from the last check, never a look of its own: this answers on
    // every page, and a page load is not a reason to talk to GitHub.
    update: quietUpdateHint(),
  });
}
