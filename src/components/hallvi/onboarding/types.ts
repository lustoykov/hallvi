// What the onboarding cards ask of the controller, and what it answers.
//
// The cards never talk to a provider themselves. They hand a value to one of
// these functions and draw the answer, so the same card runs against the
// controller in the product and against a scripted stand-in in
// /prototype/onboarding. Every answer separates what was established from
// what could not be asked: a network failure is not a bad token, and a zone
// outside a token's scope is not a zone that does not exist.

export type PermissionMode = "always-ask" | "pi-decides" | "bypass";

/** One line of a check list. `unproven` is said in words, never drawn green. */
export interface Check {
  id: string;
  label: string;
  state: "pending" | "running" | "passed" | "failed" | "unproven" | "noted";
  detail?: string;
}

export type HetznerOutcome =
  | {
      kind: "connected";
      servers: number;
      /** The write probe: Hallvi's SSH public key registered in the project. */
      wrote: boolean;
    }
  /** Nothing came back. The token was neither accepted nor rejected. */
  | { kind: "unreachable" }
  /** Hetzner answered 401: it does not know this token. */
  | { kind: "rejected" }
  /** Reads work, the write probe answered 403: a Read token. */
  | { kind: "read-only"; servers: number };

export interface MachineLine {
  user: string;
  port: number;
  fingerprint: string;
  os: string;
  arch: string;
  addresses: string[];
}

export type MachineFailure =
  | "timeout"
  | "refused"
  | "wrong-machine"
  | "key-refused"
  | "sudo-password"
  | "unsupported";

export type MachineOutcome =
  | {
      kind: "connected";
      docker: "present" | "will-install";
      memoryMb: number;
      diskGb: number;
    }
  | { kind: "failed"; at: MachineFailure };

export type DnsHost =
  | { kind: "cloudflare"; zone: string }
  | { kind: "other"; zone: string; nameservers: string[]; who: string | null }
  | { kind: "unregistered" }
  | { kind: "unreachable" };

export type CloudflareOutcome =
  | { kind: "connected"; zone: string }
  | { kind: "unreachable" }
  | { kind: "rejected" }
  /** The token is active and cannot see the zone. Says which it can see. */
  | { kind: "zone-hidden"; visible: string[] };

export interface OnboardingTransport {
  checkHetzner(token: string): Promise<HetznerOutcome>;
  checkMachine(line: MachineLine, address: string): Promise<MachineOutcome>;
  whoHostsDns(name: string): Promise<DnsHost>;
  checkCloudflare(token: string, zone: string): Promise<CloudflareOutcome>;
  /** Public DNS, asked again: does the name hand out the address yet? */
  recordResolves(name: string, address: string): Promise<boolean>;
}

/** 10.x, 172.16–31.x, 192.168.x, and the link-local and unique-local ranges. */
export function isHomeAddress(address: string) {
  return (
    /^(10\.|192\.168\.|169\.254\.)/.test(address) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
    /^(fc|fd|fe80)/i.test(address) ||
    /\.(local|lan|home)$/i.test(address)
  );
}
