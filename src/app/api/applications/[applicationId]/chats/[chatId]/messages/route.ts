import type { NextRequest } from "next/server";

import { handle } from "@/server/http";
import { chatRunSnapshot, sendChatMessage } from "@/server/pi-runs";
import {
  parseJsonRequest,
  sendChatMessageRequestSchema,
  assertSameOrigin,
} from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string; chatId: string }> },
) {
  return handle(async () => {
    const { applicationId, chatId } = await context.params;
    const body = await parseJsonRequest(request, sendChatMessageRequestSchema);
    return Response.json(
      sendChatMessage(applicationId, chatId, body.message, body.requestKey),
      { status: 202 },
    );
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string; chatId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, chatId } = await context.params;
    return Response.json(chatRunSnapshot(applicationId, chatId), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
