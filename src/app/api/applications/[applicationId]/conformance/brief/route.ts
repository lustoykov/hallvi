import { handle } from "@/server/http";
import { exportBrief } from "@/server/phase-three";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

/** The exportable brief for external work, recorded once per contract
 * version. */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    const { text } = exportBrief(applicationId);
    return { text };
  });
}
