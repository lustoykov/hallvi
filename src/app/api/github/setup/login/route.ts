import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";
import { emptyGithubRequestSchema, startGithubLogin } from "@/server/github-setup";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return handle(async () => { await parseJsonRequest(request, emptyGithubRequestSchema); return startGithubLogin(); });
}
