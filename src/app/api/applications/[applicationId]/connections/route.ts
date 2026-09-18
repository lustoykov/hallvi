import { z } from "zod";

import { connectCloudflareForZone } from "@/server/cloudflare";
import {
  checkHetznerToken,
  checkMachine,
  recordResolves,
  whoHostsDns,
} from "@/server/connection-checks";
import {
  dismissConnectionRequest,
  listConnectionRequests,
  requestDomain,
  saveConnectionProgress,
  settleDomain,
  settleHost,
} from "@/server/connection-requests";
import { hetznerConnectionId } from "@/server/hetzner";
import { handle } from "@/server/http";
import { operatorSettings } from "@/server/operator-execution";
import { assertSameOrigin, parseJsonRequest } from "@/server/schemas";
import { serverPublicKey } from "@/server/server-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const name = z
  .string()
  .max(253)
  .regex(/^([a-z0-9-]+\.)+[a-z]{2,}$/);

const action = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("progress"),
    kind: z.enum(["host", "domain"]),
    progress: z.unknown(),
  }),
  z.strictObject({
    action: z.literal("dismiss"),
    kind: z.enum(["host", "domain"]),
  }),
  z.strictObject({ action: z.literal("open-domain") }),
  z.strictObject({ action: z.literal("use-hetzner") }),
  z.strictObject({
    action: z.literal("hetzner"),
    token: z.string().min(1).max(200),
  }),
  z.strictObject({
    action: z.literal("machine"),
    address: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/),
    line: z.strictObject({
      user: z.string().regex(/^[a-z_][a-z0-9_-]*$/),
      port: z.number().int().min(1).max(65535),
      fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/),
      os: z.string().max(60),
      arch: z.string().max(30),
      addresses: z.array(z.string().max(253)).max(16),
    }),
  }),
  z.strictObject({ action: z.literal("dns-host"), name }),
  z.strictObject({
    action: z.literal("cloudflare"),
    token: z.string().min(1).max(200),
    zone: name,
  }),
  z.strictObject({
    action: z.literal("resolves"),
    name,
    address: z.string().regex(/^[0-9.]{7,15}$/),
  }),
]);

/**
 * Open and settled requests, and what the cards need to draw them. Only the
 * public half of the application's key leaves; no credential is ever read.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  const { applicationId } = await context.params;
  return handle(async () => {
    const settings = operatorSettings(applicationId);
    return {
      requests: listConnectionRequests(applicationId),
      mode: settings.permissionMode,
      hostAddress: settings.host?.address ?? null,
      hetznerConnected: Boolean(hetznerConnectionId()),
      publicKey: (await serverPublicKey(applicationId)).publicKey,
    };
  });
}

/**
 * Everything a card does. A credential arrives in a same-origin JSON body and
 * goes to the provider client; the answer says what was established and never
 * carries the credential back.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    operatorSettings(applicationId);
    const body = await parseJsonRequest(request, action);
    switch (body.action) {
      case "progress":
        saveConnectionProgress(applicationId, body.kind, body.progress);
        return { saved: true };
      case "dismiss":
        dismissConnectionRequest(applicationId, body.kind);
        return { dismissed: true };
      case "open-domain":
        return { request: requestDomain(applicationId) };
      case "use-hetzner":
        // An account connected earlier: nothing to check, only to choose.
        if (!hetznerConnectionId())
          throw new Error("Hetzner is not connected on this controller.");
        settleHost(applicationId, {
          kind: "hetzner",
          servers: 0,
          reused: true,
        });
        return { settled: true };
      case "hetzner": {
        const outcome = await checkHetznerToken(applicationId, body.token);
        if (outcome.kind === "connected")
          settleHost(applicationId, {
            kind: "hetzner",
            servers: outcome.servers,
          });
        return { outcome };
      }
      case "machine": {
        const outcome = await checkMachine(
          applicationId,
          body.line,
          body.address,
        );
        if (outcome.kind === "connected")
          settleHost(applicationId, {
            kind: "machine",
            user: body.line.user,
            address: body.address,
            os: body.line.os,
          });
        return { outcome };
      }
      case "dns-host":
        return { outcome: await whoHostsDns(body.name) };
      case "cloudflare": {
        const outcome = await connectCloudflareForZone(body);
        if (outcome.kind === "connected")
          settleDomain(applicationId, "cloudflare");
        return { outcome };
      }
      case "resolves": {
        const resolves = await recordResolves(body.name, body.address);
        if (resolves) settleDomain(applicationId, "manual");
        return { outcome: resolves };
      }
    }
  });
}
