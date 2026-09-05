import { handle } from "@/server/http";
import { retryPiRun } from "@/server/pi-runs";
import { assertSameOrigin } from "@/server/schemas";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: {
    params: Promise<{ applicationId: string; chatId: string; runId: string }>;
  },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, chatId, runId } = await context.params;
    return Response.json(retryPiRun(applicationId, chatId, runId), {
      status: 202,
    });
  });
}
