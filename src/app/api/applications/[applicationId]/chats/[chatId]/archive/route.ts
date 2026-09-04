import { handle } from "@/server/http";
import { archiveChat } from "@/server/phase-one";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string; chatId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, chatId } = await context.params;
    return archiveChat(applicationId, chatId);
  });
}
