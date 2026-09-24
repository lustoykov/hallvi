import type { NextRequest } from "next/server";

import { handle } from "@/server/http";
import { chatSnapshot, sendChatMessage } from "@/server/pi-conversation";
import {
  parseJsonRequest,
  sendChatMessageRequestSchema,
  assertSameOrigin,
  MAX_MESSAGE_REQUEST_CHARACTERS,
} from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string; chatId: string }> },
) {
  return handle(async () => {
    const { applicationId, chatId } = await context.params;
    const body = await parseJsonRequest(
      request,
      sendChatMessageRequestSchema,
      MAX_MESSAGE_REQUEST_CHARACTERS,
    );
    return Response.json(
      await sendChatMessage(
        applicationId,
        chatId,
        body.message,
        body.requestKey,
        body.delivery,
        body.images,
      ),
      // Accepted means Pi has durably taken it; its answer is still to come.
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
    return Response.json(await chatSnapshot(applicationId, chatId), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
