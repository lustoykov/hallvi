// PROTOTYPE · claude/architecture-directions · throwaway.
// One model for the three Architecture directions, built from the live
// record. A part carries plain words first and exact values second, and
// says how sure Server Guy is from the evidence and its age. Anything a
// scenario or the simulated re-check invents is marked `invented`.

import type {
  ApplicationFacts,
  MonitoringFacts,
  SecurityFacts,
} from "@/server/application-facts";
import { stackOf } from "@/server/application-stack";
import { nativeFacts, primaryHttp } from "@/server/release-facts";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import type { ApplicationRecord } from "@/server/types";

import type { ApplicationSection } from "../application-sections";

export type Certainty =
  "verified" | "stale" | "unknown" | "planned" | "absent" | "failed";

export type PartKind =
  | "controller"
  | "source"
  | "gate"
  | "tls"
  | "host"
  | "web"
  | "private"
  | "volume"
  | "offsite";

export interface Fact {
  label: string;
  value: string;
  mono?: boolean;
}

export interface Evidence {
  certainty: Certainty;
  /** A few words: "Checked 21 h ago", "Not set up". */
  short: string;
  /** What was observed, by what and when, and what was not. */
  detail: string;
  at: string | null;
  /** Produced by a prototype scenario or the simulated re-check. */
  invented?: boolean;
}

export interface Part {
  id: string;
  kind: PartKind;
  name: string;
  role: string;
  plain: string;
  facts: Fact[];
  evidence: Evidence;
  /** Volumes: the part that mounts them. Private services: who calls them. */
  owner?: string;
  destination?: ApplicationSection;
  /** Parts with no state of their own (the controller) hide their tag. */
  quiet?: boolean;
  /** The simulated re-check is looking at this part right now. */
  checking?: boolean;
}

export type JourneyId = "visit" | "data" | "release";
export interface Journey {
  id: JourneyId;
  label: string;
  /** Part ids in travel order. */
  stops: string[];
  summary: string;
}

export type ScenarioId = "live" | "later" | "failing" | "planned";
export type CheckMark = "checking" | "passed" | "failed";

export interface LiveRecord {
  application: ApplicationRecord;
  deployment: DeploymentRecord | null;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
}

/** One line of the agent's recorded work, oldest first. */
export interface LogLine {
  id: string;
  at: string;
  tone: "pass" | "fail" | "work" | "info";
  text: string;
  /** From a prototype scenario or the simulated re-check. */
  invented?: boolean;
}

export interface Gap {
  id: string;
  title: string;
  detail: string;
  destination: ApplicationSection;
}

export interface ArchitectureModel {
  scenario: ScenarioId;
  invented: boolean;
  now: number;
  status: "live" | "planned" | "none";
  applicationName: string;
  /** The web process's product name, "Grafana", or the application name. */
  headline: string;
  parts: Part[];
  byId: Record<string, Part>;
  journeys: Journey[];
  condition: { certainty: Certainty; text: string };
  gaps: Gap[];
  region: string | null;
  restricted: boolean;
  monitored: boolean;
  /** When a restore of an off-site copy was last tested, if ever. */
  restoreAt: string | null;
  /** The agent's most recent recorded work: deployment events and backups. */
  log: LogLine[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/**
 * Overview's rule: verified green only while the evidence is under a day old.
 */
export const FRESH_MS = DAY;

export function ago(at: string | null | undefined, now: number) {
  if (!at) return "never";
  const ms = Math.max(0, now - Date.parse(at));
  if (ms < MINUTE) return "just now";
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(ms / HOUR);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(ms / DAY)} days ago`;
}

export function localTime(at: string, withDay = false) {
  const date = new Date(at);
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return withDay
    ? `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`
    : time;
}

function evidenceFrom(
  at: string | null | undefined,
  now: number,
  verb: string,
  detail: string,
  invented?: boolean,
): Evidence {
  if (!at)
    return { certainty: "unknown", short: "Not observed", detail, at: null };
  if (now - Date.parse(at) < FRESH_MS)
    return {
      certainty: "verified",
      short: `${verb} ${ago(at, now)}`,
      detail,
      at,
      invented,
    };
  return {
    certainty: "stale",
    short: `${verb} ${ago(at, now)}`,
    detail: `${detail} Nothing newer has been observed, so it may no longer hold.`,
    at,
    invented,
  };
}

const planned = (detail: string): Evidence => ({
  certainty: "planned",
  short: "Planned",
  detail,
  at: null,
});

const PRODUCTS: [RegExp, string][] = [
  [/grafana/i, "Grafana"],
  [/prometheus/i, "Prometheus"],
  [/postgres/i, "PostgreSQL"],
  [/valkey/i, "Valkey"],
  [/redis/i, "Redis"],
  [/uptime-kuma/i, "Uptime Kuma"],
  [/vaultwarden/i, "Vaultwarden"],
  [/forgejo/i, "Forgejo"],
  [/paperless/i, "Paperless-ngx"],
  [/immich/i, "Immich"],
];

export function productName(
  image: string | null | undefined,
  fallback: string,
) {
  if (!image) return fallback;
  const repo = image.split("@")[0].split(":")[0];
  for (const [pattern, name] of PRODUCTS) if (pattern.test(repo)) return name;
  const last = repo.split("/").pop() ?? repo;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export function shortImage(image: string | null | undefined) {
  if (!image) return "built from the repository";
  const [name, digest] = image.split("@sha256:");
  return digest ? `${name}@sha256:${digest.slice(0, 12)}` : image;
}

const CITIES: Record<string, [string, string]> = {
  fsn1: ["Falkenstein", "Germany"],
  nbg1: ["Nuremberg", "Germany"],
  hel1: ["Helsinki", "Finland"],
  ash: ["Ashburn", "the United States"],
  hil: ["Hillsboro", "the United States"],
  sin: ["Singapore", "Singapore"],
};

const lowerFirst = (value: string | undefined) =>
  value ? value.charAt(0).toLowerCase() + value.slice(1) : undefined;

const list = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

function humanDuration(value: string) {
  const match = /^(\d+)([dhwmy])$/.exec(value);
  if (!match) return value;
  const unit = { d: "day", h: "hour", w: "week", m: "minute", y: "year" }[
    match[2]
  ];
  return `${match[1]} ${unit}${match[1] === "1" ? "" : "s"}`;
}

const isFact = (fact: Fact | null | undefined | false): fact is Fact =>
  Boolean(fact);

function lastEvent(
  record: DeploymentRecord | null,
  test: (message: string) => boolean,
) {
  const events = record?.events ?? [];
  for (let i = events.length - 1; i >= 0; i--)
    if (test(events[i].message)) return events[i];
  return null;
}

function latest(values: (string | null | undefined)[]) {
  const sorted = values.filter((v): v is string => Boolean(v)).sort();
  return sorted.length ? sorted[sorted.length - 1] : null;
}

/**
 * What the prototype shows about the selected native configuration: the
 * service people open, its checks, and the private services beside it.
 */
function configurationShape(deployment: DeploymentRecord | null) {
  const native = deployment?.native;
  if (!native) return null;
  const facts = nativeFacts(native);
  const primary = primaryHttp(facts);
  const app = primary?.service ?? Object.keys(native.resolved.services)[0];
  const service = (name: string) => native.resolved.services[name];
  const imageOf = (name: string) =>
    service(name)?.build ? undefined : service(name)?.image;
  const environment = service(app)?.environment ?? {};
  return {
    image: imageOf(app),
    port: primary?.target ?? null,
    healthPath: native.criterion?.healthPath ?? null,
    checks: native.criterion?.checks ?? [],
    inputs: native.inputs,
    variables: Object.keys(environment),
    httpAccess: native.httpAccess,
    /** Whether the application's settings or files name this address. */
    mentions: (text: string) =>
      Object.values(environment).some((value) => value?.includes(text)) ||
      native.files.some((file) => atob(file.content).includes(text)),
    services: facts.services
      .filter(
        (item) => item.name !== app && item.name !== native.database?.service,
      )
      .map((item) => {
        const check = native.criterion?.services.find(
          (candidate) => candidate.name === item.name,
        );
        return {
          name: item.name,
          image: imageOf(item.name),
          port: check?.port ?? null,
          healthPath: check?.healthPath ?? null,
          checks: check?.checks ?? [],
          command: service(item.name)?.command ?? null,
          mounts: (service(item.name)?.volumes ?? [])
            .filter((mount) => mount.type === "bind")
            .map((mount) => mount.target),
        };
      }),
  };
}

/** The failing scenario's monitoring. Invented, and labelled as such. */
function inventedMonitoring(
  deployment: DeploymentRecord | null,
  headline: string,
  now: number,
): MonitoringFacts {
  const at = new Date(now - 4 * MINUTE).toISOString();
  const shape = configurationShape(deployment);
  const service = shape?.services[0]?.name ?? "worker";
  const serviceName = productName(shape?.services[0]?.image, service);
  return {
    collector: {
      state: "running",
      lastObservationAt: at,
      hostReachable: true,
      detail: "A host collector reached the server (invented)",
    },
    checks: [
      {
        id: "web",
        name: `${headline} responds`,
        kind: "http",
        target: shape?.healthPath ?? "/",
        state: "passing",
        lastAt: at,
        detail: "200 in 41 ms",
      },
      {
        id: "service",
        name: `${serviceName} readiness`,
        kind: "process",
        target: service,
        state: "failing",
        lastAt: at,
        detail: "/-/ready timed out after 5 s, three times in a row",
      },
    ],
    resources: null,
    issues: [],
    providers: [],
  };
}

export function buildModel({
  record,
  now: clockNow,
  scenario,
  security: observedSecurity,
  marks = {},
}: {
  record: LiveRecord;
  now: number;
  scenario: ScenarioId;
  security?: SecurityFacts | null;
  marks?: Record<string, CheckMark>;
}): ArchitectureModel {
  const invented = scenario !== "live";
  const now = scenario === "later" ? clockNow + 3 * DAY : clockNow;
  const isPlanned = scenario === "planned";
  const deployment = record.deployment;
  const plan = configurationShape(deployment);
  const application = record.application;
  const repo = `${application.repositoryOwner}/${application.repositoryName}`;
  const headline = productName(plan?.image, application.name);
  const facts: ApplicationFacts = isPlanned
    ? {}
    : scenario === "failing"
      ? {
          ...record.facts,
          monitoring: inventedMonitoring(deployment, headline, clockNow),
        }
      : record.facts;
  const security = isPlanned
    ? null
    : (observedSecurity ?? facts.security ?? null);
  const live = !isPlanned && deployment?.status === "live";
  const status: ArchitectureModel["status"] = live
    ? "live"
    : deployment
      ? "planned"
      : "none";
  const stack = stackOf(
    deployment && isPlanned
      ? { ...deployment, status: "awaiting-approval" }
      : deployment,
  );
  const restricted = plan?.httpAccess === "controller";
  const ip = deployment?.httpSourceIp ?? null;
  const offer = deployment?.offer ?? null;
  const place = offer ? CITIES[offer.location] : undefined;
  const region = offer
    ? place
      ? `${place[0]}, ${place[1]}`
      : offer.location
    : null;
  const monitoring = facts.monitoring;
  const monitorCheck = (kind: string, target?: string) =>
    monitoring?.checks.find(
      (item) =>
        item.kind === kind && (target === undefined || item.target === target),
    );
  const flagged = scenario === "failing";
  const parts: Part[] = [];

  // ---- The controller: where you are, and the only network let in.
  parts.push({
    id: "controller",
    kind: "controller",
    name: "Server Guy",
    role: "Your controller, on your network",
    quiet: true,
    plain: restricted
      ? `Server Guy runs on your network${ip ? ` (${ip})` : ""}. That network is the only place ${headline} can be opened from.`
      : "Server Guy runs here and looks after the server over SSH.",
    facts: ip ? [{ label: "Network address", value: ip, mono: true }] : [],
    evidence: {
      certainty: "verified",
      short: "You are here",
      detail: "The controller you are using right now.",
      at: null,
    },
  });

  // ---- The source: which revision, which images.
  const revision = deployment?.revision ?? null;
  const images = [
    plan?.image,
    ...(plan?.services ?? []).map((s) => s.image),
  ].filter((image): image is string => Boolean(image));
  const imageBased = Boolean(plan?.image);
  const imageNames = images.map((image) => productName(image, image));
  parts.push({
    id: "source",
    kind: "source",
    name: repo,
    role: imageBased
      ? "Where its setup comes from"
      : "Where its code comes from",
    plain: revision
      ? imageBased
        ? `The running setup comes from revision ${revision.slice(0, 7)} of ${repo}. The software itself is the official ${list(imageNames)} image${imageNames.length > 1 ? "s" : ""}, pinned so it can't change underneath you.`
        : `${headline} is built from revision ${revision.slice(0, 7)} of ${repo}.`
      : `A revision of ${repo} will be chosen when Server Guy deploys.`,
    facts: [
      { label: "Repository", value: repo },
      revision ? { label: "Revision", value: revision, mono: true } : null,
      ...images.map((image) => ({
        label: `${productName(image, image)} image`,
        value: shortImage(image),
        mono: true,
      })),
      deployment?.bundleHashes
        ? {
            label: "Configuration",
            value: `${Object.keys(deployment.bundleHashes).length} files, each hashed`,
          }
        : null,
    ].filter(isFact),
    evidence: !live
      ? planned(
          `Revision ${revision?.slice(0, 7) ?? "to be chosen"} is selected for the deployment.`,
        )
      : evidenceFrom(
          deployment?.verifiedAt,
          now,
          "Matched",
          "The deployment confirmed the running images and configuration are exactly the accepted ones.",
        ),
    destination: "deployment",
  });

  // ---- The ways in: port 80 for visits, port 22 for Server Guy.
  const rule80 = security?.rules.find(
    (rule) => rule.port === "80" || rule.port.split("-")[0] === "80",
  );
  const restrictEvent = lastEvent(deployment, (m) =>
    m.startsWith("HTTP restricted"),
  );
  const secured = facts.domains?.tls?.state === "valid";
  parts.push({
    id: "gate:http",
    kind: "gate",
    name: "Port 80",
    role: restricted
      ? "The only way in, for your network"
      : "The way in, open to everyone",
    plain: restricted
      ? `Visits reach ${headline} through port 80, and the host firewall lets them in only from Server Guy's network. Everyone else is turned away.`
      : `Anyone on the internet can reach ${headline} on port 80.`,
    facts: [
      {
        label: "Protocol",
        value: secured ? "HTTPS" : "HTTP, not encrypted",
      },
      {
        label: "Allowed from",
        value: rule80
          ? rule80.sources.join(", ")
          : restricted && ip
            ? `${ip} only`
            : "any network",
        mono: Boolean(rule80 || (restricted && ip)),
      },
      {
        label: "Forwards to",
        value: `${headline}, port ${plan?.port ?? "not recorded"}`,
      },
    ],
    evidence: !live
      ? planned(
          restricted
            ? "HTTP will be limited to Server Guy's network."
            : "Port 80 will be opened to everyone.",
        )
      : rule80 && security
        ? evidenceFrom(
            security.firewall.lastCheckedAt ?? null,
            now,
            "Read",
            `Hetzner reports port ${rule80.port}/${rule80.protocol} open to ${rule80.sources.join(", ")}.`,
          )
        : {
            certainty: "unknown",
            short: "Set at deploy · not re-read",
            detail: `The deployment limited HTTP to ${ip ?? "Server Guy's network"}${restrictEvent ? ` at ${localTime(restrictEvent.at, true)}` : ""}, and its checks passed through that rule. Nothing has read the firewall back since; Security reads it from Hetzner.`,
            at: restrictEvent?.at ?? null,
          },
    destination: "security",
  });
  const rule22 = security?.rules.find((rule) => rule.port === "22");
  parts.push({
    id: "gate:ssh",
    kind: "gate",
    name: "Port 22",
    role: "How Server Guy looks after the server",
    plain:
      "Server Guy delivers configuration, restarts services and reads logs over SSH, with its own key.",
    facts: [
      { label: "Used by", value: "Server Guy" },
      {
        label: "Allowed from",
        value: rule22 ? rule22.sources.join(", ") : "read in Security",
        mono: Boolean(rule22),
      },
      security?.ssh ? { label: "Access", value: security.ssh.detail } : null,
    ].filter(isFact),
    evidence: !live
      ? planned("SSH will be opened for Server Guy's key.")
      : rule22 && security
        ? evidenceFrom(
            security.firewall.lastCheckedAt ?? null,
            now,
            "Read",
            `Hetzner reports port 22 open to ${rule22.sources.join(", ")}.`,
          )
        : {
            certainty: "unknown",
            short: "Who can reach it: not read",
            detail:
              "The deployment opened SSH for Server Guy when it created the firewall. Which networks may connect is recorded by Hetzner and read in Security.",
            at: null,
          },
    destination: "security",
  });

  // ---- HTTPS and a name: absent until a domain records them.
  const domain = facts.domains?.domain ?? null;
  parts.push({
    id: "tls",
    kind: "tls",
    name: secured && domain ? domain.name : "HTTPS",
    role: secured ? "Encrypted address" : "Not set up",
    plain: secured
      ? `${headline} answers at ${domain?.name} with a valid certificate.`
      : `There's no domain or HTTPS yet. ${headline} speaks plain HTTP${deployment?.address ? ` at ${deployment.address}` : ""}${restricted ? ", one reason it stays inside your network" : ""}.`,
    facts: secured
      ? [
          { label: "Domain", value: domain?.name ?? "" },
          {
            label: "Certificate",
            value: facts.domains?.tls.issuer ?? "valid",
          },
        ]
      : [
          { label: "Domain", value: "none recorded" },
          { label: "Certificate", value: "none" },
        ],
    evidence: secured
      ? evidenceFrom(
          facts.domains?.tls.expiresAt ? now.toString() : null,
          now,
          "Valid",
          facts.domains?.tls.detail ?? "Certificate recorded.",
        )
      : {
          certainty: "absent",
          short: "Not set up",
          detail:
            "No domain, certificate or HTTPS configuration is recorded for this application.",
          at: null,
        },
    destination: "domains",
  });

  // ---- The host.
  const observation = facts.protection?.observation;
  const collector = monitoring?.collector;
  let hostEvidence: Evidence;
  if (!live)
    hostEvidence = planned(
      offer
        ? `Server Guy will create a ${offer.serverType.toUpperCase()} for about €${offer.monthly.toFixed(2)} a month once you approve.`
        : "A server will be chosen when you deploy.",
    );
  else if (collector?.lastObservationAt)
    hostEvidence =
      collector.hostReachable === false
        ? {
            certainty: "failed",
            short: "Unreachable",
            detail: collector.detail,
            at: collector.lastObservationAt,
            invented: flagged,
          }
        : evidenceFrom(
            collector.lastObservationAt,
            now,
            "Reached",
            `${collector.detail}.`,
            flagged,
          );
  else if (observation?.at)
    hostEvidence = observation.reachable
      ? evidenceFrom(
          observation.at,
          now,
          "Reached",
          "Server Guy reached the host when it read the backup timer.",
        )
      : {
          certainty: "failed",
          short: "Unreachable",
          detail: `Server Guy couldn't reach the host at ${localTime(observation.at, true)}.`,
          at: observation.at,
        };
  else
    hostEvidence = evidenceFrom(
      deployment?.verifiedAt,
      now,
      "Reached",
      "The host answered during the deployment.",
    );
  parts.push({
    id: "host",
    kind: "host",
    name: offer ? `Hetzner ${offer.serverType.toUpperCase()}` : "Server",
    role: "The one server everything runs on",
    plain: offer
      ? `Everything runs in Docker on one ${offer.serverType.toUpperCase()} server in ${place?.[0] ?? offer.location}: ${offer.cores} vCPU and ${offer.memory} GB of memory, about €${offer.monthly.toFixed(2)} a month.`
      : "No server has been chosen yet.",
    facts: [
      { label: "Provider", value: "Hetzner Cloud" },
      deployment?.serverId
        ? { label: "Server", value: `#${deployment.serverId}`, mono: true }
        : null,
      deployment?.address
        ? { label: "Address", value: deployment.address, mono: true }
        : null,
      offer
        ? { label: "Location", value: `${region} (${offer.location})` }
        : null,
      offer
        ? { label: "Size", value: `${offer.cores} vCPU · ${offer.memory} GB` }
        : null,
      offer
        ? { label: "Price", value: `€${offer.monthly.toFixed(2)} a month` }
        : null,
    ].filter(isFact),
    evidence: hostEvidence,
    destination: "storage",
  });

  // ---- The application people open.
  const checkNames = plan?.checks.map((item) => item.name) ?? [];
  const appAt = live
    ? (latest(
        checkNames.map(
          (name) => lastEvent(deployment, (m) => m === `Passed: ${name}`)?.at,
        ),
      ) ??
      deployment?.verifiedAt ??
      null)
    : null;
  const http = monitorCheck("http");
  const secretCount = plan?.inputs.length ?? 0;
  parts.push({
    id: "app",
    kind: "web",
    name: headline,
    role: "Your application",
    plain: `${headline} is the part people open. It listens on port ${plan?.port ?? "?"} inside the server${restricted ? ", behind the gate only your network passes" : ""}.`,
    facts: [
      { label: "Image", value: shortImage(plan?.image), mono: true },
      plan
        ? { label: "Listens on", value: String(plan.port), mono: true }
        : null,
      plan
        ? { label: "Health", value: `GET ${plan.healthPath}`, mono: true }
        : null,
      checkNames.length ? { label: "Checks", value: list(checkNames) } : null,
      plan
        ? {
            label: "Settings",
            value: `${plan.variables.length} recorded${secretCount ? `, ${secretCount} secret kept private` : ""}`,
          }
        : null,
    ].filter(isFact),
    evidence: !live
      ? planned(
          `${headline} will be checked with ${list(checkNames) || "its health path"} after it starts.`,
        )
      : http
        ? http.state === "failing"
          ? {
              certainty: "failed",
              short: "Not answering",
              detail: `${http.name}: ${http.detail}.`,
              at: http.lastAt ?? null,
              invented: flagged,
            }
          : evidenceFrom(
              http.lastAt,
              now,
              "Checked",
              `${http.name}: ${http.detail}.`,
              flagged,
            )
        : evidenceFrom(
            appAt,
            now,
            "Checked",
            `${list(checkNames)} passed from Server Guy's network${appAt ? ` at ${localTime(appAt, true)}` : ""}. Nothing checks it between deployments and requests.`,
          ),
    destination: "processes",
  });

  // ---- Private services beside it.
  for (const service of plan?.services ?? []) {
    const name = productName(service.image, service.name);
    const address = service.port ? `${service.name}:${service.port}` : null;
    const called = Boolean(address && plan?.mentions(address));
    const paths = [
      service.healthPath,
      ...(service.checks ?? []).map((item) => item.path),
    ].filter((path): path is string => Boolean(path));
    const at = live
      ? latest(
          paths.map(
            (path) =>
              lastEvent(
                deployment,
                (m) => m === `Verified private ${service.name}: ${path}`,
              )?.at,
          ),
        )
      : null;
    const retention = service.command
      ?.find((arg) => arg.startsWith("--storage.tsdb.retention.time="))
      ?.split("=")[1];
    const processCheck = monitorCheck("process", service.name);
    parts.push({
      id: `svc:${service.name}`,
      kind: "private",
      name,
      role: "Private: no way in from outside",
      owner: called ? "app" : undefined,
      plain: `${name} runs beside ${headline} and publishes no port. ${called ? `${headline} reaches it as ${address} on the private network.` : "Only the other services on this server can reach it."}`,
      facts: [
        { label: "Image", value: shortImage(service.image), mono: true },
        address
          ? { label: "Inside the server", value: address, mono: true }
          : null,
        service.healthPath
          ? {
              label: "Readiness",
              value: `GET ${service.healthPath}`,
              mono: true,
            }
          : null,
        retention
          ? { label: "Keeps samples for", value: humanDuration(retention) }
          : null,
        ...service.mounts.map((target) => ({
          label: "Read-only file",
          value: target,
          mono: true,
        })),
      ].filter(isFact),
      evidence: !live
        ? planned(`${name} will be checked privately after it starts.`)
        : processCheck
          ? processCheck.state === "failing"
            ? {
                certainty: "failed",
                short: "Not answering",
                detail: `${processCheck.name}: ${processCheck.detail}.`,
                at: processCheck.lastAt ?? null,
                invented: flagged,
              }
            : evidenceFrom(
                processCheck.lastAt,
                now,
                "Checked",
                `${processCheck.name}: ${processCheck.detail}.`,
                flagged,
              )
          : evidenceFrom(
              at,
              now,
              "Checked",
              `${list(paths.map((path) => `GET ${path}`))} answered inside the server${at ? ` at ${localTime(at, true)}` : ""}.`,
            ),
      destination: "processes",
    });
  }

  // ---- State that must survive a container replacement.
  const coverage = facts.protection?.coverage ?? [];
  for (const volume of stack.volumes) {
    const owner = volume.usedBy === "app" ? "app" : `svc:${volume.usedBy}`;
    const service = plan?.services?.find((s) => s.name === volume.usedBy);
    const ownerName =
      volume.usedBy === "app"
        ? headline
        : productName(service?.image, volume.usedBy);
    const sqlite = stack.databases.find(
      (database) =>
        database.kind === "sqlite" && database.name === volume.usedBy,
    )?.location;
    const key =
      sqlite || volume.usedBy === "postgres"
        ? `database:${volume.usedBy}`
        : `volume:${volume.name}`;
    const covered = coverage.find((item) => item.key === key);
    const retention = service?.command
      ?.find((arg) => arg.startsWith("--storage.tsdb.retention.time="))
      ?.split("=")[1];
    const name = sqlite
      ? (sqlite.split("/").pop() ?? sqlite)
      : volume.name.charAt(0).toUpperCase() + volume.name.slice(1);
    let evidence: Evidence;
    if (!live)
      evidence = planned(
        "Created with the deployment. It survives container replacement.",
      );
    else if (covered?.state === "failed")
      evidence = {
        certainty: "failed",
        short: "Last copy failed",
        detail: covered.note ?? "The last off-site copy failed.",
        at: covered.lastSuccessfulAt ?? null,
      };
    else if (covered?.lastSuccessfulAt)
      evidence = evidenceFrom(
        covered.lastSuccessfulAt,
        now,
        "Copied",
        covered.note ?? "The off-site copy was verified.",
      );
    else
      evidence = {
        certainty: "absent",
        short: "No off-site copy",
        detail:
          "It lives only on the server's disk. Nothing copies it anywhere else yet.",
        at: null,
      };
    parts.push({
      id: `vol:${volume.name}`,
      kind: "volume",
      name,
      role: sqlite
        ? `${ownerName}'s database (SQLite)`
        : volume.kind === "database"
          ? `${ownerName}'s database`
          : `${ownerName}'s files`,
      owner,
      plain: sqlite
        ? `${ownerName} keeps its data in ${name} on the ${volume.name} volume, which survives when containers are replaced.`
        : `${ownerName} keeps its files on the ${volume.name} volume${retention ? `, about ${humanDuration(retention)} of them` : ""}.`,
      facts: [
        { label: "Volume", value: volume.name, mono: true },
        { label: "Mounted at", value: volume.mount, mono: true },
        sqlite ? { label: "Database file", value: sqlite, mono: true } : null,
        covered?.lastSuccessfulAt
          ? {
              label: "Off-site copy",
              value: `${localTime(covered.lastSuccessfulAt, true)}${covered.size ? ` · ${covered.size}` : ""}`,
            }
          : null,
        covered ? { label: "Copied as", value: covered.method } : null,
      ].filter(isFact),
      evidence,
      destination:
        sqlite || volume.kind === "database" ? "database" : "storage",
    });
  }

  // ---- Off the server.
  const protection = facts.protection;
  if (protection?.destination) {
    const destination = protection.destination;
    const provider =
      destination.provider === "r2" ? "Cloudflare R2" : "Amazon S3";
    const last = protection.lastAttempt;
    const restore = protection.restoreTest;
    let evidence: Evidence;
    if (last?.outcome === "failed")
      evidence = {
        certainty: "failed",
        short: "Last copy failed",
        detail: last.reason ?? "The last scheduled copy failed.",
        at: last.at,
      };
    else
      evidence = evidenceFrom(
        last?.at,
        now,
        "Copied",
        "The last scheduled copy was uploaded, downloaded again and matched by size and SHA-256.",
      );
    parts.push({
      id: "offsite",
      kind: "offsite",
      name: provider,
      role: "Copies kept off the server",
      plain: `${protection.policy ? `${protection.policy.schedule} (${protection.policy.timezone})` : "On request"}, a copy of ${list(
        parts.filter((p) => p.kind === "volume").map((p) => p.name),
      )} leaves the server for ${provider}${restore ? `, and a restore was tested ${ago(restore.at, now)}` : ""}.`,
      facts: [
        {
          label: "Bucket",
          value: `${destination.provider}://${destination.bucket}`,
          mono: true,
        },
        protection.policy
          ? {
              label: "Schedule",
              value: `${protection.policy.schedule}, ${protection.policy.timezone}`,
            }
          : null,
        protection.policy
          ? { label: "Keeps", value: protection.policy.retention }
          : null,
        last
          ? {
              label: "Last copy",
              value: `${localTime(last.at, true)} · ${last.outcome}${last.size ? ` · ${last.size}` : ""}`,
            }
          : null,
        protection.observation?.nextAt
          ? {
              label: "Next copy",
              value: localTime(protection.observation.nextAt, true),
            }
          : null,
        restore
          ? {
              label: "Restore test",
              value: `${localTime(restore.at, true)} · ${restore.verified}`,
            }
          : null,
      ].filter(isFact),
      evidence,
      destination: "backups",
    });
  } else
    parts.push({
      id: "offsite",
      kind: "offsite",
      name: "Off-site copies",
      role: "Not set up",
      plain: `Nothing copies ${headline}'s data off the server yet. If the server were lost, so would the data be.`,
      facts: [],
      evidence: {
        certainty: isPlanned ? "planned" : "absent",
        short: isPlanned ? "After deployment" : "Not set up",
        detail: "No backup destination is recorded for this application.",
        at: null,
      },
      destination: "backups",
    });

  // ---- The simulated re-check, on top of the record.
  for (const part of parts) {
    const mark = marks[part.id];
    if (mark === "checking") part.checking = true;
    else if (mark === "passed")
      part.evidence = {
        certainty: "verified",
        short: "Checked just now",
        detail:
          "Simulated re-check in this prototype. Nothing was contacted and nothing was recorded.",
        at: new Date(now).toISOString(),
        invented: true,
      };
    else if (mark === "failed")
      part.evidence = {
        certainty: "failed",
        short: "Failed again just now",
        detail: `Simulated re-check. ${part.evidence.detail}`,
        at: new Date(now).toISOString(),
        invented: true,
      };
  }

  const byId = Object.fromEntries(parts.map((part) => [part.id, part]));
  const services = parts.filter((part) => part.kind === "private");
  const volumes = parts.filter((part) => part.kind === "volume");
  const journeys: Journey[] = [
    {
      id: "visit",
      label: "A visit",
      stops: [
        "controller",
        "gate:http",
        "app",
        ...services.filter((s) => s.owner === "app").map((s) => s.id),
      ],
      summary: restricted
        ? `A visit from your network passes the firewall on port 80, reaches ${headline}, which asks ${list(services.map((s) => s.name)) || "nothing else"} over the private network.`
        : `A visit from anywhere passes port 80 and reaches ${headline}.`,
    },
    {
      id: "data",
      label: "Your data",
      stops: [...volumes.map((v) => v.id), "offsite"],
      summary: protection?.destination
        ? `${protection.policy ? `${protection.policy.schedule} (${protection.policy.timezone})` : "On request"}, ${list(volumes.map((v) => v.name))} are copied to ${byId.offsite.name} and checked by checksum.`
        : "Nothing copies the data off the server yet.",
    },
    {
      id: "release",
      label: "A release",
      stops: [
        "source",
        "controller",
        "gate:ssh",
        "host",
        "app",
        ...services.map((s) => s.id),
      ],
      summary: revision
        ? `Server Guy delivered revision ${revision.slice(0, 7)} over SSH, and the server started ${list(imageNames) || headline} from pinned images.`
        : "Server Guy will deliver the chosen revision over SSH.",
    },
  ];

  const app = byId.app;
  const failed = parts.find((part) => part.evidence.certainty === "failed");
  const offsite = byId.offsite;
  const condition: ArchitectureModel["condition"] =
    status !== "live"
      ? {
          certainty: "planned",
          text:
            status === "none"
              ? "Nothing is deployed yet. The map fills in as Server Guy deploys it."
              : "Nothing runs yet. This is what Server Guy will build once you approve the plan.",
        }
      : failed
        ? {
            certainty: "failed",
            text: `${failed.name} isn't answering. ${failed.evidence.detail}`,
          }
        : app.evidence.certainty === "stale"
          ? {
              certainty: "stale",
              text:
                byId.host?.evidence.certainty === "verified"
                  ? `The server answered ${ago(byId.host.evidence.at, now)}, but ${headline} itself was last checked ${ago(app.evidence.at, now)}. It may have changed since.`
                  : `${headline} was last checked ${ago(app.evidence.at, now)}. Nothing has checked it since, so it may have changed.`,
            }
          : {
              certainty: app.evidence.certainty,
              text: `${headline} passed its checks ${ago(app.evidence.at, now)}. ${restricted ? "Only your network can open it" : "It's open to the internet"}, and ${offsite.evidence.certainty === "absent" ? "nothing copies its data off the server yet" : "its data is copied off the server every night"}.`,
            };

  const gaps: Gap[] = [];
  if (!secured && status === "live")
    gaps.push({
      id: "tls",
      title: "No domain or HTTPS",
      detail: `${headline} is plain HTTP at ${deployment?.address ?? "its address"}. A domain with HTTPS would let you open it from anywhere without an SSH tunnel.`,
      destination: "domains",
    });
  if (!monitoring && status === "live")
    gaps.push({
      id: "monitoring",
      title: "Nothing watches it between checks",
      detail:
        "Checks run when Server Guy deploys or when you ask. A failure in between wouldn't show here until the next check.",
      destination: "monitoring",
    });

  // ---- The agent's recorded work, as a log.
  const log: LogLine[] = [];
  if (live && deployment) {
    deployment.events.forEach((event, i) => {
      const message = event.message;
      const tone: LogLine["tone"] = /timed out|failed|Stopped/i.test(message)
        ? "fail"
        : /^Passed:|^Verified|verified|reverified/.test(message)
          ? "pass"
          : /^(Recreating|Building|Checking|Creating|Uploading|Waiting|Preparing|Inspecting|Reading|Reconciled)/.test(
                message,
              )
            ? "work"
            : "info";
      log.push({ id: `event:${i}`, at: event.at, tone, text: message });
    });
    for (const entry of facts.protection?.history ?? [])
      log.push({
        id: `protection:${entry.id}`,
        at: entry.at,
        tone: entry.outcome === "succeeded" ? "pass" : "fail",
        text:
          entry.kind === "backup"
            ? `Nightly copy: ${entry.detail}`
            : entry.kind === "restore-test"
              ? `Restore test: ${entry.detail}`
              : entry.detail,
      });
  }
  if (scenario === "failing") {
    const service = plan?.services?.[0];
    const name = productName(service?.image, service?.name ?? "worker");
    log.push(
      {
        id: "invented:collector",
        at: new Date(clockNow - 4 * MINUTE - 20_000).toISOString(),
        tone: "info",
        text: "Collector reached the host",
        invented: true,
      },
      {
        id: "invented:failure",
        at: new Date(clockNow - 4 * MINUTE).toISOString(),
        tone: "fail",
        text: `${name} readiness: /-/ready timed out after 5 s, three times in a row`,
        invented: true,
      },
    );
  }
  log.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return {
    scenario,
    invented,
    now,
    status,
    applicationName: application.name,
    headline,
    parts,
    byId,
    journeys,
    condition,
    gaps,
    region,
    restricted,
    monitored: Boolean(monitoring),
    restoreAt: facts.protection?.restoreTest?.at ?? null,
    log: log.slice(-10),
  };
}

// ---- Words, at three depths, for the sentence-first direction.

export type Segment = string | { ref?: string; text: string; mono?: boolean };
export interface Sentence {
  id: string;
  segments: Segment[];
}
export type Depth = 0 | 1 | 2;

export function explain(model: ArchitectureModel, depth: Depth): Sentence[] {
  const p = model.byId;
  const h = model.headline;
  const planned = model.status !== "live";
  const services = model.parts.filter((part) => part.kind === "private");
  const volumes = model.parts.filter((part) => part.kind === "volume");
  const appVolume = volumes.find((v) => v.owner === "app");
  const service = services[0];
  const serviceVolume = service
    ? volumes.find((v) => v.owner === service.id)
    : undefined;
  const fact = (id: string, label: string) =>
    p[id]?.facts.find((item) => item.label === label)?.value;
  const at = (id: string) => p[id]?.evidence.at ?? null;
  const when = (id: string) => ago(at(id), model.now);
  const country = model.region?.split(", ")[1] ?? "one region";
  const offsiteReal =
    p.offsite.evidence.certainty !== "absent" &&
    p.offsite.evidence.certainty !== "planned";
  const restoreFact = fact("offsite", "Restore test");
  const out: Sentence[] = [];
  const say = (
    id: string,
    ...segments: (Segment | false | null | undefined | "")[]
  ) =>
    out.push({
      id,
      segments: segments.filter((s): s is Segment => Boolean(s)),
    });
  const tlsAbsent = p.tls.evidence.certainty === "absent";

  if (depth === 0) {
    say(
      "where",
      { ref: "app", text: h },
      planned ? " will run on " : " runs on ",
      { ref: "host", text: `one server in ${country}` },
      planned ? " once you approve the plan." : ".",
    );
    say(
      "reach",
      model.restricted ? "Only " : "",
      model.restricted
        ? { ref: "gate:http", text: "your network" }
        : { ref: "gate:http", text: "Anyone on the internet" },
      " can open it",
      tlsAbsent && ", and ",
      tlsAbsent && { ref: "tls", text: "there's no HTTPS yet" },
      ".",
    );
    say(
      "data",
      "It keeps its data in ",
      appVolume
        ? { ref: appVolume.id, text: "a database file" }
        : "its container",
      service && " and asks ",
      service && { ref: service.id, text: `a private ${service.name}` },
      service?.name === "Prometheus" && " for its metrics",
      ".",
    );
    say(
      "safety",
      offsiteReal
        ? { ref: "offsite", text: "Every night, a copy leaves the server" }
        : { ref: "offsite", text: "Nothing copies it off the server yet" },
      offsiteReal &&
        model.restoreAt &&
        `, and a restore was tested ${ago(model.restoreAt, model.now)}`,
      ".",
    );
    say(
      "sure",
      planned
        ? "Nothing has been checked yet, because nothing runs."
        : "Server Guy ",
      !planned && { ref: "app", text: `last checked it ${when("app")}` },
      !planned && !model.monitored && " and doesn't watch it between checks",
      !planned && ".",
    );
    return out;
  }

  if (depth === 1) {
    say(
      "where",
      { ref: "app", text: h },
      planned ? " will run in Docker on a " : " runs in Docker on a ",
      {
        ref: "host",
        text: `${p.host.name} in ${model.region?.split(", ")[0] ?? "its region"}`,
      },
      fact("host", "Size") &&
        ` (${fact("host", "Size")}, ${fact("host", "Price")}).`,
    );
    say(
      "reach",
      "The host firewall opens ",
      {
        ref: "gate:http",
        text: model.restricted
          ? `port 80 to ${fact("controller", "Network address") ?? "your network"} only`
          : "port 80 to everyone",
      },
      model.restricted && ", Server Guy's network, and ",
      !model.restricted && " and ",
      { ref: "gate:ssh", text: "port 22 for SSH" },
      tlsAbsent ? "; " : ".",
      tlsAbsent && { ref: "tls", text: "there's no domain or HTTPS" },
      tlsAbsent && ".",
    );
    say(
      "data",
      `${h} keeps its database in `,
      appVolume
        ? {
            ref: appVolume.id,
            text: `${appVolume.role.includes("SQLite") ? "SQLite" : "a database"} on the ${fact(appVolume.id, "Volume")} volume`,
          }
        : "its container",
      service && " and queries ",
      service && {
        ref: service.id,
        text: `${service.name} at ${fact(service.id, "Inside the server") ?? "its private address"}`,
      },
      service && ", which publishes no port",
      serviceVolume && "; its samples stay on ",
      serviceVolume && {
        ref: serviceVolume.id,
        text: `the ${fact(serviceVolume.id, "Volume")} volume for ${fact(service!.id, "Keeps samples for") ?? "a while"}`,
      },
      ".",
    );
    say(
      "safety",
      offsiteReal
        ? {
            ref: "offsite",
            text: `A copy of both goes to ${p.offsite.name} ${lowerFirst(fact("offsite", "Schedule")) ?? "on request"}`,
          }
        : { ref: "offsite", text: "No off-site copy is set up yet" },
      offsiteReal && `, keeping ${fact("offsite", "Keeps")}`,
      offsiteReal &&
        `; the last one was checked by checksum ${when("offsite")}`,
      ".",
    );
    say(
      "sure",
      "Configuration ",
      {
        ref: "source",
        text: `${fact("source", "Revision")?.slice(0, 7) ?? "to be chosen"} from ${p.source.name}`,
      },
      planned
        ? " will run with pinned images."
        : ` runs with pinned images; the last checks passed `,
      !planned && { ref: "app", text: when("app") },
      !planned && ".",
    );
    return out;
  }

  say(
    "where",
    { ref: "app", text: fact("app", "Image") ?? h, mono: true },
    " listens on ",
    { text: fact("app", "Listens on") ?? "?", mono: true },
    " behind ",
    {
      ref: "gate:http",
      text: `80/tcp from ${fact("gate:http", "Allowed from")}`,
      mono: true,
    },
    " on ",
    {
      ref: "host",
      text: `${p.host.name.replace("Hetzner ", "").toLowerCase()} ${fact("host", "Server") ?? ""} at ${fact("host", "Address") ?? "no address yet"}`,
      mono: true,
    },
    ".",
  );
  if (service)
    say(
      "private",
      {
        ref: service.id,
        text: fact(service.id, "Image") ?? service.name,
        mono: true,
      },
      " answers only as ",
      {
        text: fact(service.id, "Inside the server") ?? service.name,
        mono: true,
      },
      " on the Compose network",
      fact(service.id, "Keeps samples for") &&
        `, keeping ${fact(service.id, "Keeps samples for")} of samples`,
      ".",
    );
  say(
    "data",
    ...volumes.flatMap((volume, i) => [
      i > 0 ? (i === volumes.length - 1 ? " and " : ", ") : "",
      {
        ref: volume.id,
        text: `${fact(volume.id, "Mounted at")} on volume ${fact(volume.id, "Volume")}`,
        mono: true,
      },
    ]),
    volumes.length ? " must survive a container replacement." : "",
  );
  say(
    "safety",
    offsiteReal
      ? { ref: "offsite", text: fact("offsite", "Bucket") ?? "", mono: true }
      : { ref: "offsite", text: "no backup destination", mono: false },
    offsiteReal &&
      `: ${fact("offsite", "Schedule")}, keeps ${fact("offsite", "Keeps")}; last copy ${fact("offsite", "Last copy")}; SHA-256 verified.`,
    offsiteReal &&
      restoreFact &&
      ` Restore test ${restoreFact.replace(/\.$/, "")}.`,
    !offsiteReal && ".",
  );
  say(
    "checks",
    "Checks: ",
    { text: fact("app", "Health") ?? "", mono: true },
    service?.facts.find((f) => f.label === "Readiness") && ", ",
    service?.facts.find((f) => f.label === "Readiness") && {
      text: fact(service.id, "Readiness") ?? "",
      mono: true,
    },
    planned ? "; not run yet." : "; last passed ",
    !planned && {
      ref: "app",
      text: at("app") ? localTime(at("app")!, true) : "never",
    },
    !planned && ".",
  );
  return out;
}
