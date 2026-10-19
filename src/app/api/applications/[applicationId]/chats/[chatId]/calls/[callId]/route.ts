import { handle } from "@/server/http";
import { readCallDetail } from "@/server/pi-conversation";
import { assertSameOrigin } from "@/server/schemas";
import { z } from "zod";

const referenceSchema = z.object({
  entryId: z.coerce.number().int().positive().optional(),
  resultEntryId: z.coerce.number().int().positive().optional(),
  executionId: z.uuid().optional(),
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: {
    params: Promise<{ applicationId: string; chatId: string; callId: string }>;
  },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, chatId, callId } = await context.params;
    const reference = referenceSchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    return Response.json(
      await readCallDetail(applicationId, chatId, callId, reference),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  });
}
