import type { NextRequest } from "next/server";
import { z } from "zod";

import { loadApplication } from "@/server/applications";
import { handle } from "@/server/http";
import { RequestValidationError } from "@/server/schemas";
import { controllerTimeZone } from "@/server/traffic/days";
import { impactDays, releaseImpact } from "@/server/traffic/merge";
import { readDays } from "@/server/traffic/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const moment = z.iso.datetime({ offset: true });
/** Enough for every release a Deployment page lists. */
const MOST = 50;

/**
 * What each release changed: one answer per `at`, in the order asked, each
 * echoing its `at`. Quiet where nothing changed.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const { applicationId } = await context.params;
    loadApplication(applicationId);
    const asked = request.nextUrl.searchParams.getAll("at");
    if (asked.length > MOST)
      throw new RequestValidationError(
        `Ask about at most ${MOST} releases at a time.`,
      );
    for (const at of asked)
      if (!moment.safeParse(at).success)
        throw new RequestValidationError(
          "Each at must be an ISO time, such as 2026-09-29T14:05:00Z.",
        );
    const now = Date.now();
    const timeZone = controllerTimeZone();
    // Each release reads the day or two around it, not every day between
    // the oldest release and the newest.
    return asked.map((at) => {
      const { from, to } = impactDays(Date.parse(at), 120, timeZone);
      return releaseImpact(readDays(applicationId, from, to), at, 120, now);
    });
  });
}
