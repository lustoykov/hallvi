import { handle } from "@/server/http";
import { inspectApplication } from "@/server/requests";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The application's recorded state, bounded. No model, no server probe. */
export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    return Response.json(await inspectApplication(applicationId), {
      headers: { "Cache-Control": "no-store" },
    });
  });
}
