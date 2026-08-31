import { NextResponse } from "next/server";

import { getDecision } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ decisionId: string }> },
) {
  const { decisionId } = await context.params;
  const decision = getDecision(decisionId);
  if (!decision) return NextResponse.json({ error: "Decision not found." }, { status: 404 });
  return NextResponse.json(decision);
}
