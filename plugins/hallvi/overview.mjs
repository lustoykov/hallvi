// What the panel's overview needs from saved records that the controller's
// inspection does not carry: which release is running and what happened
// last, the current way in, and when a check was last recorded. The release
// and access rules are Hallvi's own, so the panel cannot call a commit
// running that the Deployment page would not. Nothing here judges health.
import { currentAccessRecord } from "../../src/server/access-record.ts";
import { releaseOutcome } from "../../src/server/release-outcome.ts";

const release = (record) => ({
  id: record.id,
  title: record.title,
  revision: record.presentation.content.revision,
  at: record.establishedAt ?? record.createdAt,
  outcome: releaseOutcome(record),
});

/** From the records a chat snapshot carries, every one of them. */
export function projectRecords(information, applicationId) {
  const live = (information ?? []).filter(
    (record) =>
      !record.retiredAt &&
      (!record.applicationId || record.applicationId === applicationId),
  );
  // Newest first, as the Deployment page orders them. The newest release a
  // check proved is running; the newest attempt may be another one.
  const releases = live
    .filter((record) => record.presentation?.content?.kind === "deployment")
    .map(release)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const access = currentAccessRecord(live);
  // A check that ran: passed or failed, not a note. Its time is the record's.
  const checkedAt =
    live
      .filter(
        (record) =>
          record.establishedAt &&
          (record.presentation?.checks ?? []).some(
            (check) => check.status !== "info",
          ),
      )
      .map((record) => record.establishedAt)
      .sort()
      .at(-1) ?? null;
  return {
    release: releases.length
      ? {
          running: releases.find((item) => item.outcome === "deployed") ?? null,
          latest: releases[0],
        }
      : null,
    access: access
      ? {
          url: access.presentation.url,
          mode: access.presentation.content.mode,
        }
      : null,
    checkedAt,
  };
}
