import { handle } from "@/server/http";
import { getPhaseOneOperatorView, observeRepository } from "@/server/phase-one";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    await observeRepository(applicationId);
    return getPhaseOneOperatorView(applicationId);
  });
}
