import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";
import {
  previewRevisionCorrection,
  revisionImpactRequest,
} from "@/server/revision-correction";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () =>
    previewRevisionCorrection(
      (await context.params).applicationId,
      await parseJsonRequest(request, revisionImpactRequest),
    ),
  );
}
