import { handle } from "@/server/http";
import { archiveChat } from "@/server/phase-one";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ applicationId: string; chatId: string }> },
) {
  return handle(async () => {
    const { applicationId, chatId } = await context.params;
    return archiveChat(applicationId, chatId);
  });
}
