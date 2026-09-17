import { ConnectionsScreen } from "@/components/haldur/connections-screen";
import {
  cloudflareBuckets,
  r2UploadGaps,
  verifyCloudflare,
} from "@/server/cloudflare";
import { backupDestination } from "@/server/backup-connection";
import { connectionRows } from "@/server/connection-rows";
import { controllerProtectionState } from "@/server/controller-protection";
import { listApplications } from "@/server/db";
import { hetznerConnectionId } from "@/server/hetzner";
import { setupReturnDestination } from "@/server/setup-return";

export const dynamic = "force-dynamic";

/**
 * The accounts Haldur acts through, as the providers themselves report
 * them rather than as the presence of a variable implies. Verifying costs one
 * request each and is the difference between "configured" and "works".
 */
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    application?: string | string[];
    chat?: string | string[];
  }>;
}) {
  const returnTo = setupReturnDestination(await searchParams) ?? undefined;
  const cloudflare = await verifyCloudflare();
  // Listing buckets proves the token manages R2. It proves nothing about
  // being able to put an object in one, which is a separate credential, and
  // the row says so rather than letting a green tick imply otherwise.
  const buckets = cloudflare.connected
    ? await cloudflareBuckets().catch(() => null)
    : null;
  const kit = controllerProtectionState().kit;

  return (
    <ConnectionsScreen
      returnTo={returnTo}
      recoveryKit={
        kit
          ? {
              confirmedAt: kit.confirmedAt,
              bucket: kit.bucket,
              host: new URL(kit.endpoint).hostname,
            }
          : undefined
      }
      connections={connectionRows({
        hetznerConnected: Boolean(hetznerConnectionId()),
        cloudflare,
        buckets: buckets?.length ?? null,
        // What the owner saved for backups, Haldur's own copies included.
        storage: backupDestination(),
        uploadGaps: r2UploadGaps(),
        applications: listApplications().map(({ id, name }) => ({ id, name })),
      })}
    />
  );
}
