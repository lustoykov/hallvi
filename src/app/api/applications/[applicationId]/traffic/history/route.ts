import type { NextRequest } from "next/server";

import { loadApplication } from "@/server/applications";
import { handle } from "@/server/http";
import { RequestValidationError } from "@/server/schemas";
import { currentCollection } from "@/server/traffic/collection";
import { TRAFFIC_RANGES, type TrafficRange } from "@/server/traffic/contract";
import { controllerTimeZone } from "@/server/traffic/days";
import { historyDays, historyOf } from "@/server/traffic/merge";
import { readDays } from "@/server/traffic/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stored totals for a range, read without asking anyone. An application with
 * nothing stored gets an empty history, every bucket uncovered: nothing
 * stored means nobody counted, not that nobody came.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const { applicationId } = await context.params;
    await loadApplication(applicationId);
    const range = request.nextUrl.searchParams.get("range") ?? "24h";
    if (!(TRAFFIC_RANGES as readonly string[]).includes(range))
      throw new RequestValidationError("Choose a range of 24h, 7d or 30d.");
    const now = Date.now();
    const timeZone = controllerTimeZone();
    const { from, to } = historyDays(range as TrafficRange, now, timeZone);
    return historyOf(
      readDays(applicationId, from, to),
      range as TrafficRange,
      now,
      await currentCollection(applicationId, now),
      timeZone,
    );
  });
}
