import { getDecision } from "@/server/db";
import { handle } from "@/server/http";
import { NotFoundError } from "@/server/applications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ decisionId: string }> },
) {
  return handle(async () => {
    const { decisionId } = await context.params;
    const decision = getDecision(decisionId);
    if (!decision) throw new NotFoundError("Decision not found.");
    return decision;
  });
}
