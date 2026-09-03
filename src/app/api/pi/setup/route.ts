import { NextResponse } from "next/server";

import { getPiSetupStatus } from "@/server/pi-setup";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getPiSetupStatus());
}
