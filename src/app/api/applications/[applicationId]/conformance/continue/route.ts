import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import { continueWithServerGuy } from "@/server/phase-three";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

/** Continue with Server Guy: starts one request in the phase's main chat. */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    await continueWithServerGuy(applicationId);
    return getOperatorView(applicationId, undefined, "make-launch-ready");
  });
}
