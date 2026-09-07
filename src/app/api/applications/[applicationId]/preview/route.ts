import { z } from "zod";
import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";
import { requestApplicationPreview } from "@/server/phase-three";
import {
  confirmApplicationPreview,
  stopApplicationPreview,
} from "@/server/application-preview";
import { getOperatorView } from "@/server/operator-view";
export const runtime = "nodejs";
const schema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("start") }),
  z.strictObject({ action: z.enum(["stop", "confirm"]), previewId: z.uuid() }),
]);
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const input = await parseJsonRequest(request, schema);
    const { applicationId } = await context.params;
    if (input.action === "start") requestApplicationPreview(applicationId);
    else if (input.action === "stop")
      await stopApplicationPreview(applicationId, input.previewId);
    else await confirmApplicationPreview(applicationId, input.previewId);
    return getOperatorView(applicationId);
  });
}
