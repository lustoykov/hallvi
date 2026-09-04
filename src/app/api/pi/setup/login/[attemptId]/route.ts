import { NextResponse } from "next/server";

import { piLoginCoordinator } from "@/server/pi-setup";
import { handle } from "@/server/http";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";

function missingAttempt() {
  return NextResponse.json(
    { error: "This Pi login attempt is no longer available. Start a new login." },
    { status: 404 },
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await context.params;
  const attempt = piLoginCoordinator.get(attemptId);
  return attempt ? NextResponse.json(attempt) : missingAttempt();
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ attemptId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { attemptId } = await context.params;
    const attempt = piLoginCoordinator.cancel(attemptId);
    return attempt ? NextResponse.json(attempt) : missingAttempt();
  });
}
