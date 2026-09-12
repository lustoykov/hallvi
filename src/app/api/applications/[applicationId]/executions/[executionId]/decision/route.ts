import { z } from "zod";
import { handle } from "@/server/http";
import { decideExecution } from "@/server/operator-execution";
import { parseJsonRequest } from "@/server/schemas";
export const runtime = "nodejs";
export function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string; executionId: string }> },
) {
  return handle(async () => {
    const { approved } = await parseJsonRequest(
      request,
      z.object({ approved: z.boolean() }),
    );
    const { applicationId, executionId } = await context.params;
    return decideExecution(applicationId, executionId, approved);
  });
}
