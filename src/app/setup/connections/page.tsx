import { ConnectionsScreen } from "@/components/server-guy/connections-screen";
import {
  cloudflareBuckets,
  r2UploadGaps,
  verifyCloudflare,
} from "@/server/cloudflare";
import { backupDestination } from "@/server/backup-connection";
import { controllerProtectionState } from "@/server/controller-protection";
import { hetznerConnectionId } from "@/server/hetzner";

export const dynamic = "force-dynamic";

/**
 * The accounts Server Guy acts through, as the providers themselves report
 * them rather than as the presence of a variable implies. Verifying costs one
 * request each and is the difference between "configured" and "works".
 */
export default async function ConnectionsPage() {
  const cloudflare = await verifyCloudflare();
  // Listing buckets proves the token manages R2. It proves nothing about
  // being able to put an object in one, which is a separate credential, and
  // the row says so rather than letting a green tick imply otherwise.
  const buckets = cloudflare.connected
    ? await cloudflareBuckets().catch(() => null)
    : null;
  const hetzner = hetznerConnectionId();
  // The destination the owner saved for backups, including Server Guy's own.
  const storage = backupDestination();
  const kit = controllerProtectionState().kit;

  return (
    <ConnectionsScreen
      recoveryKit={
        kit
          ? {
              confirmedAt: kit.confirmedAt,
              bucket: kit.bucket,
              host: new URL(kit.endpoint).hostname,
            }
          : undefined
      }
      connections={[
        {
          id: "hetzner",
          name: "Hetzner Cloud",
          purpose:
            "Buying and inspecting the servers your applications run on.",
          state: hetzner ? "connected" : "not-connected",
          detail: hetzner
            ? "A controller-held API token. Server Guy chooses sizes and regions and shows the cost before buying."
            : "Not connected. Server Guy cannot prepare a server without it.",
          // Presence is useful; characters from the credential are not.
          credential: hetzner ? "Controller token configured" : null,
          href: "/applications",
          action: hetzner ? "Manage in the conversation" : "Connect",
        },
        {
          id: "cloudflare",
          name: "Cloudflare",
          purpose:
            "Reading the names and DNS records in front of your applications, and the R2 buckets on the account.",
          state: cloudflare.connected
            ? "connected"
            : cloudflare.error?.includes("No CLOUDFLARE_API_TOKEN")
              ? "not-connected"
              : "failed",
          detail:
            cloudflare.error ??
            `The token is ${cloudflare.status}. Cloudflare was asked, not assumed.`,
          credential: cloudflare.connected
            ? [
                cloudflare.account
                  ? `Account ${cloudflare.account.slice(0, 8)}…`
                  : "No account id configured",
                buckets ? `${buckets.length} R2 buckets visible` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : null,
          usedBy: cloudflare.connected ? ["Domains", "CDN"] : undefined,
          href: "/applications",
          action: cloudflare.connected ? "Use in the conversation" : "Connect",
        },
        // Kept as its own row because the distinction costs an afternoon when
        // it is missed: managing R2 and writing to R2 are different
        // credentials, and Cloudflare issues them separately.
        {
          id: "r2-uploads",
          name: "Backup storage",
          purpose:
            "Writing backup copies into a bucket: your application's data, and Server Guy's own records and keys.",
          state: storage.connected ? "connected" : "not-connected",
          detail: storage.connected
            ? `${storage.provider === "r2" ? "Cloudflare R2" : "Amazon S3"} at ${storage.host}. Server Guy copies its own records here automatically; application backups are arranged in the conversation.`
            : cloudflare.connected
              ? `The Cloudflare token above manages R2 through the management API. It is not an S3 credential, so it cannot put an object in a bucket. That still needs: ${r2UploadGaps().join(", ").toLowerCase()}.`
              : "Not connected, and it is a separate credential from the Cloudflare API token.",
          credential: storage.connected
            ? `Key scoped to ${storage.bucket}`
            : null,
          usedBy: storage.connected ? ["Backups"] : undefined,
          href: "/applications",
          action: storage.connected ? "Manage in Backups" : "Connect",
        },
      ]}
    />
  );
}
