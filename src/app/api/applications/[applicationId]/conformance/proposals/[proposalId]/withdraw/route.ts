import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import { withdrawProposal } from "@/server/phase-three";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string; proposalId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, proposalId } = await context.params;
    await withdrawProposal(applicationId, proposalId);
    return getOperatorView(applicationId, undefined, "make-launch-ready");
  });
}
