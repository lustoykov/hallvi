// What a connection card is told after the owner presses "check".
//
// Each answer keeps apart the things a person would otherwise have to guess
// between: a provider that could not be reached has said nothing about the
// credential; a token that reads and cannot write is a working token of the
// wrong kind; a machine that answers with another identity is not the machine.
// Nothing is saved unless every step passed.

import { Resolver } from "node:dns/promises";

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
 * Public resolvers, asked only when the configured one says nothing at all.
 * A network whose own DNS server times out for a name it has never heard of
 * still has a parent zone to find, and a timeout must not be read as a
 * domain that does not exist.
 */
const PUBLIC_DNS = ["1.1.1.1", "8.8.8.8"];

/** One lookup, parents included, never waits longer than this. */
const LOOKUP_MS = 15_000;

/**
 * The configured resolver first, then public ones as a fallback.
 *
 * The configured one gets one short attempt: a resolver that works answers
 * in milliseconds, and one that does not should not spend the whole budget
 * retrying before the fallback is even tried. The fallback is the last word,
 * so it retries. Both are asked the same question, so a fallback that steps
 * in for a merely slow resolver still gives the same zone.
 */
function resolverChain() {
  const configured = new Resolver({ timeout: 1_500, tries: 1 });
  const fallback = new Resolver({ timeout: 2_000, tries: 2 });
  fallback.setServers(PUBLIC_DNS);
  return [configured, fallback];
}

/** DNS answered that the name holds nothing, rather than not answering. */
function answered(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "ENOTFOUND" || code === "ENODATA";
}

type NsAnswer =
  | { said: "servers"; nameservers: string[] }
  /** DNS says this name delegates nowhere. A fact about the name. */
  | { said: "none" }
  /** Nobody answered. It says nothing about the name either way. */
  | { said: "nothing" };

/**
 * Who is delegated a name, asked of each resolver in turn. A resolver that
 * answers settles it; only silence moves on to the next one, so public DNS
 * is reached for exactly the queries the configured resolver dropped.
 *
 * Once the lookup is out of time no further query is sent: cancelling only
 * reaches queries already in flight, and a resolver that was idle at the
 * deadline would otherwise start a fresh wait of its own.
 */
async function askNs(
  resolvers: Resolver[],
  zone: string,
  outOfTime: () => boolean,
): Promise<NsAnswer> {
  for (const resolver of resolvers) {
    if (outOfTime()) break;
    try {
      const nameservers = await resolver.resolveNs(zone);
      // An empty answer is still an answer: nothing is delegated here.
      return nameservers.length
        ? { said: "servers", nameservers }
        : { said: "none" };
    } catch (error) {
      if (answered(error)) return { said: "none" };
    }
  }
  return { said: "nothing" };
}

/**
 * Who answers for a name, asked of public DNS with no credential. The zone
 * is the nearest parent that has name servers, so `a.b.example.co.uk` finds
 * `example.co.uk` without a suffix list.
 *
 * Only a resolver's answer moves the walk upwards. A name nobody answered
 * for is reported as unreachable rather than handed to its parent: the name
 * may be a zone of its own whose name servers are down, and naming the
 * parent would send the owner to a zone that does not hold it.
 */
export async function whoHostsDns(name: string): Promise<DnsHost> {
  const resolvers = resolverChain();
  // Bound the whole walk, parents included. These resolvers belong to this
  // lookup, so cancelling them cannot interrupt another one. Cancelling
  // reaches only queries in flight, so the deadline is also a fact the walk
  // reads: no parent is tried, and no resolver asked, once it has passed.
  let expired = false;
  const deadline = setTimeout(() => {
    expired = true;
    for (const resolver of resolvers) resolver.cancel();
  }, LOOKUP_MS);
  const outOfTime = () => expired;
  try {
    const labels = name.split(".");
    for (let from = 0; from < labels.length - 1; from++) {
      const zone = labels.slice(from).join(".");
      // A registry's own second level (co.uk, com.au) is nobody's zone.
      if (/^(co|com|org|net|gov|ac|edu)\.[a-z]{2}$/.test(zone)) break;
      const answer = await askNs(resolvers, zone, outOfTime);
      if (answer.said === "nothing") return { kind: "unreachable" };
      // Nothing is delegated at this name: its parent may still hold it,
      // which is the ordinary case for a subdomain with no records yet.
      if (answer.said === "none") continue;
      const { nameservers } = answer;
      if (nameservers.some((host) => /\.ns\.cloudflare\.com$/i.test(host)))
        return { kind: "cloudflare", zone };
      const who =
        KNOWN_DNS.find(([pattern]) =>
          nameservers.some((host) => pattern.test(host.toLowerCase())),
        )?.[1] ?? null;
      return { kind: "other", zone, nameservers, who };
    }
    return { kind: "unregistered" };
  } finally {
    clearTimeout(deadline);
  }
}

/**
 * Whether public DNS hands out this address for the name yet. The same
 * fallback applies: a configured resolver that drops the query must not read
 * as a record the owner has not added.
 */
export async function recordResolves(name: string, address: string) {
  for (const resolver of resolverChain()) {
    try {
      return (await resolver.resolve4(name)).includes(address);
    } catch (error) {
      if (answered(error)) return false;
    }
  }
  return false;
}
