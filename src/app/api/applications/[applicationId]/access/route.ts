import { handle } from "@/server/http";
import { privateAccessOpen } from "@/server/private-access";
import { listInformation } from "@/server/saved-information";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether the tunnel behind this application's private access record is still
 * open. It is a separate request from the view because the answer changes
 * without any record changing: a tunnel dies with the controller process, and
 * the record that says where to reach the application stays exactly as true
 * as it was when it was written.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await context.params;
  return handle(async () => {
    const access = listInformation(applicationId)
      .map((record) => record.presentation?.content)
      .find((content) => content?.kind === "application-access");
    if (access?.kind !== "application-access" || access.mode !== "private")
      return { mode: access?.kind === "application-access" ? "public" : null };
    if (!access.localPort || !access.remotePort) return { mode: "private" };
    return {
      mode: "private",
      open: await privateAccessOpen(
        applicationId,
        access.remotePort,
        access.localPort,
      ),
    };
  });
}
