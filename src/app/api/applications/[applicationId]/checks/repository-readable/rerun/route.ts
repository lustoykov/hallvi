import { NextResponse } from "next/server";

import { getPhaseOneOperatorView, observeRepository } from "@/server/phase-one";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  try {
    const { applicationId } = await context.params;
    await observeRepository(applicationId);
    return NextResponse.json(getPhaseOneOperatorView(applicationId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not rerun the repository check." },
      { status: 400 },
    );
  }
}
