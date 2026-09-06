import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import { grantPublication, revokePublication } from "@/server/phase-three";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

/** The explicit, verified grant to publish to this repository. */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    await grantPublication(applicationId);
    return getOperatorView(applicationId, undefined, "make-launch-ready");
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    revokePublication(applicationId);
    return getOperatorView(applicationId, undefined, "make-launch-ready");
  });
}
