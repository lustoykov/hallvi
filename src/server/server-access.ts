import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { hetzner, hetznerConnectionId } from "./hetzner";
import {
  operatorSettings,
  runHostCommand,
  saveOperatorSettings,
} from "./operator-execution";
import { piConfigDir } from "./pi-configuration";

const exec = promisify(execFile);
function accessPaths(applicationId: string) {
  const root = join(
    piConfigDir(),
    "operator",
    z.uuid().parse(applicationId),
    "ssh",
  );
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return { root, key: join(root, "id_ed25519") };
}

/** Only the public half can enter tool results or provider requests. */
export async function serverPublicKey(
  applicationId: string,
  signal?: AbortSignal,
) {
  const { key } = accessPaths(applicationId);
  if (!existsSync(/* turbopackIgnore: true */ key))
    await exec(
      "ssh-keygen",
      [
        "-q",
        "-t",
        "ed25519",
        "-N",
        "",
        "-C",
        `server-guy-${applicationId}`,
        "-f",
        key,
      ],
      { signal },
    );
  const { stdout } = await exec("ssh-keygen", ["-y", "-f", key], { signal });
  return { publicKey: stdout.trim() };
}

export const connectServerSchema = z
  .object({
    serverId: z.number().int().positive().optional(),
    address: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/)
      .optional(),
    user: z
      .string()
      .regex(/^[a-z_][a-z0-9_-]*$/)
      .default("root"),
    port: z.number().int().min(1).max(65535).default(22),
    hostKeyFingerprint: z
      .string()
      .regex(/^SHA256:[A-Za-z0-9+/]{43}$/)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.serverId && (!value.address || !value.hostKeyFingerprint))
      ctx.addIssue({
        code: "custom",
        message:
          "For an existing machine, provide its address and SHA256 host-key fingerprint from the owner's trusted terminal. Never paste a private key.",
      });
    if (value.serverId && value.address)
      ctx.addIssue({
        code: "custom",
        message:
          "For Hetzner, supply the server ID; the controller resolves its address from the provider.",
      });
  });

/** Pin the host key and verify SSH before saving the connection. */
export async function connectServer(
  applicationId: string,
  input: unknown,
  signal?: AbortSignal,
) {
  const params = connectServerSchema.parse(input);
  const { root, key } = accessPaths(applicationId);
  if (!existsSync(/* turbopackIgnore: true */ key))
    throw new Error(
      "Call server_public_key first and install that public key on the server.",
    );
  let address = params.address;
  let providerConnectionId: string | undefined;
  if (params.serverId) {
    const { server } = await hetzner<{
      server: { status: string; public_net: { ipv4: { ip: string } | null } };
    }>(`/servers/${params.serverId}`, undefined, undefined, "GET", signal);
    if (server.status !== "running" || !server.public_net.ipv4?.ip)
      throw new Error(
        "The Hetzner server is not running with a public IPv4 address yet. Inspect its action/status before connecting.",
      );
    address = server.public_net.ipv4.ip;
    providerConnectionId = hetznerConnectionId() ?? undefined;
  }
  if (!address || !/^[a-zA-Z0-9][a-zA-Z0-9.:-]*$/.test(address))
    throw new Error("Invalid server address.");
  const identity = createHash("sha256")
    .update(`${address}:${params.port}`)
    .digest("hex")
    .slice(0, 24);
  const knownHostsPath = join(root, `known-hosts-${identity}`);
  let hostKeys = existsSync(knownHostsPath)
    ? readFileSync(knownHostsPath, "utf8")
    : "";
  if (!hostKeys) {
    const scan = await exec(
      "ssh-keyscan",
      ["-T", "10", "-p", String(params.port), "-t", "ed25519", address],
      { signal, timeout: 15000 },
    );
    hostKeys = scan.stdout;
    if (!hostKeys.trim())
      throw new Error(
        "SSH is not ready. Inspect the server and try connecting again when it is ready.",
      );
  }
  const keyLines = hostKeys
    .trim()
    .split("\n")
    .filter((line) => !line.startsWith("#"));
  const fingerprints = keyLines.map((line) => {
    const [, kind, encoded] = line.trim().split(/\s+/);
    if (kind !== "ssh-ed25519" || !encoded)
      throw new Error("Invalid ED25519 host key.");
    return (
      "SHA256:" +
      createHash("sha256")
        .update(Buffer.from(encoded, "base64"))
        .digest("base64")
        .replace(/=+$/, "")
    );
  });
  const fingerprint = fingerprints[0];
  if (!fingerprint || fingerprints.some((value) => value !== fingerprint))
    throw new Error(
      "SSH returned ambiguous host keys. Verify the host through a trusted terminal.",
    );
  if (params.hostKeyFingerprint && fingerprint !== params.hostKeyFingerprint)
    throw new Error(
      "The server host key does not match the supplied fingerprint. The connection was not saved.",
    );
  if (!existsSync(knownHostsPath))
    writeFileSync(knownHostsPath, hostKeys, { mode: 0o600, flag: "wx" });
  const host = {
    address,
    user: params.user,
    port: params.port,
    privateKeyPath: key,
    knownHostsPath,
    ...(params.serverId
      ? {
          provider: "hetzner",
          serverId: String(params.serverId),
          providerConnectionId,
        }
      : {}),
  };
  const result = await runHostCommand(
    host,
    "printf 'server-guy-ssh-ready\\n'; uname -s",
    signal,
    undefined,
    20,
  );
  if (result.exitCode !== 0 || !result.output.includes("server-guy-ssh-ready"))
    throw new Error(
      `SSH access was not verified; the application connection was not changed. ${result.output}`,
    );
  signal?.throwIfAborted();
  saveOperatorSettings(applicationId, {
    ...operatorSettings(applicationId),
    host,
  });
  return {
    address,
    user: host.user,
    port: host.port,
    provider: host.provider ?? "existing",
    serverId: host.serverId ?? null,
    hostKeyFingerprint: fingerprint,
    hostKeyTrust: params.hostKeyFingerprint
      ? "matched supplied fingerprint"
      : "pinned on first use at provider-reported address",
    sshVerified: true,
    output: result.output,
    applicationDeployed: false,
  };
}
