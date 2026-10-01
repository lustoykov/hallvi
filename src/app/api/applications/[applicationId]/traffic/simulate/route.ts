import { z } from "zod";

import { loadApplication } from "@/server/applications";
import { handle } from "@/server/http";
import { assertSameOrigin, parseJsonRequest } from "@/server/schemas";
import {
  SIMULATED_SHAPES,
  simulation,
  startSimulation,
  stopSimulation,
} from "@/server/traffic/simulate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const choice = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("start"),
    shape: z.enum(SIMULATED_SHAPES),
    rate: z.number().int().min(1).max(60),
    minutes: z.number().int().min(1).max(60),
  }),
  z.strictObject({ action: z.literal("stop") }),
]);

/** Development only: the simulated traffic running against this application. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await context.params;
  return handle(async () => {
    await loadApplication(applicationId);
    return { simulation: simulation(applicationId) };
  });
}

/** Development only: start or stop simulated traffic. */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    await loadApplication(applicationId);
    const wanted = await parseJsonRequest(request, choice);
    return {
      simulation:
        wanted.action === "stop"
          ? stopSimulation(applicationId)
          : await startSimulation(applicationId, wanted),
    };
  });
}
