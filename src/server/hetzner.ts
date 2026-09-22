import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { accountFile } from "./pi-configuration";
import { redactSecrets } from "./secrets";

function connectionPath() {
  return accountFile("hetzner-connection.json");
}
function connection(): { token: string; id: string } {
  try {
    return JSON.parse(readFileSync(connectionPath(), "utf8"));
  } catch {
    throw new Error(
      "Hetzner Cloud is not connected yet. It is connected in the conversation when a server is needed (request_connection), or in Settings › Connections.",
    );
  }
}
export function hetznerConnectionId() {
  try {
    return connection().id;
  } catch {
    return null;
  }
}
export class HetznerError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(
      `Hetzner rejected the request (HTTP ${status}, ${code}). Check access, capacity and the recorded operation before retrying.`,
    );
  }
}
export async function hetzner<T>(
  path: string,
  body?: unknown,
  token = connection().token,
  method = body === undefined ? "GET" : "POST",
  signal?: AbortSignal,
): Promise<T> {
  // Keep the controller credential on the fixed Cloud API origin and prefix.
  if (
    !/^\/[a-z_]+(?:\/[^\\\s#]*)?$/.test(path) &&
    !/^\/[a-z_]+\?[^\\\s#]*$/.test(path)
  )
    throw new Error("Use a relative Hetzner Cloud API path, such as /servers.");
  const url = new URL(`https://api.hetzner.cloud/v1${path}`);
  if (
    !url.pathname.startsWith("/v1/") ||
    /%2e|%2f|%5c/i.test(path.split("?")[0]) ||
    path.split(/[/?]/).includes("..")
  )
    throw new Error("Invalid Hetzner Cloud API path.");
  let response: Response;
  try {
    response = await fetch(`https://api.hetzner.cloud/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
        : AbortSignal.timeout(30000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new Error(
      "Hetzner did not return a response. Reconcile the existing request before repeating a mutation.",
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
  if (response.status === 204) return null as T;
  // Some provider actions return a root password. Never expose it to Pi,
  // native transcripts, execution logs or the browser.
  const value = await response.json();
  const scrubbed = JSON.stringify(value, (key, item) =>
    /^(root_password|password|token|private_key)$/i.test(key) && item != null
      ? "[REDACTED]"
      : item,
  )
    .split(token)
    .join("[REDACTED]");
  return JSON.parse(redactSecrets(scrubbed).text) as T;
}
export async function connectHetzner(token: string) {
  if (!/^[A-Za-z0-9_+\/=-]{48,200}$/.test(token))
    throw new Error("Enter a valid Hetzner Cloud API token.");
  await hetzner("/servers?per_page=1", undefined, token);
  mkdirSync(dirname(connectionPath()), { recursive: true, mode: 0o700 });
  const temporary = accountFile(`hetzner-${randomUUID()}.tmp`);
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
