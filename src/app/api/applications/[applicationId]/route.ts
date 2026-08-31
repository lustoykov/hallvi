import { NextRequest, NextResponse } from "next/server";

import { getPhaseOneOperatorView } from "@/server/phase-one";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> },
) {
  try {
    const { applicationId } = await context.params;
    const sessionId = request.nextUrl.searchParams.get("session") ?? undefined;
    return NextResponse.json(getPhaseOneOperatorView(applicationId, sessionId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Application not found." },
      { status: 404 },
    );
  }
}
