import type { ApplicationListItem } from "@/components/hallvi/applications-screen";
import { listApplications } from "./db";
import {
  applicationReading,
  presenceOf,
  subjectsOfKind,
} from "./record-projection";
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
 * The condition is the one Overview's headline reads, from the same records
 * and the same reader's clock. Nothing here invents a state, and an application
 * nobody has checked says so.
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
      condition: applicationListCondition(records, application.id, now),
      stack: stackOf(records),
      attention: records.filter(
        (r) => r.presentation?.role === "recommendation",
      ).length,
      address: addressOf(records),
    };
  });
}

/**
 * Short enough for a card, and never more certain than the record allows.
 * The reading is Overview's headline reading; only the words are the card's.
 */
export function applicationListCondition(
  records: SavedInformation[],
  applicationId: string,
  now: number,
): ApplicationListItem["condition"] {
  if (!records.length) return { tone: "muted", text: "New application" };
  const { reading, judgements, checks } = applicationReading(
    records,
    applicationId,
    now,
  );
  if (reading === "failed")
    return judgements.some((record) => record.presentation?.status === "failed")
      ? { tone: "bad", text: "A recorded condition failed" }
      : { tone: "bad", text: "A check did not pass" };
  if (reading === "warning")
    return { tone: "warn", text: "A recorded condition has a limit" };
  if (!checks.length) return { tone: "muted", text: "Not checked yet" };
  if (reading === "stale") return { tone: "warn", text: "Checked a while ago" };
  if (reading === "verified") return { tone: "live", text: "Checks held" };
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
  if (!url || !URL.canParse(url)) return null;
  return ["http:", "https:"].includes(new URL(url).protocol) ? url : null;
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
