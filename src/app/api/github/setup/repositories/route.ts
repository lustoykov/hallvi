import { z } from "zod";

import { handle } from "@/server/http";
import { recheckGithubRepositories } from "@/server/applications";
import { parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";
const requestSchema = z.strictObject({ connectionId: z.uuid() });

export async function POST(request: Request) {
  return handle(async () => {
    const { connectionId } = await parseJsonRequest(request, requestSchema);
    return recheckGithubRepositories(connectionId);
  });
}
