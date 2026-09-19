import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createChat } from "@/server/applications";
import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import { createChatRequestSchema, parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const { applicationId } = await context.params;
    const body = await parseJsonRequest(request, createChatRequestSchema);
    const chat = createChat(applicationId, body.title);
    return NextResponse.json(await getOperatorView(applicationId, chat.id), {
      status: 201,
    });
  });
}
