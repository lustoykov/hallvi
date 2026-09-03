import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { handle } from "@/server/http";
import { createPhaseOneApplication } from "@/server/phase-one";
import { createApplicationRequestSchema, parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await parseJsonRequest(request, createApplicationRequestSchema);
    const result = await createPhaseOneApplication({
      repositoryUrl: body.repositoryUrl,
      environment: "production",
      approvalMode: body.approvalMode,
    });
    return NextResponse.json(result.view, { status: result.created ? 201 : 200 });
  });
}
