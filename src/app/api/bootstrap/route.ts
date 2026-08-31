import { NextRequest, NextResponse } from "next/server";

import { getPhaseOneView } from "@/server/phase-one";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session") ?? undefined;
  return NextResponse.json(getPhaseOneView(undefined, sessionId));
}
