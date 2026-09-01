import { handle } from "@/server/http";
import { archiveOperatorSession } from "@/server/phase-one";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ applicationId: string; sessionId: string }> },
) {
  return handle(async () => {
    const { applicationId, sessionId } = await context.params;
    return archiveOperatorSession(applicationId, sessionId);
  });
}
