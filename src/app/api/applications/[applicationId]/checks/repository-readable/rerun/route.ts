import { handle } from "@/server/http";
import { getPhaseOneOperatorView, observeRepository } from "@/server/phase-one";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const { applicationId } = await context.params;
    await observeRepository(applicationId);
    return getPhaseOneOperatorView(applicationId);
  });
}
