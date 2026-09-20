import { hostname } from "node:os";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
// Read when asked, never at build time: a packaged release must name the
// machine it runs on, not the one that built it.
export const dynamic = "force-dynamic";

/**
 * Which machine this controller runs on. Two Hallvis reached through two
 * loopback ports look identical in a browser, and the owner opened the wrong
 * one for a day. The name is what `hostname` prints: nothing secret, nothing
 * the person who can already open this page could not read in a terminal.
 */
export function GET() {
  return NextResponse.json({
    name: hostname().replace(/\.(local|lan)$/i, "") || "this computer",
  });
}
