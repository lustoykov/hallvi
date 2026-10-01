import { z } from "zod";

import { openRouterLogin } from "@/server/openrouter-login";
import {
  openRouterKeySchema,
  saveOpenRouterKey,
} from "@/server/pi-configuration";
import { getPiSetupStatus, piLoginCoordinator } from "@/server/pi-setup";
import { handle } from "@/server/http";
import { disconnectPiRequestSchema, parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";

/** Start signing in: the page opens the returned address on OpenRouter. */
export async function POST(request: Request) {
  return handle(async () => {
    await parseJsonRequest(request, z.strictObject({}));
    piLoginCoordinator.cancelAll();
    // The same-origin check has already required a loopback Host.
    return openRouterLogin.start(`http://${request.headers.get("host")}`);
  });
}

/** A key the owner already has, pasted instead of signing in. */
export async function PUT(request: Request) {
  return handle(async () => {
    const { key } = await parseJsonRequest(request, openRouterKeySchema);
    saveOpenRouterKey(key);
    openRouterLogin.cancelAll();
    piLoginCoordinator.cancelAll();
    return getPiSetupStatus();
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    await parseJsonRequest(request, disconnectPiRequestSchema);
    openRouterLogin.disconnect();
    return getPiSetupStatus();
  });
}
