"use client";

// Domains and Security, built from what Pi recorded.
//
// Both ask a version of "who can reach this", so they share a projection and
// stay two views: Domains asks what a visitor gets, Security asks what is let
// in at all.
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

import { processesFromRecords } from "./processes-records";
import { databaseFromRecords } from "./database-records";
import type {
  Caller,
  DomainState,
  Door,
  Guard,
  Hole,
  Reach,
  ReachView,
} from "./reach-prototype/reach-story";

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
function portOf(fact: (key: string) => string | null) {
  const local = fact("local-port");
  const remote = fact("remote-port");
  const direct = fact("port");
  if (direct) return direct;
  if (local && remote) return `${local} → ${remote}`;
  return local ?? remote ?? null;
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

  // ---- The doors, and whether each is doing its job.
  const doors: Door[] = [];
  const guards: Guard[] = [];
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
      const open = observation?.[0] === "open" ? observation[1] : undefined;
      const shut = refused?.value.status === "passed";
      const reach: Reach = shut
        ? "closed"
        : sources.some((source) =>
              /^(public|anywhere|0\.0\.0\.0\/0|::\/0)$/i.test(source),
            )
          ? "internet"
          : sources.length
            ? "restricted"
            : open?.value.status === "passed"
              ? "restricted"
              : "private";

      const edge = map?.edges.find((item) => item.from === ref.id);
      const port = portOf(fact) ?? tunnelPort(access, ref.kind);
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
          (refused ?? open)?.value.detail ??
          (refused ?? open)?.value.label ??
          [...checks.values()][0]?.value.label ??
          "Nobody has checked this port.",
        unasked: checks.size === 0 || undefined,
        // Per door, and only from this door's own checks. `open` and
        // `refused` are written by the port probe, which connects from
        // outside; everything else is the deployment's configuration.
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
      secure: validRead === "verified",
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
    controllerIp: null,
    callers,
    doors,
    processes: processesFromRecords({ records, applicationId, now }).processes,
    database: databaseFromRecords({ records, applicationId, now }).database,
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
    invented: null,
  };
}
