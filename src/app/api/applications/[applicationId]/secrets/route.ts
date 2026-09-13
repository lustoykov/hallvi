import { z } from "zod";

import {
  establishSecret,
  listSecrets,
  withdrawSecret,
} from "@/server/application-secrets";
import { handle } from "@/server/http";
import { assertSameOrigin, parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Names and states. There is no route that returns a value. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await context.params;
  return handle(() => ({ secrets: listSecrets(applicationId) }));
}

/**
 * The owner supplies a value. The only path a secret takes into the
 * controller, and it does not pass through a message, so it never reaches
 * the model's context or the transcript.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    const { name, value } = await parseJsonRequest(
      request,
      z.strictObject({
        name: z.string().min(1).max(64),
        value: z.string().min(1).max(4096),
      }),
    );
    establishSecret(applicationId, name, value);
    return { secrets: listSecrets(applicationId) };
  });
}

/** The owner takes one back; the handle stops resolving at once. */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    const { name } = await parseJsonRequest(
      request,
      z.strictObject({ name: z.string().min(1).max(64) }),
    );
    withdrawSecret(applicationId, name);
    return { secrets: listSecrets(applicationId) };
  });
}
