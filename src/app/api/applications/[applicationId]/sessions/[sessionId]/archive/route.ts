import { NextResponse } from "next/server";

import { archiveOperatorSession } from "@/server/phase-one";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ applicationId: string; sessionId: string }> },
) {
  try {
    const { applicationId, sessionId } = await context.params;
    return NextResponse.json(archiveOperatorSession(applicationId, sessionId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not archive the chat." },
      { status: 400 },
    );
  }
}
