import { NextResponse } from "next/server";

import { piLoginCoordinator } from "@/server/pi-setup";
import { updatePiPreferencesSchema } from "@/server/pi-configuration";
import { parseJsonRequest } from "@/server/schemas";
import { handle } from "@/server/http";

export const runtime = "nodejs";

export function POST(request: Request) {
  return handle(async () => NextResponse.json(
    piLoginCoordinator.start(await parseJsonRequest(request, updatePiPreferencesSchema)),
    { status: 202 },
  ));
}
