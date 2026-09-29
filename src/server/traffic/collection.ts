// Traffic history as the pages and Pi read it: the owner's choice, what the
// collector saw, and what the log alone cannot see.

import { currentFacts, presenceOf, subjectsOfKind } from "../record-projection";
import { listInformation } from "../saved-information";
import type { Collection } from "./contract";
import { addDays, controllerTimeZone, dayOf } from "./days";
import { collectionOf, readDays } from "./store";

/** How far back "recent days" reach for pages only the browser saw. */
const RECENT_DAYS = 7;

/**
 * The collection with what the log misses, from evidence: in-page requests
 * naming pages that were never loaded as documents on a recent day, or a
 * current `cdn` record saying it caches pages. Nothing once the script has
 * passed its switch point: from there it sees what the log could not.
 */
export async function currentCollection(
  applicationId: string,
  now = Date.now(),
): Promise<Collection> {
  const collection = collectionOf(applicationId);
  if (collection.scriptSince) return collection;
  const logMisses: Collection["logMisses"] = [];
  const today = dayOf(now, controllerTimeZone());
  if (
    readDays(applicationId, addDays(today, 1 - RECENT_DAYS), today).some(
      (day) => day.browserOnlyPages > 0,
    )
  )
    logMisses.push("browser-pages");
  const records = await listInformation(applicationId);
  if (
    subjectsOfKind(records, "cdn").some((ref) => {
      const presence = presenceOf(records, ref);
      return (
        presence.known &&
        presence.presence === "present" &&
        currentFacts(records, ref)
          .get("caches-pages")
          ?.value.value.trim()
          .toLowerCase() === "yes"
      );
    })
  )
    logMisses.push("cached-pages");
  return { ...collection, logMisses };
}
