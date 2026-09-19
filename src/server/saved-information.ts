import { listExecutions } from "./operator-execution";
import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, getApplication } from "./db";
import { savedInformation } from "./db-schema";
import { informationInputSchema } from "./operator-data";
import { requireReadableRecord } from "./record-contract";

export function listInformation(
  applicationId: string,
  query = "",
  includeRetired = false,
) {
  const records = db()
    .select()
    .from(savedInformation)
    .where(
      and(
        eq(savedInformation.applicationId, applicationId),
        includeRetired ? undefined : isNull(savedInformation.retiredAt),
      ),
    )
    .orderBy(desc(savedInformation.updatedAt))
    .all();
  const search = query.toLowerCase();
  return records.filter((r) =>
    `${r.title}\n${r.body}`.toLowerCase().includes(search),
  );
}
export function saveInformation(
  applicationId: string,
  input: unknown,
  id?: string,
) {
  if (!getApplication(applicationId)) throw new Error("Application not found.");
  const value = informationInputSchema.parse(input);
  // Shape is Zod's; readability is the contract's. A record that parses but
  // cannot be drawn is refused here with what to change, so Pi corrects it
  // in the same turn rather than the page rendering a lie later.
  requireReadableRecord(value);
  for (const evidence of value.evidence) {
    // Earlier records may cite a message. Pi keeps the conversation now, and
    // what it did is cited by execution or URL.
    if (evidence.type === "message")
      throw new Error("Cite an execution or a URL as evidence, not a message.");
    if (
      evidence.type === "execution" &&
      !listExecutions(applicationId).some((e) => e.id === evidence.id)
    )
      throw new Error("Evidence execution not found in this application.");
  }
  // An ID Pi chose for a record it is creating is not a mistake to refuse:
  // the ID belongs to this application and naming it is how Pi refers back
  // to the record later. Save under it, whether or not it is already there.
  const existing =
    id &&
    db()
      .select()
      .from(savedInformation)
      .where(
        and(
          eq(savedInformation.id, id),
          eq(savedInformation.applicationId, applicationId),
        ),
      )
      .get();
  const now = new Date().toISOString();
  if (id && existing)
    return db()
      .update(savedInformation)
      .set({ ...value, updatedAt: now })
      .where(
        and(
          eq(savedInformation.id, id),
          eq(savedInformation.applicationId, applicationId),
        ),
      )
      .returning()
      .get()!;
  return db()
    .insert(savedInformation)
    .values({
      ...value,
      id: id || randomUUID(),
      applicationId,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}
export function retireInformation(applicationId: string, id: string) {
  const now = new Date().toISOString();
  const record = db()
    .update(savedInformation)
    .set({ retiredAt: now, updatedAt: now })
    .where(
      and(
        eq(savedInformation.id, id),
        eq(savedInformation.applicationId, applicationId),
      ),
    )
    .returning()
    .get();
  if (!record) throw new Error("Saved information not found.");
  return record;
}
