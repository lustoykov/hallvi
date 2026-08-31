import { NextRequest, NextResponse } from "next/server";

import { createPhaseOneApplication } from "@/server/phase-one";
import type { ApprovalMode } from "@/server/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      repositoryUrl?: string;
      approvalMode?: ApprovalMode;
    };
    const view = await createPhaseOneApplication({
      repositoryUrl: body.repositoryUrl ?? "",
      environment: "production",
      approvalMode: body.approvalMode ?? "pi-decides",
    });
    return NextResponse.json(view, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the application." },
      { status: 400 },
    );
  }
}
