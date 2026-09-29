import { listExecutions } from "./operator-execution";
import { getApplication, saveInformationRow } from "./db";
import { informationInputSchema } from "./operator-data";
import { requireReadableRecord } from "./record-contract";
export { listInformation, retireInformation } from "./db";

export async function saveInformation(
  applicationId: string,
  input: unknown,
  id?: string,
) {
  if (!(await getApplication(applicationId)))
    throw new Error("Application not found.");
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
      !(await listExecutions(applicationId)).some((e) => e.id === evidence.id)
    )
      throw new Error("Evidence execution not found in this application.");
  }
  return await saveInformationRow(applicationId, value, id);
}
