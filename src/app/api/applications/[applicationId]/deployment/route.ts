import { z } from "zod";

import { loadApplication } from "@/server/applications";
import {
  deploymentChoiceSchema,
  deploymentStatus,
} from "@/server/deployment-automation";
import { handle } from "@/server/http";
import { assertSameOrigin, parseJsonRequest } from "@/server/schemas";
import { askWorker } from "@/server/worker-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const action = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("choose"),
    choice: deploymentChoiceSchema,
  }),
  z.strictObject({ action: z.literal("deploy") }),
]);

/** How this application deploys, and what the branch watch has seen. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await context.params;
  return handle(() => {
    loadApplication(applicationId);
    return deploymentStatus(applicationId);
  });
}

/**
 * The worker keeps this record and owns the conversation a deployment runs
 * in, so every change is asked of it. It answers with the record as it now
 * stands, or with why not.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    loadApplication(applicationId);
    const message = await parseJsonRequest(request, action);
    return askWorker("deployment", { scope: { applicationId }, message });
  });
}
