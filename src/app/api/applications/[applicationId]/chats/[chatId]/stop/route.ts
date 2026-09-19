import { handle } from "@/server/http";
import { stopConversation } from "@/server/pi-conversation";
import { assertSameOrigin } from "@/server/schemas";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string; chatId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, chatId } = await context.params;
    return stopConversation(applicationId, chatId);
  });
}
