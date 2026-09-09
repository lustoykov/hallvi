import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import { selectCurrentRevision } from "@/server/phase-three";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

/** The no-change path: the contract commit becomes the candidate. */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    await selectCurrentRevision(applicationId);
    return getOperatorView(applicationId, undefined, "make-launch-ready");
  });
}
