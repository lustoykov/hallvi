import type { NextRequest } from "next/server";

import { removeApplication } from "@/server/applications";
import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import {
  parseJsonRequest,
  removeApplicationRequestSchema,
} from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const { applicationId } = await context.params;
    const chatId = request.nextUrl.searchParams.get("chat") ?? undefined;
    return getOperatorView(applicationId, chatId);
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const { repository } = await parseJsonRequest(
      request,
      removeApplicationRequestSchema,
    );
    const { applicationId } = await context.params;
    return removeApplication(applicationId, repository);
  });
}
