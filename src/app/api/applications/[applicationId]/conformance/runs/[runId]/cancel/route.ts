import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import { cancelCandidateVerification } from "@/server/phase-three";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string; runId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, runId } = await context.params;
    cancelCandidateVerification(applicationId, runId);
    return getOperatorView(applicationId, undefined, "make-launch-ready");
  });
}
