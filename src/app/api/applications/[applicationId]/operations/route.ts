import { handle } from "@/server/http";
import { getApplication } from "@/server/db";
import { operationsFor } from "@/server/operation-store";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const { applicationId } = await context.params;
    if (!getApplication(applicationId))
      return Response.json(
        { error: "Application not found." },
        { status: 404 },
      );
    return { operations: operationsFor(applicationId) };
  });
}
