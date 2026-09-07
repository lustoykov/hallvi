import { z } from "zod";
import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";
import { startPreparation, refreshPreparation } from "@/server/preparation";
import { grantPublication, continueWithServerGuy } from "@/server/phase-three";
import { activePublicationGrant } from "@/server/db";
import { currentGithubConnectionId } from "@/server/github-connection";
import { getOperatorView } from "@/server/operator-view";
export const runtime = "nodejs";
const schema = z.strictObject({ action: z.enum(["start", "refresh"]) });
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const { action } = await parseJsonRequest(request, schema);
    const { applicationId } = await context.params;
    if (action === "refresh") await refreshPreparation(applicationId);
    else {
      if (
        activePublicationGrant(applicationId)?.connectionId !==
        currentGithubConnectionId()
      )
        await grantPublication(applicationId);
      await startPreparation(applicationId);
      continueWithServerGuy(applicationId);
    }
    return getOperatorView(applicationId);
  });
}
