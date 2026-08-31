import { NextRequest, NextResponse } from "next/server";

import { ExistingApplicationConflictError, createPhaseOneApplication } from "@/server/phase-one";
import type { ApprovalMode } from "@/server/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      repositoryUrl?: string;
      approvalMode?: ApprovalMode;
    };
    const result = await createPhaseOneApplication({
      repositoryUrl: body.repositoryUrl ?? "",
      environment: "production",
      approvalMode: body.approvalMode ?? "pi-decides",
    });
    return NextResponse.json(result.view, { status: result.created ? 201 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the application." },
      { status: error instanceof ExistingApplicationConflictError ? 409 : 400 },
    );
  }
}
