import { handle } from "@/server/http";
import { withGithubConnectionTransition } from "@/server/applications";
import { parseJsonRequest } from "@/server/schemas";
import {
  cancelGithubLogin,
  emptyGithubRequestSchema,
  pollGithubLogin,
} from "@/server/github-setup";

export const runtime = "nodejs";
type Context = { params: Promise<{ attemptId: string }> };
export async function POST(request: Request, context: Context) {
  return handle(async () => {
    await parseJsonRequest(request, emptyGithubRequestSchema);
    const { attemptId } = await context.params;
    // The poll that completes sign-in replaces the saved connection.
    return withGithubConnectionTransition(() => pollGithubLogin(attemptId));
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    await parseJsonRequest(request, emptyGithubRequestSchema);
    return cancelGithubLogin((await context.params).attemptId);
  });
}
