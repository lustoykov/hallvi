import type { NextRequest } from "next/server";

import { handle } from "@/server/http";
import { sendOperatorMessage } from "@/server/phase-one";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string; sessionId: string }> },
) {
  return handle(async () => {
    const { applicationId, sessionId } = await context.params;
    const body = (await request.json()) as { message?: string };
    return sendOperatorMessage(applicationId, sessionId, body.message ?? "");
  });
}
