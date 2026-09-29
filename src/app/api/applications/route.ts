import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createApplication } from "@/server/applications";
import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import { applicationSummaries } from "@/server/requests";
import {
  assertSameOrigin,
  createApplicationRequestSchema,
  parseJsonRequest,
} from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The applications, as the home page reads them. No model, no probe. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    assertSameOrigin(request);
    return { applications: applicationSummaries() };
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await parseJsonRequest(
      request,
      createApplicationRequestSchema,
    );
    const { application, created } = await createApplication({
      requestKey: body.requestKey,
      ...(body.name ? { name: body.name } : {}),
      repositoryUrl: body.repositoryUrl,
    });
    return NextResponse.json(await getOperatorView(application.id), {
      status: created ? 201 : 200,
    });
  });
}
