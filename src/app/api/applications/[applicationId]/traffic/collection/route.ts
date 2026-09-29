import { z } from "zod";

import { loadApplication } from "@/server/applications";
import { handle } from "@/server/http";
import { assertSameOrigin, parseJsonRequest } from "@/server/schemas";
import { currentCollection } from "@/server/traffic/collection";
import { forget, setCollection } from "@/server/traffic/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const choice = z.strictObject({ action: z.enum(["keep", "stop", "forget"]) });

/** Whether traffic history is kept, and what the collector last saw. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await context.params;
  return handle(() => {
    loadApplication(applicationId);
    return currentCollection(applicationId);
  });
}

/**
 * The owner's standing choice: keep traffic history, stop keeping it, or
 * delete the totals, which also stops it.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    loadApplication(applicationId);
    const { action } = await parseJsonRequest(request, choice);
    if (action === "forget") forget(applicationId);
    else setCollection(applicationId, action);
    return currentCollection(applicationId);
  });
}
