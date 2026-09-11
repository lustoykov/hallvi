import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { createApplication } from "@/server/applications";
import { handle } from "@/server/http";
import { getOperatorView } from "@/server/operator-view";
import {
  createApplicationRequestSchema,
  parseJsonRequest,
} from "@/server/schemas";

export const runtime = "nodejs";

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
    return NextResponse.json(getOperatorView(application.id), {
      status: created ? 201 : 200,
    });
  });
}
