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

async function call<T>(path: string, signal?: AbortSignal): Promise<T> {
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
    headers: {
      Authorization: `Bearer ${held}`,
      "Content-Type": "application/json",
    },
    signal: signal ?? AbortSignal.timeout(20000),
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
export async function cloudflareDomain(name: string): Promise<DomainReading> {
  const wanted = name.trim().toLowerCase().replace(/\.$/, "");
  if (
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
      wanted,
    )
  )
    throw new Error(`"${name}" is not a domain name.`);
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
