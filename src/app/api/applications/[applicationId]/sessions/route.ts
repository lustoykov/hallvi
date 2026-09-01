import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { handle } from "@/server/http";
import { createOperatorSession } from "@/server/phase-one";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const { applicationId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { title?: string };
    return NextResponse.json(createOperatorSession(applicationId, body.title), { status: 201 });
  });
}
