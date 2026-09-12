import { listExecutions } from "./operator-execution";
import { and, desc, eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, getApplication, getMessage } from "./db";
import { savedInformation, messages, chats } from "./db-schema";
import { informationInputSchema, type MessageBlock } from "./operator-data";

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
  for (const evidence of value.evidence) {
    if (evidence.type === "message") {
      const message = getMessage(evidence.id);
      const conversation =
        message &&
        db().select().from(chats).where(eq(chats.id, message.chatId)).get();
      if (conversation?.applicationId !== applicationId)
        throw new Error("Evidence message not found in this application.");
    }
    if (
      evidence.type === "execution" &&
      !listExecutions(applicationId).some((e) => e.id === evidence.id)
    )
      throw new Error("Evidence execution not found in this application.");
  }
  if (
    id &&
    !db()
      .select()
      .from(savedInformation)
      .where(
        and(
          eq(savedInformation.id, id),
          eq(savedInformation.applicationId, applicationId),
        ),
      )
      .get()
  )
    throw new Error("Saved information not found.");
  const now = new Date().toISOString();
  if (id)
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
      id: randomUUID(),
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
export function attachMessageBlock(
  applicationId: string,
  responseId: string,
  block: MessageBlock,
) {
  const response = getMessage(responseId);
  const owner =
    response &&
    db().select().from(chats).where(eq(chats.id, response.chatId)).get();
  if (
    !response ||
    owner?.applicationId !== applicationId ||
    response.status !== "running"
  )
    throw new Error("This response is no longer running.");
  if (
    block.type === "saved-information" &&
    !db()
      .select()
      .from(savedInformation)
      .where(
        and(
          eq(savedInformation.id, block.id),
          eq(savedInformation.applicationId, applicationId),
        ),
      )
      .get()
  )
    throw new Error("Saved information not found.");
  if (response.blocks.some((b) => JSON.stringify(b) === JSON.stringify(block)))
    return;
  db()
    .update(messages)
    .set({
      blocks: [...response.blocks, block],
      updatedAt: new Date().toISOString(),
      revision: response.revision + 1,
    })
    .where(eq(messages.id, responseId))
    .run();
}
