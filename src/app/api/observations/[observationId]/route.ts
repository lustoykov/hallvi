import { NextResponse } from "next/server";

import { getObservation } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ observationId: string }> },
) {
  const { observationId } = await context.params;
  const observation = getObservation(observationId);
  if (!observation) return NextResponse.json({ error: "Observation not found." }, { status: 404 });
  return NextResponse.json(observation);
}
