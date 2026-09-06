import { z } from "zod";

import { handle } from "@/server/http";
import {
  getExecutionSetupStatus,
  requestPreparation,
} from "@/server/execution-setup";
import { parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The controller host's execution environment, as last checked. */
export async function GET() {
  return handle(() => getExecutionSetupStatus(false));
}

const schema = z.strictObject({
  action: z.enum(["check", "prepare"]),
});

/** Check again, or pull the runner images and verify a constrained
 * container. */
export async function POST(request: Request) {
  return handle(async () => {
    const { action } = await parseJsonRequest(request, schema);
    if (action === "prepare") return requestPreparation();
    return getExecutionSetupStatus(true);
  });
}
