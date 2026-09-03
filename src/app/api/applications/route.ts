import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { handle } from "@/server/http";
import { createPhaseOneApplication } from "@/server/phase-one";
import { isApprovalMode } from "@/server/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = (await request.json()) as {
      repositoryUrl?: unknown;
      approvalMode?: unknown;
    };
    if (!isApprovalMode(body.approvalMode)) {
      throw new Error("Choose a valid permission policy.");
    }
    const result = await createPhaseOneApplication({
      repositoryUrl: typeof body.repositoryUrl === "string" ? body.repositoryUrl : "",
      environment: "production",
      approvalMode: body.approvalMode,
    });
    return NextResponse.json(result.view, { status: result.created ? 201 : 200 });
  });
}
