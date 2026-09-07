import { contractHistory } from "@/server/contract-history";
import { handle } from "@/server/http";
import { loadApplication } from "@/server/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every saved Application Contract version, newest first, with what changed
 * and why. Read-only; earlier versions stay as recorded. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const { applicationId } = await context.params;
    loadApplication(applicationId);
    return { versions: contractHistory(applicationId) };
  });
}
