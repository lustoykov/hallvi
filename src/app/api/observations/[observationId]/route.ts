import { getObservation } from "@/server/db";
import { handle } from "@/server/http";
import { NotFoundError } from "@/server/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ observationId: string }> },
) {
  return handle(async () => {
    const { observationId } = await context.params;
    const observation = getObservation(observationId);
    if (!observation) throw new NotFoundError("Observation not found.");
    return observation;
  });
}
