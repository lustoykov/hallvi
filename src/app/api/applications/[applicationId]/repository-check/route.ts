import { observeRepository } from "@/server/applications";
import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

/** Checks the application's repository again with the current GitHub login. */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    await observeRepository(applicationId);
    return getOperatorView(applicationId);
  });
}
