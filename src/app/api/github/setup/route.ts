import { handle } from "@/server/http";
import { withGithubConnectionTransition } from "@/server/phase-one";
import { assertSameOrigin, parseJsonRequest } from "@/server/schemas";
import {
  adoptGithubCliLogin,
  disconnectGithub,
  disconnectGithubSchema,
  getGithubSetupStatus,
  useGithubCliSchema,
} from "@/server/github-setup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    return getGithubSetupStatus();
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    const body = await parseJsonRequest(request, useGithubCliSchema);
    await withGithubConnectionTransition(() =>
      adoptGithubCliLogin(body.candidateId),
    );
    return getGithubSetupStatus();
  });
}
export async function DELETE(request: Request) {
  return handle(async () => {
    await parseJsonRequest(request, disconnectGithubSchema);
    await withGithubConnectionTransition(() => disconnectGithub());
    return getGithubSetupStatus();
  });
}
