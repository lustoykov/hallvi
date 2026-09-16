import { z } from "zod";

import {
  cloudflareBuckets,
  cloudflareRecords,
  cloudflareZones,
  connectCloudflare,
  r2UploadGaps,
  verifyCloudflare,
} from "@/server/cloudflare";
import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";

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

/**
 * Saves the management token the owner typed in Settings, after Cloudflare
 * says it is active. The token arrives in a same-origin JSON body and is
 * never accepted from a query string; nothing about it is returned.
 */
export function POST(request: Request) {
  return handle(async () => {
    const input = await parseJsonRequest(
      request,
      z.strictObject({
        token: z.string().min(1).max(200),
        accountId: z.string().max(64).optional(),
      }),
    );
    const { account } = await connectCloudflare(input);
    return { connected: true, account };
  });
}
