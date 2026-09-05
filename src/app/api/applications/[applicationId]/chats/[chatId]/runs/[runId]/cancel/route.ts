import { handle } from "@/server/http";
import { cancelPiRun } from "@/server/pi-runs";
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
    return cancelPiRun(applicationId, chatId, runId);
  });
}
