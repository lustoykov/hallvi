import { z } from "zod";

import { revealSecret } from "@/server/application-secrets";
import { handle } from "@/server/http";
import { assertSameOrigin, parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The one route that returns a stored credential, and only to the owner who
 * deliberately asked for it.
 *
 * It exists because a credential the controller generated and the owner cannot
 * read is a credential they do not have: it is in their database and nowhere
 * they can reach. Withholding it is not protection, it is losing their
 * password on their behalf.
 *
 * Every property here is deliberate:
 *
 * - **POST, not GET.** A GET is a URL, and a URL is in history, in a referrer
 *   and in anything that logs paths. This body names the secret instead.
 * - **Same origin.** The same check every other mutating route makes, so a
 *   page on another origin cannot read the owner's credentials by pointing a
 *   form at this.
 * - **`no-store`, and `force-dynamic`.** Nothing caches a password: not the
 *   browser, not a proxy, not Next's router cache.
 * - **Generated values only.** `revealSecret` refuses anything the owner
 *   typed, so this never reads back a secret given in confidence.
 * - **One name per call, named explicitly.** There is no "list them all with
 *   values" shape to be talked into.
 *
 * What it is not: an authorization boundary against someone who already has
 * this machine. The controller is a local single-operator application whose
 * encryption key sits beside its ciphertext, so anyone who can reach this
 * origin can reach the file too. This route's job is to keep plaintext out of
 * ordinary responses, transcripts and logs, and to make reading one an act the
 * owner takes on purpose.
 */
export async function POST(
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
    const shown = revealSecret(applicationId, name);
    return Response.json(shown, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        // Nothing should be able to frame or sniff this response.
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  });
}
