import { z } from "zod";

import {
  confirmRecoveryKit,
  recoveryKit,
} from "@/server/controller-protection";
import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The passphrase that opens Hallvi's own copies. It is deliberately not
 * part of the application view: a page asks for it when it is about to show
 * it, and the owner asks for it again from Settings.
 */
export function GET() {
  return handle(() => recoveryKit() ?? { kit: null });
}

/** The owner says they have saved it somewhere this machine is not. */
export function POST(request: Request) {
  return handle(async () => {
    await parseJsonRequest(request, z.strictObject({}));
    return confirmRecoveryKit();
  });
}
