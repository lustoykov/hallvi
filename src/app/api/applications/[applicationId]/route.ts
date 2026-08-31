import { NextResponse } from "next/server";

import { getPhaseOneView } from "@/server/phase-one";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  try {
    const { applicationId } = await context.params;
    return NextResponse.json(getPhaseOneView(applicationId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Application not found." },
      { status: 404 },
    );
  }
}
