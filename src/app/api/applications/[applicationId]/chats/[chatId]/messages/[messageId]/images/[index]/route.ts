import { handle } from "@/server/http";
import { chatImage } from "@/server/pi-conversation";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: {
    params: Promise<{
      applicationId: string;
      chatId: string;
      messageId: string;
      index: string;
    }>;
  },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, chatId, messageId, index } = await context.params;
    const image = await chatImage(
      applicationId,
      chatId,
      messageId,
      Number(index),
    );
    return new Response(image.bytes, {
      headers: {
        "Content-Type": image.mimeType,
        // A sent message never changes under its id.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
