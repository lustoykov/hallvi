import { NextRequest, NextResponse } from "next/server";

import { createChat } from "@/server/phase-one";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> },
) {
  try {
    const { applicationId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { title?: string };
    return NextResponse.json(createChat(applicationId, body.title), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the chat." },
      { status: 400 },
    );
  }
}
