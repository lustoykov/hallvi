import { NextResponse } from "next/server";

import { getPiSetupStatus } from "@/server/pi-setup";
import { choosePiSetup, choosePiSetupSchema } from "@/server/pi-configuration";
import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json(await getPiSetupStatus(undefined, new URL(request.url).searchParams.get("preview") === "1"));
}

export async function POST(request: Request) {
  return handle(async () => {
    await choosePiSetup(await parseJsonRequest(request, choosePiSetupSchema));
    return getPiSetupStatus();
  });
}
