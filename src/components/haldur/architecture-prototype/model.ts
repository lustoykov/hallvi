// The vocabulary the Architecture and Overview layouts are drawn from: a part
// carries plain words first and exact values second, and says how sure Server
// Guy is from the evidence and its age.
//
// It no longer builds anything. The model used to be assembled here out of a
// deployment record; it is assembled in `architecture-records.ts` out of saved
// records now, and what is left here is the shape both agree on.

import type { ApplicationRecord } from "@/server/types";

import type { ApplicationSection } from "../application-sections";

export type Certainty =
  | "verified"
  | "stale"
  | "unknown"
  | "planned"
  | "absent"
  | "failed"
  /**
   * Pi judged that this wants looking at, without a check having failed. A
   * same-host backup copy is the worked example: written, readable, and no
   * protection at all against losing the machine. Like `failed` it is a
   * judgement rather than a reading, so it never ages into something softer.
   */
  | "warning";

export type PartKind =
  | "controller"
  | "source"
  | "gate"
  | "tls"
  | "host"
  | "web"
  | "private"
  | "volume"
  | "offsite"
  | "monitor";

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

export type ScenarioId =
  "live" | "later" | "failing" | "planned" | "domain" | "checked" | "equipped";
export type CheckMark = "checking" | "passed" | "failed";

/**
 * What a page hands the Overview layouts about the application itself.
 *
 * It used to carry a deployment record, its derived facts and its operations.
 * Nothing wrote a deployment any more, so every page passed null and an empty
 * object, and every branch that read them was a branch that could not run.
 */
export interface LiveRecord {
  application: ApplicationRecord;
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
  /**
   * How far the application can be reached from. `restricted` cannot say
   * "nobody has read this back", and its absence renders as "anyone", which
   * is a claim. So the three-way reading is what the design consults, and
   * `restricted` stays for the parts that only need the boolean.
   */
  openness: "restricted" | "public" | "unknown";
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
  // A no-break space holds the number to its unit. "7 h ago" is one fact, and
  // a line that breaks between the 7 and the h makes the reader reassemble it
  // — which happened in Overview's verdict the moment it became a sentence.
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes}\u00a0min ago`;
  const hours = Math.round(ms / HOUR);
  if (hours < 48) return `${hours}\u00a0h ago`;
  return `${Math.round(ms / DAY)}\u00a0days ago`;
}

export function localTime(at: string, withDay = false) {
  const date = new Date(at);
  // 24-hour, as the logs and consoles beside it are.
  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return withDay
    ? `${date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`
    : time;
}

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

export const CITIES: Record<string, [string, string]> = {
  fsn1: ["Falkenstein", "Germany"],
  nbg1: ["Nuremberg", "Germany"],
  hel1: ["Helsinki", "Finland"],
  ash: ["Ashburn", "the United States"],
  hil: ["Hillsboro", "the United States"],
  sin: ["Singapore", "Singapore"],
};

const lowerFirst = (value: string | undefined) =>
  value ? value.charAt(0).toLowerCase() + value.slice(1) : undefined;

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
        : "Haldur ",
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
      model.restricted && ", Haldur's network, and ",
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
