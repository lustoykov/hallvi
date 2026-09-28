import { z } from "zod";

import { handle } from "@/server/http";
import { RequestNotFoundError, requestOutcome } from "@/server/requests";
import { assertSameOrigin, RequestValidationError } from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What became of a message sent under this request key: read, never run. */
export async function GET(
  request: Request,
  context: {
    params: Promise<{
      applicationId: string;
      chatId: string;
      requestKey: string;
    }>;
  },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, chatId, requestKey } = await context.params;
    if (!z.uuid().safeParse(requestKey).success)
      throw new RequestValidationError("A request key is a UUID.");
    try {
      return Response.json(
        await requestOutcome(applicationId, chatId, requestKey),
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      // Said apart from a missing application or conversation, so a caller
      // that saw this request waiting can tell it was dropped.
      if (error instanceof RequestNotFoundError)
        return Response.json(
          { error: error.message, missing: "request" },
          { status: 404 },
        );
      throw error;
    }
  });
}
