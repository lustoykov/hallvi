import { NextResponse } from "next/server";

import { piLoginCoordinator } from "@/server/pi-setup";

export const runtime = "nodejs";

export function POST() {
  return NextResponse.json(piLoginCoordinator.start(), { status: 202 });
}
