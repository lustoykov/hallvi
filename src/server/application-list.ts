import type { ApplicationListItem } from "@/components/server-guy/applications-screen";
import { listApplications } from "./db";
import {
  checkAsNow,
  currentChecks,
  presenceOf,
  subjectsMentioned,
  subjectsOfKind,
} from "./record-projection";
import { subjectKinds, type Ref } from "./operator-data";

/** Every kind a record can be about; the list reads checks from all of them. */
const SUBJECT_KINDS = subjectKinds;
import type { SavedInformation } from "./operator-data";
import { listInformation } from "./saved-information";

/**
 * The applications list, as the page it feeds actually needs it.
 *
 * This used to return `condition: { tone: "muted", text: "Open application" }`
 * for every application, with `stack` and `protection` as empty strings — a
 * placeholder that had outlived the card built around it. The card had a
 * condition slot with a state dot, a protection slot and a stack slot, and
 * filled all three with the same non-answer, so the one surface a person
 * returns to in order to check on their software could not tell them which of
 * their applications was in trouble.
 *
 * The rule is the same one Overview uses, from the same records: what the
 * application's own checks say, aged by the reader's clock. Nothing here
 * invents a state, and an application nobody has checked says so.
 */
export function listApplicationItems(): ApplicationListItem[] {
  const now = Date.now();
  return listApplications().map((application) => {
    const records = listInformation(application.id).filter(
      (record) => !record.retiredAt,
    );
    return {
      id: application.id,
      name: application.name,
      source: `${application.repositoryOwner}/${application.repositoryName}`,
      condition: conditionOf(records, application.id, now),
      stack: stackOf(records),
      protection: protectionOf(records),
      attention: records.filter(
        (r) => r.presentation?.role === "recommendation",
      ).length,
      address: addressOf(records),
    };
  });
}

/**
 * Short enough for a card, and never more certain than the record allows.
 *
 * Every check the application's records carry, on any subject — not only the
 * ones on the application subject itself. Reading the narrow set let the list
 * show "Checks held" in green for an application whose own Overview said "A
 * check did not pass" two clicks away, because the failing check belonged to
 * its domain rather than to the application. The list has no lane beside it to
 * qualify a green, so it has to account for the same evidence the destination
 * does.
 */
function conditionOf(
  records: SavedInformation[],
  applicationId: string,
  now: number,
): ApplicationListItem["condition"] {
  const refs: Ref[] = [
    { kind: "application", id: applicationId },
    ...SUBJECT_KINDS.flatMap((kind) => subjectsMentioned(records, kind)),
  ];
  const held = refs.flatMap((ref) => [...currentChecks(records, ref).values()]);
  if (!held.length) return { tone: "muted", text: "Not checked yet" };
  const readings = held.map((item) => checkAsNow(item.value, item.record, now));
  if (readings.includes("failed"))
    return { tone: "bad", text: "A check did not pass" };
  if (readings.includes("stale"))
    return { tone: "warn", text: "Checked a while ago" };
  if (readings.includes("verified"))
    return { tone: "live", text: "Checks held" };
  return { tone: "muted", text: "Recorded, not established" };
}

/**
 * Where the application is reached, from the saved access record. A record
 * says where, never that anything answers; the condition beside it does.
 */
function addressOf(records: SavedInformation[]) {
  const url = records.find(
    (record) => record.presentation?.content?.kind === "application-access",
  )?.presentation?.url;
  return url && URL.canParse(url) ? new URL(url).hostname : null;
}

/** What it runs, counted rather than described. */
function stackOf(records: SavedInformation[]) {
  const processes = subjectsOfKind(records, "process").filter((ref) => {
    const presence = presenceOf(records, ref);
    return !(presence.known && presence.presence === "absent");
  }).length;
  const stores = ["database", "cache", "queue"].flatMap((kind) =>
    subjectsOfKind(records, kind as "database").filter((ref) => {
      const presence = presenceOf(records, ref);
      return !(presence.known && presence.presence === "absent");
    }),
  ).length;
  if (!processes && !stores) return "";
  const said = [
    processes
      ? `${processes} ${processes === 1 ? "process" : "processes"}`
      : "",
    stores ? `${stores} ${stores === 1 ? "service" : "services"}` : "",
  ].filter(Boolean);
  return said.join(" · ");
}

/**
 * Backups, on the same three-state rule the rest of the product keeps: a copy
 * on record, an absence somebody established, or nobody having looked. The
 * third is never drawn as the second.
 */
function protectionOf(records: SavedInformation[]) {
  const copies = subjectsOfKind(records, "backup-copy").filter((ref) => {
    const presence = presenceOf(records, ref);
    return presence.known && presence.presence === "present";
  }).length;
  if (copies)
    return copies === 1
      ? "1 copy off the server"
      : `${copies} copies off the server`;
  const plans = subjectsOfKind(records, "backup-plan");
  if (!plans.length) return "";
  const stated = plans.map((ref) => presenceOf(records, ref));
  if (
    stated.some((presence) => presence.known && presence.presence === "present")
  )
    return "A backup plan, no copy yet";
  if (stated.some((presence) => presence.known)) return "Not backed up";
  return "";
}
