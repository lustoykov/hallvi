import { NextResponse } from "next/server";

import { getPiSetupStatus, piLoginCoordinator } from "@/server/pi-setup";
import {
  choosePiSetup,
  choosePiSetupSchema,
  updatePiPreferences,
  updatePiPreferencesSchema,
} from "@/server/pi-configuration";
import { handle } from "@/server/http";
import { disconnectPiRequestSchema, parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json(
    await getPiSetupStatus(
      undefined,
      new URL(request.url).searchParams.get("preview") === "1",
    ),
  );
}

export async function POST(request: Request) {
  return handle(async () => {
    await choosePiSetup(await parseJsonRequest(request, choosePiSetupSchema));
    return getPiSetupStatus();
  });
}

export async function PATCH(request: Request) {
  return handle(async () => {
    await updatePiPreferences(
      await parseJsonRequest(request, updatePiPreferencesSchema),
    );
    return getPiSetupStatus();
  });
}

export async function DELETE(request: Request) {
  return handle(async () => {
    await parseJsonRequest(request, disconnectPiRequestSchema);
    piLoginCoordinator.disconnect();
    return getPiSetupStatus();
  });
}
