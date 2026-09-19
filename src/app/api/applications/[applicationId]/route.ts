import type { NextRequest } from "next/server";

import { z } from "zod";

import { removeApplication, renameApplication } from "@/server/applications";
import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import {
  assertSameOrigin,
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

/** Renames the application. The name is a label; nothing is keyed on it. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { name } = await parseJsonRequest(
      request,
      z.strictObject({ name: z.string().trim().min(1).max(120) }),
    );
    const { applicationId } = await context.params;
    return { application: renameApplication(applicationId, name) };
  });
}
