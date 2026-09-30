import { NextResponse } from "next/server";

import { openRouterLogin } from "@/server/openrouter-login";
import { handle } from "@/server/http";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const attempt = openRouterLogin.get((await params).attemptId);
  return attempt
    ? NextResponse.json(attempt)
    : NextResponse.json(
        { error: "This OpenRouter sign-in is no longer open." },
        { status: 404 },
      );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const attempt = openRouterLogin.cancel((await params).attemptId);
    return attempt
      ? NextResponse.json(attempt)
      : NextResponse.json(
          { error: "This OpenRouter sign-in is no longer open." },
          { status: 404 },
        );
  });
}
