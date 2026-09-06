import { getConformanceRun } from "@/server/db";
import { handle } from "@/server/http";
import { NotFoundError } from "@/server/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  return handle(async () => {
    const { runId } = await context.params;
    const run = getConformanceRun(runId);
    if (!run) throw new NotFoundError("Conformance run not found.");
    return run;
  });
}
