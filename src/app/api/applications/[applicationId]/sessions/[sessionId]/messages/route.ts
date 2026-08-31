import { NextRequest, NextResponse } from "next/server";

import { sendChatMessage } from "@/server/phase-one";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string; sessionId: string }> },
) {
  try {
    const { applicationId, sessionId } = await context.params;
    const body = (await request.json()) as { message?: string };
    return NextResponse.json(await sendChatMessage(applicationId, sessionId, body.message ?? ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pi could not respond.";
    return NextResponse.json({ error: message }, { status: message.startsWith("Pi is unavailable") ? 503 : 400 });
  }
}
