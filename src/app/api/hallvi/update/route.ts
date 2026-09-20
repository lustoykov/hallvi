import { z } from "zod";

import {
  beginUpdate,
  dismissUpdate,
  releaseState,
} from "@/server/hallvi-release";
import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateRequestSchema = z.strictObject({
  action: z.enum(["check", "install", "dismiss"]),
});

/**
 * What Hallvi is, and what it could become. Reading never goes to the network:
 * it answers from the last check, so a page that asks on every load costs
 * nothing and a release source that is down does not make Settings slow.
 */
export function GET() {
  return handle(() => releaseState());
}

/**
 * `check` looks now, because the owner asked. `install` hands the work to a
 * program outside this one and returns straight away — the answer is the
 * attempt, and everything after it is read back from the attempt.
 */
export function POST(request: Request) {
  return handle(async () => {
    const { action } = await parseJsonRequest(request, updateRequestSchema);
    if (action === "check") return releaseState({ check: true });
    if (action === "dismiss") return (dismissUpdate(), releaseState());
    await beginUpdate();
    return releaseState();
  });
}
