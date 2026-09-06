import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import { inspectRepository } from "@/server/phase-two";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

/** Explicit re-inspection: a new Observation is appended, never overwritten. */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    await inspectRepository(applicationId);
    return getOperatorView(applicationId, undefined, "inspect-app");
  });
}
