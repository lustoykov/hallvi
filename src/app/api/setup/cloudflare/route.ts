import {
  cloudflareBuckets,
  cloudflareRecords,
  cloudflareZones,
  r2UploadGaps,
  verifyCloudflare,
} from "@/server/cloudflare";
import { handle } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Cloudflare connection, as Cloudflare reports it rather than as the
 * presence of an environment variable implies. `?zone=<id>` adds that zone's
 * DNS records; `?buckets=1` adds the R2 buckets on the account.
 *
 * The token itself is read on the server and never appears in the response.
 */
export function GET(request: Request) {
  return handle(async () => {
    const connection = await verifyCloudflare();
    if (!connection.connected) return { ...connection, zones: [] };
    const url = new URL(request.url);
    const zone = url.searchParams.get("zone");
    return {
      ...connection,
      zones: await cloudflareZones(),
      ...(zone ? { records: await cloudflareRecords(zone) } : {}),
      ...(url.searchParams.get("buckets")
        ? {
            buckets: await cloudflareBuckets(),
            // Listing buckets is not the same as being able to write to one.
            uploadNeeds: r2UploadGaps(),
          }
        : {}),
    };
  });
}
