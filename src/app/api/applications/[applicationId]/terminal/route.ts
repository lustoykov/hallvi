import { NextResponse } from "next/server";

import { isControllerHost } from "@/server/controller-origin";
import { handle } from "@/server/http";
import { assertSameOrigin } from "@/server/schemas";
import { issueTerminalTicket } from "@/server/terminal-bridge";
import { hostFor, readSize } from "@/server/terminal-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ applicationId: string }> };

/** What the panel needs before asking for a shell: is there a server yet. */
export function GET(_request: Request, context: Context) {
  return handle(async () => {
    const host = hostFor((await context.params).applicationId);
    return {
      target: host
        ? { user: host.user, address: host.address, port: host.port }
        : null,
    };
  });
}

/**
 * Issues a one-use capability bound to this browser's origin, this application
 * and the size the panel is currently showing. The browser never names a host,
 * a user, a key or a program; the controller resolves the target itself.
 */
export function POST(request: Request, context: Context) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    const origin = request.headers.get("origin") ?? "";
    let host: string;
    try {
      host = new URL(origin).host;
    } catch {
      return NextResponse.json(
        { error: "This request did not come from the controller." },
        { status: 403 },
      );
    }
    if (!isControllerHost(host))
      return NextResponse.json(
        { error: "This request did not come from the controller." },
        { status: 403 },
      );

    const body = await request.json().catch(() => ({}));
    const size = readSize((body as { size?: unknown }).size);
    if (!size)
      return NextResponse.json(
        { error: "Terminal dimensions were missing or out of range." },
        { status: 400 },
      );

    const saved = hostFor(applicationId);
    if (!saved)
      return NextResponse.json(
        { error: "No server is connected to this application." },
        { status: 409 },
      );

    const { ticket, port, expiresInMs } = await issueTerminalTicket({
      applicationId,
      origin,
      size,
    });
    return {
      ticket,
      url: `ws://127.0.0.1:${port}/terminal`,
      expiresInMs,
      target: { user: saved.user, address: saved.address, port: saved.port },
    };
  });
}
