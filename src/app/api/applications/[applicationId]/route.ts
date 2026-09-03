import type { NextRequest } from "next/server";

import { handle } from "@/server/http";
import { getPhaseOneOperatorView } from "@/server/phase-one";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const { applicationId } = await context.params;
    const chatId = request.nextUrl.searchParams.get("chat") ?? undefined;
    return getPhaseOneOperatorView(applicationId, chatId);
  });
}
