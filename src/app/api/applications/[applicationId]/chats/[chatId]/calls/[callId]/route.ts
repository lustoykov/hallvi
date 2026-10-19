import { handle } from "@/server/http";
import { readCallDetail } from "@/server/pi-conversation";
import { assertSameOrigin } from "@/server/schemas";

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
    return Response.json(await readCallDetail(applicationId, chatId, callId), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
