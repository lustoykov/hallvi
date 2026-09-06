import { z } from "zod";

import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import { returnExternalChange } from "@/server/phase-three";
import { parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";

const schema = z.strictObject({
  reference: z
    .string({ error: "Enter a pull request, branch or commit." })
    .trim()
    .min(1, "Enter a pull request, branch or commit.")
    .max(400, "Keep the reference under 400 characters."),
});

/** A change made elsewhere, fetched and checked independently. */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    const { reference } = await parseJsonRequest(request, schema);
    const { applicationId } = await context.params;
    await returnExternalChange(applicationId, reference);
    return getOperatorView(applicationId, undefined, "make-launch-ready");
  });
}
