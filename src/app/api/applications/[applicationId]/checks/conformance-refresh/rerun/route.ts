import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import { refreshCandidate } from "@/server/phase-three";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

/** Re-verification from the check drawer: refresh from GitHub. */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    await refreshCandidate(applicationId);
    return getOperatorView(applicationId, undefined, "make-launch-ready");
  });
}
