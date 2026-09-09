import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";
import {
  applySetupCorrection,
  setupApplyRequest,
} from "@/server/setup-correction";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () =>
    applySetupCorrection(
      (await context.params).applicationId,
      await parseJsonRequest(request, setupApplyRequest),
    ),
  );
}
