// Test/eval convenience only. Production HTTP handlers only enqueue; the
// separately started worker owns execution. Tests share its claim/commit path.
import { randomUUID } from "node:crypto";
import { claimNextPiRun, sendChatMessage } from "../src/server/pi-runs";
import { executePiRun } from "../src/server/pi-worker";
import { getOperatorView } from "../src/server/operator-view";
import { PiUnavailableError } from "../src/server/pi";

export async function executePiTurn(
  applicationId: string,
  chatId: string,
  message: string,
) {
  const accepted = sendChatMessage(
    applicationId,
    chatId,
    message,
    randomUUID(),
  );
  const run = claimNextPiRun();
  if (run?.id !== accepted.run.id)
    throw new Error("The isolated test expected its own queued request.");
  const result = await executePiRun(run);
  if (!result || result.status !== "succeeded")
    throw new PiUnavailableError(
      result?.error ?? "The application was removed.",
    );
  return getOperatorView(applicationId, chatId);
}
