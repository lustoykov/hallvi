import { handle } from "@/server/http";
import { completeLaunchBrief } from "@/server/phase-transition";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

/**
 * The explicit Continue from the Launch Brief to Inspect app. Idempotent: a
 * second request returns the current view without a second transition.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    return completeLaunchBrief(applicationId);
  });
}
