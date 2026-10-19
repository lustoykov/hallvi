import { readExecution } from "./operator-execution";
import { getApplication, listInformation, saveInformationRow } from "./db";
import { informationInputSchema, type SavedInformation } from "./operator-data";
import { requireReadableRecord } from "./record-contract";
import { subjectsMentioned } from "./record-projection";
import { redactHeldSecrets } from "./application-secrets";
import { redactSecrets } from "./secrets";
export { listInformation, retireInformation } from "./db";

export async function saveInformation(
  applicationId: string,
  input: unknown,
  id?: string,
) {
  if (!(await getApplication(applicationId)))
    throw new Error("Application not found.");
  const value = informationInputSchema.parse(input);
  // A saved account of a problem can quote tool output or owner-supplied
  // evidence. Keep its prose safe before persistence and before the save
  // result is handed back to Pi to repeat in a copyable reply.
  const clean = (text: string) =>
    redactSecrets(redactHeldSecrets(applicationId, text)).text;
  value.title = informationInputSchema.shape.title.parse(clean(value.title));
  value.body = informationInputSchema.shape.body.parse(clean(value.body));
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
      (await readExecution(applicationId, evidence.id))?.id !== evidence.id
    )
      throw new Error("Evidence execution not found in this application.");
  }
  // An update replaces the whole record, so a fact left out is erased. Say
  // which, with what it held, so Pi can put back one it meant to keep.
  const records = await listInformation(applicationId, "", true);
  const before = id ? records.find((record) => record.id === id) : undefined;
  // Pi does not read conversations from before Pi 1.0, so it named running
  // processes afresh and Processes listed each web server twice. A name the
  // application has never used is shown the names it has. The record being
  // replaced is not a peer, and a retired one lists nothing.
  const known = subjectsMentioned(
    records.filter((record) => record.id !== id),
    "process",
  ).map((ref) => ref.id);
  const named = subjectsMentioned(
    [{ presentation: value.presentation } as SavedInformation],
    "process",
  ).map((ref) => ref.id);
  const fresh =
    known.length && !before?.retiredAt
      ? named.filter((name) => !known.includes(name))
      : [];
  const saved = await saveInformationRow(applicationId, value, id);
  const kept = new Set(value.presentation?.facts?.map((fact) => fact.key));
  const dropped = (before?.presentation?.facts ?? []).filter(
    (fact) => fact.key && !kept.has(fact.key),
  );
  const warnings = [
    dropped.length &&
      `This update removed ${dropped.map((fact) => `${fact.key} ("${fact.value}")`).join(", ")}, which the record had. An update replaces the whole record; if a fact still holds, save again with it.`,
    fresh.length &&
      `This record names ${fresh.map((name) => `process "${name}"`).join(", ")}, which no earlier record uses. The application's records already name ${known.map((name) => `"${name}"`).join(", ")}. If it is one of those under another name, update this record with that id; a second name lists the same process twice.`,
  ].filter(Boolean);
  if (!warnings.length) return saved;
  return { ...saved, warning: warnings.join(" ") };
}
