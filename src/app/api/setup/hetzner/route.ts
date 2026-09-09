import { z } from "zod";
import { handle } from "@/server/http";
import { parseJsonRequest } from "@/server/schemas";
import { connectHetzner, hetznerConnectionId } from "@/server/hetzner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return handle(() => ({ connected: Boolean(hetznerConnectionId()) }));
}
export function POST(request: Request) {
  return handle(async () => {
    const { token } = await parseJsonRequest(
      request,
      z.strictObject({ token: z.string().min(1).max(200) }),
    );
    await connectHetzner(token);
    return { connected: true };
  });
}
