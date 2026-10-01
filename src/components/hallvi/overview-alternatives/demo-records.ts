// PROTOTYPE ONLY. Add subjects to the existing synthetic traffic records so
// Overview can place the recorded checks. No product or live data is changed.
import type { SavedInformation } from "@/server/operator-data";

export function overviewDemoRecords(
  records: SavedInformation[],
): SavedInformation[] {
  return records.map((record) => {
    const presentation = record.presentation;
    const kind = presentation?.content?.kind;
    if (!presentation) return record;
    if (kind === "deployment")
      return {
        ...record,
        presentation: {
          ...presentation,
          checks: (presentation.checks ?? []).map((check) => ({
            ...check,
            about: { kind: "process" as const, id: "web" },
          })),
        },
      };
    if (kind === "application-access")
      return {
        ...record,
        presentation: {
          ...presentation,
          checks: [
            {
              key: "http",
              label: "Public address returned HTTP 200",
              status: "passed",
              claim: "liveness",
              basis: "observed",
              about: { kind: "access", id: "public-address" },
            },
          ],
        },
      };
    if (kind === "usage")
      return {
        ...record,
        presentation: {
          ...presentation,
          checks: [
            {
              key: "ssh",
              label: "Server accepted SSH for the resource reading",
              status: "passed",
              claim: "liveness",
              basis: "observed",
              about: { kind: "host", id: "hetzner-4242" },
            },
          ],
        },
      };
    return record;
  });
}
