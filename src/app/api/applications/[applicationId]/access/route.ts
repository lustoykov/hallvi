import { handle } from "@/server/http";
import { privateAccessOpen } from "@/server/private-access";
import { publicUrlReachable } from "@/server/public-access";
import { listInformation } from "@/server/saved-information";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether the way in behind this application's access record still works. It
 * is a separate request from the view because the answer changes without any
 * record changing: a tunnel dies with the controller process, a published
 * name stops answering when the proxy or the host does, and the record that
 * says where to reach the application stays exactly as true as it was when
 * it was written.
 *
 * Both modes are asked rather than assumed. A public address used to be
 * reported as open on the strength of being public, which is the same
 * unchecked claim the private side was built to stop making.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await context.params;
  return handle(async () => {
    const record = listInformation(applicationId).find(
      (item) => item.presentation?.content?.kind === "application-access",
    );
    const access = record?.presentation?.content;
    if (access?.kind !== "application-access") return { mode: null };
    if (access.mode === "public") {
      const url = record?.presentation?.url;
      return {
        mode: "public",
        open: url ? await publicUrlReachable(url) : undefined,
      };
    }
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
