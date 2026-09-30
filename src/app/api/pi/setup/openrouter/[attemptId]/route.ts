import { NextResponse } from "next/server";

import { openRouterLogin } from "@/server/openrouter-login";

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
