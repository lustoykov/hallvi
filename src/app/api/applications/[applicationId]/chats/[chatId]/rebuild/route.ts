import { handle } from "@/server/http";
import { getPhaseOneOperatorView, loadChat } from "@/server/phase-one";
import {
  NativeSessionError,
  rebuildNativeChatSession,
} from "@/server/pi-sessions";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string; chatId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, chatId } = await context.params;
    const { chat } = loadChat(applicationId, chatId);
    if (chat.archivedAt)
      throw new Error("This Chat is archived and read-only.");
    try {
      await rebuildNativeChatSession(applicationId, chatId);
    } catch (error) {
      if (error instanceof NativeSessionError) {
        return Response.json(
          { error: error.message },
          { status: error.code === "not-found" ? 404 : 409 },
        );
      }
      throw new Error("Could not rebuild this conversation. Try again.");
    }
    return getPhaseOneOperatorView(applicationId, chatId);
  });
}
