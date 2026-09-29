import { z } from "zod";

import { handle } from "@/server/http";
import { executionDetail } from "@/server/requests";
import { assertSameOrigin, RequestValidationError } from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One execution of this application in full, redacted as it is shown. */
export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string; executionId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, executionId } = await context.params;
    if (!z.uuid().safeParse(executionId).success)
      throw new RequestValidationError("An execution id is a UUID.");
    return Response.json(await executionDetail(applicationId, executionId), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
