import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { piConfigDir } from "./pi-configuration";
import type { HostOffer } from "./deployment-types";

function connectionPath() {
  return join(piConfigDir(), "hetzner-connection.json");
}
function connection(): { token: string; id: string } {
  try {
    return JSON.parse(readFileSync(connectionPath(), "utf8"));
  } catch {
    throw new Error("Connect Hetzner to prepare a deployment recommendation.");
  }
}
export function hetznerConnectionId() {
  try {
    return connection().id;
  } catch {
    return null;
  }
}
// Only documented rejection outcomes prove that a create request had no effect.
export class HetznerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(
      `Hetzner rejected the request (HTTP ${status}, ${code}). Check access, capacity and the recorded operation before retrying.`,
    );
  }
  get definitelyNotCreated() {
    return (
      this.status >= 400 &&
      this.status < 500 &&
      [
        "invalid_input",
        "json_error",
        "unauthorized",
        "token_readonly",
        "forbidden",
        "resource_limit_exceeded",
        "resource_unavailable",
        "uniqueness_error",
        "rate_limit_exceeded",
        "not_found",
      ].includes(this.code)
    );
  }
}
export async function hetzner<T>(
  path: string,
  body?: unknown,
  token = connection().token,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`https://api.hetzner.cloud/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Hetzner did not return a response. Reconcile the existing request before retrying a purchase.",
    );
  }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    const code =
      typeof error?.error?.code === "string" &&
      /^[a-z_]+$/.test(error.error.code)
        ? error.error.code
        : "unknown";
    throw new HetznerError(response.status, code);
  }
  return response.json() as Promise<T>;
}
export async function connectHetzner(token: string) {
  if (!/^[A-Za-z0-9_+\/=-]{48,200}$/.test(token))
    throw new Error("Enter a valid Hetzner Cloud API token.");
  await hetzner("/servers?per_page=1", undefined, token);
  mkdirSync(piConfigDir(), { recursive: true, mode: 0o700 });
  const temporary = join(piConfigDir(), `hetzner-${randomUUID()}.tmp`);
  writeFileSync(
    temporary,
    JSON.stringify({
      token,
      id: createHash("sha256").update(token).digest("hex"),
    }),
    { mode: 0o600, flag: "wx" },
  );
  renameSync(temporary, connectionPath());
}
type Price = {
  location: string;
  price_monthly: { gross: string };
  price_hourly: { gross: string };
};
export async function smallestHostOffer(
  selected?: Pick<HostOffer, "serverType" | "location">,
): Promise<HostOffer> {
  const [types, pricing] = await Promise.all([
    hetzner<{
      server_types: {
        name: string;
        architecture: string;
        cpu_type: string;
        deprecated: boolean;
        memory: number;
        cores: number;
        prices: Price[];
      }[];
    }>("/server_types?per_page=50"),
    hetzner<{
      pricing: {
        currency: string;
        primary_ips: { type: string; prices: Price[] }[];
      };
    }>("/pricing"),
  ]);
  const offers: HostOffer[] = [];
  for (const type of types.server_types) {
    if (
      type.architecture !== "x86" ||
      type.deprecated ||
      type.cpu_type !== "shared" ||
      type.memory < 4
    )
      continue;
    for (const price of type.prices) {
      if (!["fsn1", "nbg1", "hel1"].includes(price.location)) continue;
      const ipv4 = pricing.pricing.primary_ips
        .find((ip) => ip.type === "ipv4")
        ?.prices.find((p) => p.location === price.location);
      if (!ipv4) continue;
      offers.push({
        serverType: type.name,
        location: price.location,
        cores: type.cores,
        memory: type.memory,
        monthly:
          Number(price.price_monthly.gross) + Number(ipv4.price_monthly.gross),
        hourly:
          Number(price.price_hourly.gross) + Number(ipv4.price_hourly.gross),
        currency: pricing.pricing.currency,
      });
    }
  }
  const offer = offers
    .filter(
      (o) =>
        Number.isFinite(o.monthly) &&
        o.monthly > 0 &&
        (!selected ||
          (o.serverType === selected.serverType &&
            o.location === selected.location)),
    )
    .sort((a, b) => a.monthly - b.monthly || a.memory - b.memory)[0];
  if (!offer)
    throw new Error(
      "No priced, compatible small Hetzner instance is available in the supported EU locations.",
    );
  return offer;
}
