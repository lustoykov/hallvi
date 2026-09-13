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

      const refused = checks.get("refused");
      const open = checks.get("open");
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

  // ---- SSH, from the host's own check.
  const host = subjectsOfKind(live, "host")[0] ?? null;
  const ssh = host ? currentChecks(live, host).get("ssh") : null;
  const sshRead = ssh ? checkAsNow(ssh.value, ssh.record, now) : null;

  // ---- The name and the certificate.
  const domainRef = subjectsOfKind(live, "domain")[0] ?? null;
  const domainPresence = domainRef ? presenceOf(live, domainRef) : null;
  const domainFacts = domainRef ? currentFacts(live, domainRef) : null;
  const domainChecks = domainRef ? currentChecks(live, domainRef) : null;
  const resolves = domainChecks?.get("resolves");
  const serves = domainChecks?.get("serves");

  const certRef = subjectsOfKind(live, "certificate")[0] ?? null;
  const certFacts = certRef ? currentFacts(live, certRef) : null;
  const valid = certRef ? currentChecks(live, certRef).get("valid") : null;
  const validRead = valid ? checkAsNow(valid.value, valid.record, now) : null;

  // ---- Who gets what, as callers. Each row is one probe that was run.
  const callers: Caller[] = [];
  if (accessRecord?.presentation?.url)
    callers.push({
      id: "access",
      who: audience === "public" ? "Anyone online" : "You, on this computer",
      from: audience === "public" ? "the internet" : "127.0.0.1",
      typed: accessRecord.presentation.url,
      outcome: "loads",
      secure: accessRecord.presentation.url.startsWith("https://"),
      headline:
        audience === "public"
          ? "It answers on the internet"
          : "It answers through the tunnel",
      detail:
        audience === "public"
          ? "The address is reachable without going through this computer."
          : "Only this computer reaches it, over an SSH tunnel to the host's own loopback.",
      sure: "proved",
      at: accessRecord.establishedAt,
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
  if (domainRef && resolves)
    callers.push({
      id: "domain",
      who: "Anyone typing the name",
      from: "the internet",
      typed: domainFacts?.get("name")?.value.value ?? domainRef.id,
      outcome:
        resolves.value.status === "failed"
          ? "no-name"
          : validRead === "verified"
            ? "loads"
            : "insecure",
      secure: validRead === "verified",
      headline:
        resolves.value.status === "failed"
          ? "The name does not resolve"
          : serves?.value.status === "passed"
            ? "The name reaches this application"
            : "The name resolves; nothing has checked what answers",
      detail: resolves.value.detail ?? resolves.value.label,
      sure: "proved",
      at: resolves.record.establishedAt,
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
            state:
              resolves?.value.status === "failed"
                ? "failed"
                : resolves?.value.status === "passed"
                  ? "resolving"
                  : "pending-dns",
            detail:
              resolves?.value.detail ??
              domainFacts?.get("records")?.value.value ??
              "Nothing has checked whether it resolves.",
          }
        : null,
    tls: certRef
      ? {
          state:
            validRead === "verified"
              ? "valid"
              : validRead === "failed"
                ? "failed"
                : validRead === "stale"
                  ? "pending"
                  : "not-configured",
          issuer: certFacts?.get("issuer")?.value.value ?? null,
          expiresAt: certFacts?.get("expires")?.value.value ?? null,
          detail: valid?.value.detail ?? null,
        }
      : {
          state: "not-configured",
          detail: "No certificate has been recorded.",
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
