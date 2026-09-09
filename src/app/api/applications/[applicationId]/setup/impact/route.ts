import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";
import {
  previewSetupCorrection,
  setupImpactRequest,
} from "@/server/setup-correction";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () =>
    previewSetupCorrection(
      (await context.params).applicationId,
      await parseJsonRequest(request, setupImpactRequest),
    ),
  );
}
