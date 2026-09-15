// Cloudflare, read through its management API.
//
// The token is read from the environment on the server and never leaves it:
// not into a record, not into a fixture, not into anything a client
// component receives. Every function here returns what a page may show, and
// the page is given names and states, never the credential that found them.
//
// One distinction the UI has to keep, because getting it wrong wastes an
// afternoon: this token manages R2 through Cloudflare's own API — it can list
// buckets and create them — and it is **not** an S3 credential. Uploading an
// object needs an R2 Access Key ID, a Secret Access Key, a bucket and an
// endpoint, which are separate things Cloudflare issues separately. A
// connected token is not a working backup destination, and the UI says so.

import { isIPv4, isIPv6 } from "node:net";

const BASE = "https://api.cloudflare.com/client/v4";

export interface CloudflareConnection {
  connected: boolean;
  /** What the token may do, as Cloudflare itself reports it. */
  status: string | null;
  /** Whether an account id is configured alongside it. */
  account: string | null;
  error: string | null;
}

function token() {
  const value = process.env.CLOUDFLARE_API_TOKEN?.trim();
  return value || null;
}

function accountId() {
  const value = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  return value || null;
}

interface CloudflareBody<T> {
  success: boolean;
  result: T;
  errors?: { code: number; message: string }[];
}

async function call<T>(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const held = token();
  if (!held)
    throw new Error(
      "No Cloudflare token is configured. Set CLOUDFLARE_API_TOKEN in the controller's environment.",
    );
  // A fixed origin and a relative path, the same rule the Hetzner client
  // keeps: a caller cannot redirect the credential somewhere else.
  if (!/^\/[a-z0-9_]+(?:\/[^\\\s#?]*)?(?:\?[^\\\s#]*)?$/i.test(path))
    throw new Error("Use a relative Cloudflare API path, such as /zones.");
  if (path.split(/[/?]/).includes("..") || /%2e|%2f|%5c/i.test(path))
    throw new Error("Invalid Cloudflare API path.");
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? "GET",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      Authorization: `Bearer ${held}`,
      "Content-Type": "application/json",
    },
    signal: options.signal ?? AbortSignal.timeout(20000),
    redirect: "error",
    cache: "no-store",
  });
  const body = (await response
    .json()
    .catch(() => null)) as CloudflareBody<T> | null;
  if (!response.ok || !body?.success) {
    const said = body?.errors?.map((item) => item.message).join("; ");
    throw new Error(
      `Cloudflare refused the request (HTTP ${response.status})${said ? `: ${said}` : ""}.`,
    );
  }
  return body.result;
}

/**
 * Whether the configured token works, asked of Cloudflare rather than
 * assumed from the variable being set. An honest connected state costs one
 * request and is the difference between "configured" and "works".
 */
export async function verifyCloudflare(): Promise<CloudflareConnection> {
  if (!token())
    return {
      connected: false,
      status: null,
      account: accountId(),
      error: "No CLOUDFLARE_API_TOKEN is set on the controller.",
    };
  try {
    const result = await call<{ status: string }>("/user/tokens/verify");
    return {
      connected: result.status === "active",
      status: result.status,
      account: accountId(),
      error:
        result.status === "active"
          ? null
          : `The token is ${result.status}, so it cannot be used.`,
    };
  } catch (problem) {
    return {
      connected: false,
      status: null,
      account: accountId(),
      error: problem instanceof Error ? problem.message : String(problem),
    };
  }
}

export interface CloudflareZone {
  id: string;
  name: string;
  status: string;
  nameServers: string[];
}

/** The zones this token can see. Names and states; nothing secret. */
export async function cloudflareZones(): Promise<CloudflareZone[]> {
  const result =
    await call<
      { id: string; name: string; status: string; name_servers?: string[] }[]
    >("/zones?per_page=50");
  return result.map((zone) => ({
    id: zone.id,
    name: zone.name,
    status: zone.status,
    nameServers: zone.name_servers ?? [],
  }));
}

export interface CloudflareRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
}

/** The DNS records of one zone, as they stand. This reads; it never writes. */
export async function cloudflareRecords(
  zoneId: string,
): Promise<CloudflareRecord[]> {
  if (!/^[0-9a-f]{32}$/.test(zoneId))
    throw new Error("A Cloudflare zone id is 32 hexadecimal characters.");
  const result = await call<
    {
      id: string;
      type: string;
      name: string;
      content: string;
      proxied?: boolean;
    }[]
  >(`/zones/${zoneId}/dns_records?per_page=100`);
  return result.map((item) => ({
    id: item.id,
    type: item.type,
    name: item.name,
    content: item.content,
    proxied: Boolean(item.proxied),
  }));
}

export interface R2Bucket {
  name: string;
  createdAt: string | null;
}

/**
 * The R2 buckets on the account. Listing them proves the token manages R2;
 * it proves nothing about being able to put an object in one, which needs an
 * S3 credential this token is not.
 */
export async function cloudflareBuckets(): Promise<R2Bucket[]> {
  const account = accountId();
  if (!account)
    throw new Error(
      "No CLOUDFLARE_ACCOUNT_ID is set, and R2 is addressed per account.",
    );
  if (!/^[0-9a-f]{32}$/.test(account))
    throw new Error("A Cloudflare account id is 32 hexadecimal characters.");
  const result = await call<{
    buckets: { name: string; creation_date?: string }[];
  }>(`/accounts/${account}/r2/buckets`);
  return (result.buckets ?? []).map((bucket) => ({
    name: bucket.name,
    createdAt: bucket.creation_date ?? null,
  }));
}

/**
 * What is still missing before a backup could actually be written to R2. Said
 * as a list rather than a boolean, because each item is a separate thing the
 * owner has to go and get.
 */
export function r2UploadGaps() {
  return [
    "An R2 Access Key ID",
    "Its Secret Access Key",
    "The bucket to write into",
    "The account's S3 endpoint",
  ];
}

export interface DomainReading {
  name: string;
  /** The zone the name belongs to, when the token can see one. */
  zone: string | null;
  /** The record as the provider holds it, or null when there is none. */
  record: CloudflareRecord | null;
  /**
   * Whether the provider answers on the name's behalf. Kept separate from
   * `record` because a proxied name and a direct name fail in different
   * ways, and a reader has to be told which one they have.
   */
  proxied: boolean;
}

/**
 * What the provider holds for one name. This is a *configuration* reading and
 * nothing more: it says a record exists and where it points, and it is never
 * evidence that anything answers at the other end. A proxied name in
 * particular resolves, serves a valid certificate and returns an error page
 * while the origin behind it is entirely dead.
 *
 * Returns a reading with a null record when the zone is visible and the name
 * is simply not in it — that is an established absence, not a failure — and
 * throws only when the provider could not be asked.
 */
export function domainName(name: string) {
  const wanted = name.trim().toLowerCase().replace(/\.$/, "");
  if (
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      wanted,
    )
  )
    throw new Error(`"${name}" is not a domain name.`);
  return wanted;
}

/** The zone that holds a name, or a refusal naming what the token can see. */
async function zoneFor(wanted: string): Promise<CloudflareZone> {
  const zones = await cloudflareZones();
  // The longest matching zone wins: a name can sit under both example.com
  // and a delegated sub.example.com, and the more specific one holds it.
  const zone = zones
    .filter((item) => wanted === item.name || wanted.endsWith(`.${item.name}`))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (!zone)
    throw new Error(
      `No zone this token can see covers ${wanted}. The name may be at another provider, or the token may not reach its zone.`,
    );
  return zone;
}

export async function cloudflareDomain(name: string): Promise<DomainReading> {
  const wanted = domainName(name);
  const zone = await zoneFor(wanted);
  const records = await cloudflareRecords(zone.id);
  const record =
    records.find(
      (item) =>
        item.name.toLowerCase() === wanted &&
        /^(A|AAAA|CNAME)$/.test(item.type),
    ) ?? null;
  return {
    name: wanted,
    zone: zone.name,
    record,
    proxied: Boolean(record?.proxied),
  };
}

export type DomainRecordType = "A" | "AAAA" | "CNAME";

export interface DomainRecordOutcome {
  action: "created" | "updated" | "unchanged" | "removed";
  name: string;
  zone: string;
  type: DomainRecordType;
  /** What the name hands out after this call, or null once removed. */
  content: string | null;
  proxied: boolean;
  /** What stood at this exact name and type before, when anything did. */
  previous: { content: string; proxied: boolean } | null;
  /**
   * Every other address record still held for the same name. A stale AAAA
   * beside a fresh A is the failure this field exists to make visible:
   * browsers prefer IPv6, so the name breaks for the visitors who have it
   * while resolving perfectly for everyone who checks with IPv4.
   */
  others: CloudflareRecord[];
}

function requireContent(type: DomainRecordType, content: string) {
  const value = content.trim();
  if (type === "A" && !isIPv4(value))
    throw new Error(`An A record holds an IPv4 address; "${content}" is not.`);
  if (type === "AAAA" && !isIPv6(value))
    throw new Error(
      `An AAAA record holds an IPv6 address; "${content}" is not.`,
    );
  if (type === "CNAME") return domainName(value);
  return value;
}

/** Only the address records; the rest of the zone is nobody's business here. */
async function addressRecords(zoneId: string, wanted: string) {
  const records = await cloudflareRecords(zoneId);
  return records.filter(
    (item) =>
      item.name.toLowerCase() === wanted && /^(A|AAAA|CNAME)$/.test(item.type),
  );
}

/**
 * Point one name at one address.
 *
 * The whole safety of this tool is its shape: one exact name and one exact
 * type per call, so there is no request it can make that touches a record
 * the caller did not name. Nothing here can rewrite a zone, and the outcome
 * reports what stood there before and what else still answers for the name,
 * so an execution record shows the actual change rather than the intent.
 *
 * Overwriting a name that already points somewhere else needs `replace`.
 * That is the conflicting-DNS case, and it should stop and be explained to
 * the owner rather than quietly take the name away from whatever had it.
 */
export async function writeDomainRecord(change: {
  name: string;
  type: DomainRecordType;
  content: string;
  proxied?: boolean;
  ttl?: number;
  replace?: boolean;
  /** Written into the record's comment, so an audit can attribute it. */
  owner?: string;
}): Promise<DomainRecordOutcome> {
  const wanted = domainName(change.name);
  const content = requireContent(change.type, change.content);
  const proxied = Boolean(change.proxied);
  const ttl = change.ttl ?? 1;
  const zone = await zoneFor(wanted);
  const held = await addressRecords(zone.id, wanted);
  const existing = held.find((item) => item.type === change.type) ?? null;
  const conflicting = held.filter(
    (item) => item.type !== change.type && item.type === "CNAME",
  );
  if (conflicting.length && !change.replace)
    throw new Error(
      `${wanted} is a CNAME to ${conflicting[0].content}, and a CNAME cannot sit beside an ${change.type} record. Remove the CNAME first, or pass replace to take the name over, and tell the owner what it was pointing at.`,
    );
  if (
    existing &&
    (existing.content.toLowerCase() !== content.toLowerCase() ||
      existing.proxied !== proxied) &&
    !change.replace
  )
    throw new Error(
      `${wanted} already has an ${change.type} record pointing at ${existing.content}${existing.proxied ? " (proxied)" : ""}. Nothing was changed. Tell the owner what is there and pass replace only once they have decided to take the name over.`,
    );
  const previous = existing
    ? { content: existing.content, proxied: existing.proxied }
    : null;
  const body = {
    type: change.type,
    name: wanted,
    content,
    ttl,
    proxied,
    comment: `managed-by=server-guy${change.owner ? ` app=${change.owner}` : ""}`,
  };
  let action: DomainRecordOutcome["action"] = "created";
  if (existing) {
    if (
      existing.content.toLowerCase() === content.toLowerCase() &&
      existing.proxied === proxied
    )
      action = "unchanged";
    else {
      await call(`/zones/${zone.id}/dns_records/${existing.id}`, {
        method: "PUT",
        body,
      });
      action = "updated";
    }
  } else await call(`/zones/${zone.id}/dns_records`, { method: "POST", body });
  return {
    action,
    name: wanted,
    zone: zone.name,
    type: change.type,
    content,
    proxied,
    previous,
    others: (await addressRecords(zone.id, wanted)).filter(
      (item) => item.type !== change.type,
    ),
  };
}

/**
 * Take one record away again.
 *
 * `content` is required and must match what the provider holds. Withdrawing
 * an application should never delete a record somebody else put there under
 * a name that was guessed, and "the name we published" is exactly the record
 * whose address we already know.
 */
export async function removeDomainRecord(target: {
  name: string;
  type: DomainRecordType;
  content: string;
}): Promise<DomainRecordOutcome> {
  const wanted = domainName(target.name);
  const zone = await zoneFor(wanted);
  const held = await addressRecords(zone.id, wanted);
  const existing = held.find((item) => item.type === target.type) ?? null;
  if (!existing)
    return {
      action: "removed",
      name: wanted,
      zone: zone.name,
      type: target.type,
      content: null,
      proxied: false,
      previous: null,
      others: held,
    };
  if (existing.content.toLowerCase() !== target.content.trim().toLowerCase())
    throw new Error(
      `${wanted} has an ${target.type} record pointing at ${existing.content}, not at ${target.content}. Nothing was removed: this is not the record this application published, and deleting it would take down whatever is using it.`,
    );
  await call(`/zones/${zone.id}/dns_records/${existing.id}`, {
    method: "DELETE",
  });
  return {
    action: "removed",
    name: wanted,
    zone: zone.name,
    type: target.type,
    content: null,
    proxied: false,
    previous: { content: existing.content, proxied: existing.proxied },
    others: (await addressRecords(zone.id, wanted)).filter(
      (item) => item.type !== target.type,
    ),
  };
}
