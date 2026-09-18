// A connection the conversation is waiting on the owner for.
//
// Pi asks for a place to run the application, or the owner asks to give it a
// domain, and the request is kept here so the card is still in the
// conversation after a reload, a trip to a provider's site or a night's sleep.
// What is kept is where the owner got to — a choice, a guide step, a domain
// name — and, once settled, a one-line description of what was connected.
// A credential is never written here; the checks save those where the
// provider clients already read them.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { piConfigDir } from "./pi-configuration";

const dnsHostSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("cloudflare"), zone: z.string().max(253) }),
  z.strictObject({
    kind: z.literal("other"),
    zone: z.string().max(253),
    nameservers: z.array(z.string().max(253)).max(16),
    who: z.string().max(60).nullable(),
  }),
  z.strictObject({ kind: z.literal("unregistered") }),
  z.strictObject({ kind: z.literal("unreachable") }),
]);

export const hostProgressSchema = z.strictObject({
  choice: z.enum(["hetzner", "machine"]).nullable(),
  guideAt: z.number().int().min(0).max(9),
});
export const domainProgressSchema = z.strictObject({
  name: z.string().max(253),
  host: dnsHostSchema.nullable(),
  way: z.enum(["cloudflare", "manual"]).nullable(),
  guideAt: z.number().int().min(0).max(9),
});

const connectedHostSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("hetzner"), servers: z.number().int() }),
  z.strictObject({
    kind: z.literal("machine"),
    user: z.string().max(64),
    address: z.string().max(253),
    os: z.string().max(60),
  }),
]);

const requestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("host"),
    requestedAt: z.string(),
    settledAt: z.string().nullable(),
    needs: z.string().max(400),
    estimate: z.string().max(80),
    recommended: z.enum(["hetzner", "machine"]),
    progress: hostProgressSchema,
    connected: connectedHostSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal("domain"),
    requestedAt: z.string(),
    settledAt: z.string().nullable(),
    progress: domainProgressSchema,
  }),
]);
export type ConnectionRequest = z.infer<typeof requestSchema>;
export type ConnectedHost = z.infer<typeof connectedHostSchema>;

function path(applicationId: string) {
  const directory = join(piConfigDir(), "connection-requests");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return join(directory, `${z.uuid().parse(applicationId)}.json`);
}

export function listConnectionRequests(
  applicationId: string,
): ConnectionRequest[] {
  const file = path(applicationId);
  try {
    return z.array(requestSchema).parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return [];
  }
}

function write(applicationId: string, requests: ConnectionRequest[]) {
  const file = path(applicationId);
  const temporary = `${file}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(requests, null, 2), { mode: 0o600 });
  renameSync(temporary, file);
}

/** Replaces the request of that kind: there is one place, and one domain. */
function put(applicationId: string, request: ConnectionRequest) {
  write(applicationId, [
    ...listConnectionRequests(applicationId).filter(
      (item) => item.kind !== request.kind,
    ),
    request,
  ]);
  return request;
}

/** Asking again while one is open keeps the owner's place in it. */
export function requestHost(
  applicationId: string,
  input: {
    needs: string;
    estimate: string;
    recommended: "hetzner" | "machine";
  },
) {
  const open = listConnectionRequests(applicationId).find(
    (item) => item.kind === "host" && !item.settledAt,
  );
  return put(applicationId, {
    kind: "host",
    requestedAt: open?.requestedAt ?? new Date().toISOString(),
    settledAt: null,
    ...input,
    progress:
      open?.kind === "host"
        ? open.progress
        : { choice: input.recommended, guideAt: 0 },
    connected: null,
  });
}

export function requestDomain(applicationId: string, name = "") {
  const open = listConnectionRequests(applicationId).find(
    (item) => item.kind === "domain" && !item.settledAt,
  );
  if (open) return open;
  return put(applicationId, {
    kind: "domain",
    requestedAt: new Date().toISOString(),
    settledAt: null,
    progress: { name, host: null, way: null, guideAt: 0 },
  });
}

export function saveConnectionProgress(
  applicationId: string,
  kind: ConnectionRequest["kind"],
  progress: unknown,
) {
  const open = listConnectionRequests(applicationId).find(
    (item) => item.kind === kind && !item.settledAt,
  );
  if (!open) throw new Error("That request is no longer open.");
  if (open.kind === "host")
    put(applicationId, {
      ...open,
      progress: hostProgressSchema.parse(progress),
    });
  else
    put(applicationId, {
      ...open,
      progress: domainProgressSchema.parse(progress),
    });
}

export function settleHost(applicationId: string, connected: ConnectedHost) {
  const open = listConnectionRequests(applicationId).find(
    (item) => item.kind === "host",
  );
  if (open?.kind !== "host") return;
  put(applicationId, {
    ...open,
    settledAt: new Date().toISOString(),
    connected,
  });
}

export function settleDomain(
  applicationId: string,
  way: "cloudflare" | "manual",
) {
  const open = listConnectionRequests(applicationId).find(
    (item) => item.kind === "domain",
  );
  if (open?.kind !== "domain") return;
  put(applicationId, {
    ...open,
    settledAt: new Date().toISOString(),
    progress: { ...open.progress, way },
  });
}

/** "Not now": the request goes away and nothing else changes. */
export function dismissConnectionRequest(
  applicationId: string,
  kind: ConnectionRequest["kind"],
) {
  write(
    applicationId,
    listConnectionRequests(applicationId).filter(
      (item) => item.kind !== kind || item.settledAt,
    ),
  );
}
