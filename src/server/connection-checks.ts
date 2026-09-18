// What a connection card is told after the owner presses "check".
//
// Each answer keeps apart the things a person would otherwise have to guess
// between: a provider that could not be reached has said nothing about the
// credential; a token that reads and cannot write is a working token of the
// wrong kind; a machine that answers with another identity is not the machine.
// Nothing is saved unless every step passed.

import { resolve4, resolveNs } from "node:dns/promises";

import type {
  DnsHost,
  HetznerOutcome,
  MachineLine,
  MachineOutcome,
} from "@/components/hallvi/onboarding/types";

import { connectHetzner, hetzner, HetznerError } from "./hetzner";
import { runHostCommand } from "./operator-execution";
import { connectServer, serverPublicKey } from "./server-access";

/**
 * Reads the project, then proves write access the only way Hetzner allows:
 * by writing. The write is this application's public SSH key, which creating
 * a server needs anyway, costs nothing and is disclosed beside the button.
 */
export async function checkHetznerToken(
  applicationId: string,
  token: string,
): Promise<HetznerOutcome> {
  if (!/^[A-Za-z0-9]{64}$/.test(token)) return { kind: "rejected" };
  let servers = 0;
  try {
    const read = await hetzner<{
      meta?: { pagination?: { total_entries?: number } };
    }>("/servers?per_page=1", undefined, token);
    servers = read.meta?.pagination?.total_entries ?? 0;
  } catch (error) {
    if (error instanceof HetznerError)
      return error.status === 401 ? { kind: "rejected" } : unreachable();
    return unreachable();
  }
  const { publicKey } = await serverPublicKey(applicationId);
  try {
    await hetzner(
      "/ssh_keys",
      {
        name: `hallvi-${applicationId}`,
        public_key: publicKey,
        labels: { "hallvi-application": applicationId },
      },
      token,
    );
  } catch (error) {
    if (!(error instanceof HetznerError)) return unreachable();
    if (error.status === 403) return { kind: "read-only", servers };
    // Already registered by an earlier connection: authorised, and there.
    if (error.code !== "uniqueness_error") return unreachable();
  }
  await connectHetzner(token);
  return { kind: "connected", servers, wrote: true };
}

function unreachable(): HetznerOutcome {
  return { kind: "unreachable" };
}

class MachineRefusal extends Error {
  constructor(public readonly at: "sudo-password" | "unsupported") {
    super(at);
  }
}

/**
 * Attaches an existing machine through the same pinning and verification a
 * provisioned one gets, then checks it is a machine Hallvi can work on. The
 * host is saved only when all of it holds.
 */
export async function checkMachine(
  applicationId: string,
  line: MachineLine,
  address: string,
): Promise<MachineOutcome> {
  let facts = "";
  try {
    await connectServer(
      applicationId,
      {
        address,
        user: line.user,
        port: line.port,
        hostKeyFingerprint: line.fingerprint,
      },
      undefined,
      {
        waitMs: 12_000,
        require: async (host) => {
          const probe = await runHostCommand(
            host,
            [
              "uname -sm",
              'if [ "$(id -u)" = 0 ] || sudo -n true 2>/dev/null; then echo admin=yes; else echo admin=no; fi',
              "command -v docker >/dev/null 2>&1 && echo docker=yes || echo docker=no",
              "awk '/MemAvailable/ {print \"memory=\" int($2/1024)}' /proc/meminfo",
              "df -Pk / | awk 'NR==2 {print \"disk=\" int($4/1048576)}'",
            ].join("; "),
            undefined,
            undefined,
            20,
          );
          facts = probe.output;
          if (!/^Linux (x86_64|aarch64|arm64)$/m.test(facts))
            throw new MachineRefusal("unsupported");
          if (!facts.includes("admin=yes"))
            throw new MachineRefusal("sudo-password");
        },
      },
    );
  } catch (error) {
    if (error instanceof MachineRefusal)
      return { kind: "failed", at: error.at };
    const said = error instanceof Error ? error.message : "";
    if (said.includes("does not match the supplied fingerprint"))
      return { kind: "failed", at: "wrong-machine" };
    if (said.includes("SSH did not answer"))
      return {
        kind: "failed",
        at: /refused/i.test(said) ? "refused" : "timeout",
      };
    if (said.includes("SSH access was not verified"))
      return { kind: "failed", at: "key-refused" };
    throw error;
  }
  return {
    kind: "connected",
    docker: facts.includes("docker=yes") ? "present" : "will-install",
    memoryMb: Number(/memory=(\d+)/.exec(facts)?.[1] ?? 0),
    diskGb: Number(/disk=(\d+)/.exec(facts)?.[1] ?? 0),
  };
}

const KNOWN_DNS: [RegExp, string][] = [
  [/registrar-servers\.com$/, "Namecheap"],
  [/domaincontrol\.com$/, "GoDaddy"],
  [/awsdns-/, "Amazon Route 53"],
  [/googledomains\.com$|squarespacedns\.com$/, "Squarespace"],
  [/digitalocean\.com$/, "DigitalOcean"],
  [/hetzner\.(com|de)$/, "Hetzner DNS"],
  [/porkbun\.com$/, "Porkbun"],
  [/gandi\.net$/, "Gandi"],
  [/ovh\.net$/, "OVH"],
];

/**
 * Who answers for a name, asked of public DNS with no credential. The zone
 * is the nearest parent that has name servers, so `a.b.example.co.uk` finds
 * `example.co.uk` without a suffix list.
 */
export async function whoHostsDns(name: string): Promise<DnsHost> {
  const labels = name.split(".");
  for (let from = 0; from < labels.length - 1; from++) {
    const zone = labels.slice(from).join(".");
    // A registry's own second level (co.uk, com.au) is nobody's zone.
    if (/^(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/.test(zone)) break;
    try {
      const nameservers = await resolveNs(zone);
      if (!nameservers.length) continue;
      if (nameservers.some((host) => /\.ns\.cloudflare\.com$/i.test(host)))
        return { kind: "cloudflare", zone };
      const who =
        KNOWN_DNS.find(([pattern]) =>
          nameservers.some((host) => pattern.test(host.toLowerCase())),
        )?.[1] ?? null;
      return { kind: "other", zone, nameservers, who };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOTFOUND" && code !== "ENODATA")
        return { kind: "unreachable" };
    }
  }
  return { kind: "unregistered" };
}

/** Whether public DNS hands out this address for the name yet. */
export async function recordResolves(name: string, address: string) {
  try {
    return (await resolve4(name)).includes(address);
  } catch {
    return false;
  }
}
