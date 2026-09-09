import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import { acceptAcceptanceChecks } from "@/server/phase-three";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string; acceptanceId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, acceptanceId } = await context.params;
    acceptAcceptanceChecks(applicationId, acceptanceId);
    return getOperatorView(applicationId, undefined, "make-launch-ready");
  });
}
