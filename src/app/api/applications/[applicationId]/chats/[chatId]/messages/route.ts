import type { NextRequest } from "next/server";

import { handle } from "@/server/http";
import { sendChatMessage } from "@/server/phase-one";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string; chatId: string }> },
) {
  return handle(async () => {
    const { applicationId, chatId } = await context.params;
    const body = (await request.json()) as { message?: string };
    return sendChatMessage(applicationId, chatId, body.message ?? "");
  });
}
