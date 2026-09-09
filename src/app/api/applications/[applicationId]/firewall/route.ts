import { applicationDeployment } from "@/server/deployment-store";
import { readFirewallStatus, firewallFacts } from "@/server/firewall-status";
import { hetznerConnectionId } from "@/server/hetzner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const record = applicationDeployment((await context.params).applicationId);
  if (!record?.serverId)
    return Response.json(
      { error: "No deployed Hetzner instance is recorded yet." },
      { status: 404 },
    );
  if (
    !record.authority ||
    record.authority.connectionId !== hetznerConnectionId()
  )
    return Response.json(
      {
        error:
          "Connect the Hetzner account used for this deployment to check its firewall.",
      },
      { status: 409 },
    );
  try {
    const status = await readFirewallStatus(record.serverId);
    return Response.json(
      { ...status, security: firewallFacts(status) },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      {
        error:
          "Could not read the firewall from Hetzner. Check the connection and try again.",
      },
      { status: 502 },
    );
  }
}
