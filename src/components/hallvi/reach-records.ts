"use client";

// Access, built from what Pi recorded.
//
// One question, asked three ways: what a visitor sees, which ports are open,
// and how a visitor gets there. The Access page reads nothing else.
//
// The one thing this file has to get right is the sign of a refusal. A port
// that refused a connection is a **pass** — the door doing its job — and a
// page that coloured every failed connection red would report a working
// firewall as a broken one. Conversely, no firewall record at all is a hole
// rather than a green tick: an unread policy is an unknown policy, and the
// page that says otherwise is the one that gets somebody breached.

import type { SavedInformation } from "@/server/operator-data";
import {
  checkAsNow,
  currentChecks,
  currentFacts,
  presenceOf,
  subjectsOfKind,
  topologyOf,
} from "@/server/record-projection";

export type Reach = "internet" | "restricted" | "private" | "closed";
/** Who said so: the provider read it back, the plan intends it, or a
 * process is what tells us. */
export type Told = "provider" | "plan" | "stack";

export interface Door {
  id: string;
  port: string;
  title: string;
  serves: string | null;
  reach: Reach;
  sources: string[];
  /** Worth a second look, in words. */
  concern: string | null;
  detail: string;
  /** Nobody has checked this one. */
  unasked?: boolean;
  /**
   * What established this door, for this door alone.
   *
   * `answered` and `refused` come from a check that opened a TCP connection
   * from outside and recorded what happened. `looked` is a check that ran and
   * did not settle it, which is neither a reading nor nobody having looked.
   * `configured` means the port and its sources are on record and nothing has
   * connected to it. The application-wide firewall read is never evidence
   * about a single port, so it is not one of these.
   */
  established?: "answered" | "refused" | "looked" | "configured" | "unasked";
  /** When that check ran. Null when nothing checked this door. */
  at?: string | null;
}

export interface Guard {
  id: string;
  title: string;
  at: string | null;
  detail?: string;
}

export interface Hole {
  id: string;
  title: string;
  detail: string;
}

export interface Caller {
  id: string;
  who: string;
  from: string;
  typed: string;
  outcome: "loads" | "refused" | "no-name" | "insecure" | "no-answer";
  /**
   * Whether the way in is encrypted: true when it is, false when a check
   * found it is not, null when nothing has checked. "Plain HTTP" is a claim,
   * and a missing or aged certificate reading does not make it.
   */
  secure: boolean | null;
  /**
   * What the checks of this address saw, in their own words ("Public HTTPS
   * returned the sign-in page"). Passing, observed checks only: the window
   * shows this as a checklist, and a plan is not something anybody saw.
   */
  saw: string[];
  headline: string;
  detail: string;
  /** Whether we watched it, only asked, or know it is not there. */
  sure: "proved" | "asked" | "absent";
  at: string | null;
}

export interface DomainState {
  name: string;
  provider: "cloudflare" | "external";
  /**
   * Five states, because a name can be wrong in four different ways and a
   * page that collapses them tells a reader to go and look somewhere else.
   *
   * `serving` is the only one that says the application answers, and it is
   * reachable only from a check that actually asked for the name over HTTP.
   * `resolving` is the honest middle: the name works and nobody has found
   * out what is behind it. A proxied name sits in `unreachable` while it
   * resolves perfectly and serves a valid certificate, which is exactly the
   * case that used to read as success.
   */
  state: "serving" | "unreachable" | "resolving" | "pending-dns" | "failed";
  detail: string;
  /** What the record points at, as the provider holds it. */
  origin?: string | null;
  /**
   * Whether the provider answers for the name instead of the origin. Null
   * when nothing recorded it: an unread field is not a direct record.
   */
  proxied?: boolean | null;
  /** Something true and awkward about the record, said rather than hidden. */
  concern?: string | null;
  /**
   * When the name last answered, on a `serves` check that passed and has
   * since aged past its horizon. Set only in that case, because it is the
   * one the other fields cannot express: the state falls back to
   * `resolving`, which reads as "nobody has found out what is behind it"
   * and is exactly wrong. Somebody did find out; it was a while ago.
   */
  lastServedAt?: string | null;
}

export interface TlsState {
  /**
   * `not-configured` means a record established there is no certificate.
   * `unknown` means nobody has looked, which is a different answer and the
   * far more common one — saying "there is no certificate" because no record
   * mentions one is the same mistake as calling an unchecked server dead.
   */
  state: "valid" | "pending" | "failed" | "not-configured" | "unknown";
  issuer?: string | null;
  expiresAt?: string | null;
  renewal?: string | null;
  detail?: string | null;
}

export interface ReachView {
  name: string;
  address: string | null;
  domain: DomainState | null;
  tls: TlsState;
  /** Who the deployment opened HTTP to. */
  audience: "public" | "controller";
  callers: Caller[];
  doors: Door[];
  ssh: {
    word: string;
    tone: "verified" | "stale" | "planned" | "failed" | "checking";
    detail: string;
    told: Told;
  };
  firewall: {
    state: "read" | "asked" | "none";
    provider: string;
    name: string | null;
    at: string | null;
    detail: string;
  };
  guards: Guard[];
  holes: Hole[];
}

/**
 * What established this one door, with the two defaults spelled out: a door
 * nothing has connected to is `unasked`, and one the deployment merely set is
 * `configured`.
 */
export function basisOf(door: Door): NonNullable<Door["established"]> {
  return door.established ?? (door.unasked ? "unasked" : "configured");
}

/** Whether a check was run on this door at all, settled or not. */
export function probed(door: Door) {
  const basis = basisOf(door);
  return basis === "answered" || basis === "refused" || basis === "looked";
}

/**
 * How exposed a port is, lowest number first, so a sort puts the most public
 * at the top of the table: a port answering the internet, one facing it that
 * nothing has tested, one open to named networks, one open to a private
 * network, one whose audience nobody stated, and the host's own loopback
 * last. Pi writes the audience in words, so the private end is read from
 * them rather than from a field.
 */
export function exposure(door: Door) {
  if (door.reach === "internet") return door.established === "answered" ? 0 : 1;
  if (door.reach === "restricted") return 2;
  const to = door.sources.join(" ").toLowerCase();
  if (/loopback|localhost|127\.0\.0\.1|host only/.test(to)) return 5;
  return to ? 3 : 4;
}

/** Most public first, then by port number, so the order is stable. */
export function byExposure(a: Door, b: Door) {
  return (
    exposure(a) - exposure(b) ||
    (Number.parseInt(a.port, 10) || 0) - (Number.parseInt(b.port, 10) || 0)
  );
}

/** The host part of an address a visitor would type. */
export const hostOf = (typed: string) =>
  typed
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase();

/**
 * The addresses worth drawing a window for: the ones that answered, one per
 * host.
 *
 * The published address and the name in front of it are usually the same
 * site, and two windows of the same page read as two ways in. The one that
 * says more wins: what it saw, then whether it is encrypted, then the newest
 * reading.
 */
export function visitorsOf(callers: Caller[]) {
  return callers
    .filter((caller) => caller.outcome === "loads")
    .sort(
      (a, b) =>
        b.saw.length - a.saw.length ||
        Number(b.secure === true) - Number(a.secure === true) ||
        (b.at ?? "").localeCompare(a.at ?? ""),
    )
    .filter(
      (caller, at, all) =>
        all.findIndex((one) => hostOf(one.typed) === hostOf(caller.typed)) ===
        at,
    );
}

/**
 * Sources, as Pi wrote them. Split on commas only: "Server loopback via SSH
 * tunnel" is one source described in words, and splitting it on spaces
 * turned it into five imaginary networks.
 */
/**
 * A tunnel's ports live in the application-access content rather than in
 * facts, because that content is what the product itself wrote. An `access`
 * subject with no port facts is still a way in with two known ends.
 */
function tunnelPort(
  access: { kind: string; localPort?: number; remotePort?: number } | undefined,
  kind: string,
) {
  if (kind !== "access" || access?.kind !== "application-access") return null;
  if (access.localPort && access.remotePort)
    return `${access.localPort} → ${access.remotePort}`;
  return null;
}

const listOf = (value: string | null) =>
  (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

/**
 * The port a way in is reached on. A door has one; an SSH tunnel has two, and
 * the one that matters to a reader is the end they type. Naming both keys
 * here rather than aliasing them keeps `access` an honest kind of its own.
 */
/**
 * Words Pi uses for "anyone on the internet". An unrecognised word is not
 * guessed at: it stays a named network.
 */
const INTERNET =
  /^(public|internet|the internet|anyone|everyone|any|anywhere|all|\*|0\.0\.0\.0(\/0)?|::(\/0)?)$/i;

/** The port a URL is reached on: the one written in it, else the scheme's. */
function urlPort(url: string | null) {
  if (!url || !URL.canParse(url)) return null;
  const parsed = new URL(url);
  const port =
    parsed.port ||
    (parsed.protocol === "https:"
      ? "443"
      : parsed.protocol === "http:"
        ? "80"
        : "");
  return port ? `${port}/tcp` : null;
}

/** A TCP port number, or null for UDP, a range or no port on record. */
function tcpPort(port: string) {
  const match = port.trim().match(/^(\d+)(?:\/(tcp|udp))?$/i);
  if (!match || match[2]?.toLowerCase() === "udp") return null;
  return match[1];
}

function portOf(fact: (key: string) => string | null) {
  const local = fact("local-port");
  const remote = fact("remote-port");
  const direct = fact("port");
  if (direct) return direct;
  if (local && remote) return `${local} → ${remote}`;
  return local ?? remote ?? null;
}

/**
 * The door a visitor actually arrives on, for the path.
 *
 * The one whose port is the port of the published address, because that is
 * the door the window above the path is showing. Falling straight to the
 * first internet-facing door on record drew "Port 80" over an https address
 * on an application that opens both, which sends the reader to the wrong
 * door. Where nothing matches, the door that answered wins, then the first
 * one on record.
 */
export function frontDoor(doors: Door[], address: string | null) {
  const facing = doors.filter((door) => door.reach === "internet");
  const wanted = urlPort(address);
  return (
    (wanted ? facing.find((door) => door.port === wanted) : undefined) ??
    facing.find((door) => door.established === "answered") ??
    facing[0] ??
    null
  );
}

/**
 * What Access offers to do about a name, which is three different offers and
 * never one.
 *
 * A name nobody has connected is an invitation. A name that is on record and
 * not yet serving the application is unfinished work, and offering to
 * "publish" it again reads as starting over. A name that serves is something
 * the owner may want to take back. Each draft is a sentence they can send as
 * it stands or finish typing; none of them invents a hostname.
 */
export function publishOffer(story: {
  name: string;
  domain: DomainState | null;
}): { label: string; primary: boolean; draft: string } {
  const domain = story.domain;
  if (!domain)
    return {
      label: "Publish at a domain…",
      // The only invitation on the page, so the only emphatic thing on it.
      primary: true,
      draft: `Publish ${story.name} at my own domain name. The hostname is: `,
    };
  if (domain.state === "serving")
    return {
      label: "Make it private again",
      primary: false,
      draft: `Make ${story.name} private again: withdraw ${domain.name} and the public access you set up for it, leave SSH and anything you did not create alone, and give me back a private way in.`,
    };
  // A name that answered, a while ago, is published. What is old is the
  // evidence, and the work to offer is looking again — never finishing a
  // job that was finished, which is what "Finish publishing it" claims.
  if (domain.lastServedAt)
    return {
      label: "Check it from outside",
      primary: false,
      draft: `${domain.name} answered when it was last checked, and that reading has aged. Ask for it from outside again and tell me what ${story.name} returns now.`,
    };
  return {
    label: "Finish publishing it",
    primary: false,
    draft: `${domain.name} is not serving ${story.name} yet. Find out which part is incomplete, finish publishing it, and check it from outside.`,
  };
}

export function reachFromRecords({
  records,
  applicationId,
  applicationName,
  now,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
}): ReachView {
  const live = records.filter((record) => !record.retiredAt);
  const map = topologyOf(live, applicationId)?.value ?? null;

  const accessRecord = live.find(
    (record) => record.presentation?.content?.kind === "application-access",
  );
  const access = accessRecord?.presentation?.content;
  const audience: ReachView["audience"] =
    access?.kind === "application-access" && access.mode === "public"
      ? "public"
      : "controller";

  /** A label only counts as something to read when it is more than a name. */
  const sentence = (said: string | undefined | null) =>
    said && /\s/.test(said.trim()) ? said : null;

  // ---- The doors, and whether each is doing its job.
  const doors: Door[] = [];
  const guards: Guard[] = [];
  const addresses = new Set<string>();
  for (const kind of ["door", "access"] as const)
    for (const ref of subjectsOfKind(live, kind)) {
      const presence = presenceOf(live, ref);
      if (presence.known && presence.presence === "absent") continue;
      const facts = currentFacts(live, ref);
      const checks = currentChecks(live, ref);
      const fact = (key: string) => facts.get(key)?.value.value ?? null;
      const sources = listOf(fact("sources"));

      // currentChecks is newest first, but keeps open/refused as separate
      // keys. Use one observation for the map, detail and timestamp when a
      // port has changed its behavior between checks.
      const observation = [...checks.entries()].find(
        ([key]) => key === "open" || key === "refused",
      );
      const refused =
        observation?.[0] === "refused" ? observation[1] : undefined;
      // A published address is configured to face the internet; that is
      // intent. It answers only when a check observed it answering, which
      // for the address itself is any reachability check of it that passed.
      const published =
        ref.kind === "access" &&
        access?.kind === "application-access" &&
        access.mode === "public";
      const open =
        observation?.[0] === "open"
          ? observation[1]
          : published
            ? [...checks.values()].find(
                (check) =>
                  check.value.claim === "reachability" &&
                  check.value.basis === "observed" &&
                  check.value.status === "passed",
              )
            : undefined;
      const shut = refused?.value.status === "passed";
      const reach: Reach = shut
        ? "closed"
        : published || sources.some((source) => INTERNET.test(source))
          ? "internet"
          : sources.length
            ? "restricted"
            : open?.value.status === "passed"
              ? "restricted"
              : "private";

      if (published) addresses.add(ref.id);
      const edge = map?.edges.find((item) => item.from === ref.id);
      const port =
        portOf(fact) ??
        tunnelPort(access, ref.kind) ??
        (published ? urlPort(accessRecord?.presentation?.url ?? null) : null);
      doors.push({
        id: ref.id,
        port: port ?? "not recorded",
        title: presence.known ? presence.record.title : ref.id,
        serves: edge
          ? (map?.parts.find((part) => part.id === edge.to)?.name ?? null)
          : null,
        reach,
        sources,
        concern:
          reach === "internet"
            ? "Anyone on the internet can reach this port."
            : null,
        detail:
          // Pi's own detail, else the label of the check that ran: saying
          // "checked, with no detail recorded" tells a reader about our
          // bookkeeping instead of about their server.
          //
          // A one-word label is that bookkeeping. A check named `open` put
          // the bare word "open" under "What that rests on", which is the
          // check's own name and not a thing anyone found out.
          (refused ?? open)?.value.detail ??
          sentence((refused ?? open)?.value.label) ??
          sentence([...checks.values()][0]?.value.label) ??
          // A check ran and wrote no sentence, so there is nothing to put
          // here. "Nobody has checked this port" would be false, and the
          // page says what the check established in its own line anyway.
          (checks.size ? "" : "Nobody has checked this port."),
        unasked: checks.size === 0 || undefined,
        // Only this door's checks establish a connection result. Its detail
        // carries the checking location; the key alone does not imply an
        // external probe (Pi can also record a check made on the host).
        established:
          checks.size === 0
            ? "unasked"
            : open?.value.status === "passed"
              ? "answered"
              : refused?.value.status === "passed"
                ? "refused"
                : "looked",
        at: (open ?? refused ?? [...checks.values()][0])?.record.establishedAt,
      });

      // A refusal that passed is a guard, not a failure.
      if (shut && refused)
        guards.push({
          id: `refused:${ref.id}`,
          title: `${port ? `Port ${port}` : ref.id} refuses connections`,
          at: refused.record.establishedAt,
          detail: refused.value.detail ?? refused.value.label,
        });
    }
  // A published address and the door it arrives through are one way in, but
  // only when they are the same endpoint: a door that faces the internet on
  // the same TCP port. A loopback-only door that also uses 443 is a
  // different endpoint and stays, as does anything without a port on record.
  // The door is kept, since its checks are about the port itself, and it
  // takes over the address's observed answer if it has none of its own.
  for (let at = doors.length - 1; at >= 0; at--) {
    const address = doors[at];
    if (!addresses.has(address.id)) continue;
    const port = tcpPort(address.port);
    if (!port) continue;
    const door = doors.find(
      (one) =>
        !addresses.has(one.id) &&
        one.reach === "internet" &&
        tcpPort(one.port) === port,
    );
    if (!door) continue;
    if (address.established === "answered" && door.established !== "answered") {
      door.established = "answered";
      door.at = address.at;
      door.unasked = undefined;
    }
    doors.splice(at, 1);
  }

  // ---- The firewall. Its absence is a hole, never a tick.
  const firewallRef = subjectsOfKind(live, "firewall")[0] ?? null;
  const firewallPresence = firewallRef ? presenceOf(live, firewallRef) : null;
  const firewallFacts = firewallRef ? currentFacts(live, firewallRef) : null;
  const configured = firewallRef
    ? currentChecks(live, firewallRef).get("configured")
    : null;
  const firewall: ReachView["firewall"] =
    firewallPresence?.known && firewallPresence.presence === "present"
      ? {
          state: "read",
          provider:
            firewallFacts?.get("provider")?.value.value ?? "the provider",
          name: firewallRef!.id,
          at: configured?.record.establishedAt ?? null,
          detail:
            firewallFacts?.get("rules")?.value.value ??
            configured?.value.detail ??
            "No rules were recorded.",
        }
      : firewallPresence?.known
        ? {
            state: "none",
            provider: "none",
            name: null,
            at: firewallPresence.record.establishedAt,
            detail:
              "A record says there is no firewall in front of this server.",
          }
        : {
            state: "asked",
            provider: "unknown",
            name: null,
            at: null,
            detail: "Nobody has read a firewall policy back for this server.",
          };

  // "Everything else", as its own door. A firewall that was read and denies
  // by default is a wall between the internet and the server, and the design
  // draws that wall from this door — without it a read, deny-by-default
  // policy showed the same headline as no policy at all.
  if (
    firewall.state === "read" &&
    /deny|drop|reject|closed/i.test(
      firewallFacts?.get("default")?.value.value ?? "",
    )
  )
    doors.push({
      id: "rest",
      port: "everything else",
      title: "Everything the rules do not name",
      serves: null,
      reach: "closed",
      sources: [],
      concern: null,
      established: "configured",
      detail:
        firewallFacts?.get("default")?.value.value ??
        "Denied unless a rule names it.",
    });

  // ---- SSH, from the host's own check.
  const host = subjectsOfKind(live, "host")[0] ?? null;
  const ssh = host ? currentChecks(live, host).get("ssh") : null;
  const sshRead = ssh ? checkAsNow(ssh.value, ssh.record, now) : null;

  // ---- The name and the certificate.
  //
  // Three checks, three different questions, and the whole point of keeping
  // them apart: `configured` is what the provider holds, `resolves` is what
  // public DNS returns, and `serves` is whether the application answers when
  // somebody asks for the name. Only the third one is about the application.
  // A proxied name resolves to the provider and serves the provider's
  // certificate while the origin behind it is dead, so inferring "it loads"
  // from a name that resolves, or from a valid certificate, reports a broken
  // site as a working one.
  const domainRef = subjectsOfKind(live, "domain")[0] ?? null;
  const domainPresence = domainRef ? presenceOf(live, domainRef) : null;
  const domainFacts = domainRef ? currentFacts(live, domainRef) : null;
  const domainChecks = domainRef ? currentChecks(live, domainRef) : null;
  const recordHeld = domainChecks?.get("configured");
  const resolves = domainChecks?.get("resolves");
  const serves = domainChecks?.get("serves");
  const servesRead = serves
    ? checkAsNow(serves.value, serves.record, now)
    : null;
  const resolvesRead = resolves
    ? checkAsNow(resolves.value, resolves.record, now)
    : null;
  /**
   * Three answers, not two. Pi writes this word itself and reaches for
   * whichever one fits the sentence — "Enabled", "Yes", "on", "Proxied" —
   * so the reader accepts the family rather than one spelling. And a value
   * nobody recorded is *unknown*, never "direct": saying a name hands out
   * its origin address is a claim, and an unread field does not support it.
   */
  const proxied = ((): boolean | null => {
    const said = domainFacts?.get("proxied")?.value.value?.trim();
    if (!said) return null;
    if (/^(true|yes|on|proxied|enabled?|orange)/i.test(said)) return true;
    if (/^(false|no|off|direct|disabled?|dns[- ]only|grey|gray)/i.test(said))
      return false;
    return null;
  })();
  const origin = domainFacts?.get("origin")?.value.value ?? null;

  /**
   * A stale `serves` deliberately falls back to "resolves, and what answers
   * was last seen a while ago" rather than keeping a green state: the reading
   * ages, and the detail line carries when it was taken.
   */
  const domainState: DomainState["state"] =
    servesRead === "verified"
      ? "serving"
      : resolvesRead === "failed"
        ? "failed"
        : servesRead === "failed"
          ? "unreachable"
          : resolvesRead === "verified" || resolvesRead === "stale"
            ? "resolving"
            : "pending-dns";

  const domainDetail = () => {
    if (domainState === "serving")
      return serves!.value.detail ?? serves!.value.label;
    if (domainState === "failed")
      return resolves!.value.detail ?? resolves!.value.label;
    if (domainState === "unreachable")
      return (
        serves!.value.detail ??
        `The name is configured${proxied ? " and proxied" : ""}, and the application did not answer through it.`
      );
    if (domainState === "resolving")
      return servesRead === "stale"
        ? `It resolved, and what answers behind it was last checked ${(serves!.record.establishedAt ?? "").slice(0, 10) || "at an unrecorded time"}.`
        : (resolves?.value.detail ??
            "It resolves. Nothing has checked what answers behind it.");
    return recordHeld?.value.status === "passed"
      ? `The provider holds the record${origin ? `, pointing at ${origin}` : ""}. Nobody has resolved the name yet.`
      : (domainFacts?.get("records")?.value.value ??
          "Nothing has checked whether it resolves.");
  };

  /**
   * The record can be in perfect order and point somewhere this application
   * is not. Nothing else on the page would ever say so, and a reader would
   * spend the afternoon on DNS.
   */
  const hostAddress = host
    ? (currentFacts(live, host).get("address")?.value.value ?? null)
    : null;
  const concern =
    origin && hostAddress && origin !== hostAddress
      ? `The record points at ${origin}. This application's server is ${hostAddress}.`
      : null;

  const certRef = subjectsOfKind(live, "certificate")[0] ?? null;
  const certPresence = certRef ? presenceOf(live, certRef) : null;
  const certFacts = certRef ? currentFacts(live, certRef) : null;
  const valid = certRef ? currentChecks(live, certRef).get("valid") : null;
  const validRead = valid ? checkAsNow(valid.value, valid.record, now) : null;

  /**
   * Whether the newest check on the name contradicts the access record.
   *
   * An access record says where the application is reached; it never says
   * that anything answers, and it is not rewritten when the application
   * falls over. For a published address that difference is the whole page:
   * a row reading "It answers on the internet" beside a name the same page
   * says does not answer is the page contradicting itself in the reader's
   * favour, which is the direction that costs them an afternoon.
   *
   * Only a failure overrides. A passing or ageing check leaves the row as
   * the record wrote it, and the name's own row carries that nuance.
   */
  const accessUrl = accessRecord?.presentation?.url ?? null;
  const accessHost =
    accessUrl && URL.canParse(accessUrl) ? new URL(accessUrl).hostname : null;
  const namesTheAccessHost =
    accessHost &&
    (domainFacts?.get("name")?.value.value ?? domainRef?.id ?? "")
      .trim()
      .toLowerCase() === accessHost.toLowerCase();
  const accessFailed =
    audience === "public" && namesTheAccessHost && servesRead === "failed";

  // ---- Who gets what, as callers. Each row is one probe that was run.
  const callers: Caller[] = [];
  if (accessUrl)
    callers.push({
      id: "access",
      who: audience === "public" ? "Anyone online" : "You, on this computer",
      from: audience === "public" ? "the internet" : "127.0.0.1",
      typed: accessUrl,
      outcome: accessFailed ? "no-answer" : "loads",
      secure: accessUrl.startsWith("https://"),
      headline: accessFailed
        ? "It does not answer on the internet"
        : audience === "public"
          ? "It answers on the internet"
          : "It answers through the tunnel",
      detail: accessFailed
        ? (serves!.value.detail ??
          "This is still the address the application is published at. Nothing came back from it when it was last asked.")
        : audience === "public"
          ? "The address is reachable without going through this computer."
          : "Only this computer reaches it, over an SSH tunnel to the host's own loopback.",
      // What the window lists. A failed address saw nothing, and a plan is
      // not something anybody saw, so neither becomes a ticked line.
      saw: accessFailed
        ? []
        : (accessRecord?.presentation?.checks ?? [])
            .filter(
              (check) => check.status === "passed" && check.basis !== "planned",
            )
            .map((check) => check.label),
      sure: "proved",
      at: accessFailed
        ? serves!.record.establishedAt
        : (accessRecord?.establishedAt ?? null),
    });
  for (const door of doors)
    if (door.reach === "closed")
      callers.push({
        id: `door:${door.id}`,
        who: "Anyone online",
        from: "the internet",
        typed: `port ${door.port}`,
        outcome: "refused",
        secure: true,
        saw: [],
        headline: "Refused, as intended",
        detail: door.detail,
        sure: "proved",
        at:
          guards.find((guard) => guard.id === `refused:${door.id}`)?.at ?? null,
      });
  // What a visitor typing the name actually gets. `loads` is reachable only
  // from the serves check: a resolving name proves the internet can find the
  // provider, and a valid certificate proves the provider has one. Neither is
  // the application. Under a proxy both are true of a site that is down.
  // A name that has been withdrawn is not a way in, whatever checks were
  // recorded while it was one. Nothing else on the page would contradict a
  // row still saying the name reaches the application, and the reader would
  // believe the row over the heading that says there is no name.
  const domainGone =
    domainPresence?.known && domainPresence.presence === "absent";
  if (domainRef && !domainGone && (resolves || serves))
    callers.push({
      id: "domain",
      who: "Anyone typing the name",
      from: "the internet",
      typed: domainFacts?.get("name")?.value.value ?? domainRef.id,
      outcome:
        domainState === "failed"
          ? "no-name"
          : domainState === "unreachable"
            ? "no-answer"
            : domainState === "serving"
              ? validRead === "verified" || !certRef
                ? "loads"
                : "insecure"
              : // A reading that has aged still says what came back. Drawing
                // the browser's "this page isn't working" over a name that
                // answered is inventing a failure nobody observed; the
                // window shows what was seen and the row is dated with when.
                servesRead === "stale"
                ? "loads"
                : "no-answer",
      // A certificate that checked out stays the reading until one fails;
      // the window dates it. No certificate reading is no claim either way.
      secure:
        validRead === "verified" || validRead === "stale"
          ? true
          : validRead === "failed"
            ? false
            : null,
      // The name's own checks are the state above, already said in the
      // headline. Nothing else was observed of it.
      saw: [],
      headline:
        domainState === "failed"
          ? "The name does not resolve"
          : domainState === "serving"
            ? "The name reaches this application"
            : domainState === "unreachable"
              ? proxied
                ? `${domainFacts?.get("registrar")?.value.value ?? "The provider"} answers; the application does not`
                : "The name resolves; the application does not answer"
              : // "Nothing has checked" is false once something has. A
                // reading that has aged is still a reading, and the reader
                // needs to know an answer came back rather than go looking
                // for a check nobody ran.
                servesRead === "stale"
                ? "The name reached this application when it was last checked"
                : "The name resolves; nothing has checked what answers",
      detail: domainDetail(),
      sure: domainState === "resolving" && !serves ? "asked" : "proved",
      at: (serves ?? resolves)!.record.establishedAt,
    });

  // ---- What is unguarded. Only what a record supports, plus what nothing
  // has looked at — which is itself a finding on this page.
  const holes: Hole[] = [];
  if (firewall.state === "asked")
    holes.push({
      id: "firewall",
      title: "No firewall policy has been read",
      detail:
        "An unread policy is an unknown policy. Nothing here can say what the provider is letting through.",
    });
  for (const door of doors)
    if (door.reach === "internet")
      holes.push({
        id: `open:${door.id}`,
        title: `${door.port === "not recorded" ? door.id : `Port ${door.port}`} is open to everyone`,
        detail: door.sources.length
          ? `Its sources are ${door.sources.join(", ")}.`
          : "No source restriction is recorded.",
      });
  for (const door of doors)
    if (door.unasked)
      holes.push({
        id: `unasked:${door.id}`,
        title: `Nobody has checked ${door.port === "not recorded" ? door.id : `port ${door.port}`}`,
        detail:
          "It is on record as a way in, and no check says whether it answers or refuses.",
      });
  if (!doors.length && firewall.state === "asked")
    holes.push({
      id: "nothing",
      title: "Nothing has been established about what can reach in",
      detail:
        "That is not the same as nothing being able to. No record names a port, a rule or a policy.",
    });

  return {
    name: applicationName,
    address: accessRecord?.presentation?.url ?? null,
    domain:
      domainRef &&
      domainPresence?.known &&
      domainPresence.presence === "present"
        ? {
            name: domainFacts?.get("name")?.value.value ?? domainRef.id,
            provider: /cloudflare/i.test(
              domainFacts?.get("registrar")?.value.value ?? "",
            )
              ? "cloudflare"
              : "external",
            state: domainState,
            detail: domainDetail(),
            // Only when it passed and then aged. A failing or absent check
            // never sets this, so nothing can read a working past out of it.
            lastServedAt:
              servesRead === "stale"
                ? (serves!.record.establishedAt ?? null)
                : null,
            origin,
            proxied,
            concern,
          }
        : null,
    tls: !certRef
      ? {
          // No certificate subject at all. That is nobody having looked, and
          // a proxied name in particular is almost always served over a
          // certificate the provider issued and nothing here has read.
          state: "unknown",
          detail: "Nothing has checked whether the name has a certificate.",
        }
      : certPresence?.known && certPresence.presence === "absent"
        ? {
            state: "not-configured",
            detail:
              valid?.value.detail ??
              "A record says there is no certificate for this name.",
          }
        : {
            state:
              validRead === "verified"
                ? "valid"
                : validRead === "failed"
                  ? "failed"
                  : validRead === "stale"
                    ? "pending"
                    : "unknown",
            issuer: certFacts?.get("issuer")?.value.value ?? null,
            expiresAt: certFacts?.get("expires")?.value.value ?? null,
            detail: valid?.value.detail ?? null,
          },
    audience,
    callers,
    doors,
    ssh: {
      word:
        sshRead === "verified"
          ? "SSH answered"
          : sshRead === "failed"
            ? "SSH did not answer"
            : sshRead === "stale"
              ? "SSH answered, a while ago"
              : "Nobody has tried SSH",
      tone:
        sshRead === "verified"
          ? "verified"
          : sshRead === "failed"
            ? "failed"
            : sshRead === "stale"
              ? "stale"
              : "planned",
      detail: ssh?.value.detail ?? "Key-only access on the host's SSH port.",
      told: ssh ? "provider" : "plan",
    },
    firewall,
    guards,
    holes,
  };
}
