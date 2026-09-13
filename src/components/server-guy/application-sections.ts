import {
  SquaresFour,
  Graph,
  RocketLaunch,
  ClockCounterClockwise,
  Cpu,
  Database,
  Lightning,
  CalendarCheck,
  HardDrive,
  Archive,
  TerminalWindow,
  Pulse,
  Globe,
  ShieldCheck,
  StackSimple,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import type { ApplicationFacts } from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { SavedInformation } from "@/server/operator-data";

/**
 * The stable destinations. The application group is always there; the
 * stack group shows only the resources this application's deployment
 * records, so a simple application never carries empty infrastructure
 * controls; the care group covers protection, evidence and delivery.
 *
 * `hideable` says a destination drops under "Show more" until something
 * records it. `available` says whether any backend can record it today.
 */
export const applicationSections = [
  {
    id: "overview",
    label: "Overview",
    icon: SquaresFour,
    group: "application",
  },
  {
    id: "architecture",
    label: "Architecture",
    icon: Graph,
    group: "application",
  },
  {
    id: "deployment",
    label: "Deployment",
    icon: RocketLaunch,
    group: "application",
  },
  {
    id: "history",
    label: "History",
    icon: ClockCounterClockwise,
    group: "application",
  },
  {
    id: "processes",
    label: "Processes",
    icon: Cpu,
    group: "stack",
    hideable: true,
    available: true,
  },
  {
    id: "database",
    label: "Database",
    icon: Database,
    group: "stack",
    hideable: true,
    available: true,
  },
  {
    id: "cache",
    label: "Cache & queue",
    icon: Lightning,
    group: "stack",
    hideable: true,
    available: true,
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: CalendarCheck,
    group: "stack",
    hideable: true,
    available: true,
  },
  {
    id: "storage",
    label: "Storage",
    icon: HardDrive,
    group: "stack",
    hideable: true,
    available: true,
  },
  { id: "backups", label: "Backups", icon: Archive, group: "care" },
  { id: "logs", label: "Logs", icon: TerminalWindow, group: "care" },
  { id: "monitoring", label: "Monitoring", icon: Pulse, group: "care" },
  { id: "domains", label: "Domains", icon: Globe, group: "care" },
  {
    id: "cdn",
    label: "CDN",
    icon: StackSimple,
    group: "care",
    hideable: true,
    available: true,
  },
  {
    id: "security",
    label: "Security",
    icon: ShieldCheck,
    group: "care",
    hideable: true,
    available: true,
  },
  {
    id: "variables",
    label: "Environment Variables",
    icon: SlidersHorizontal,
    group: "care",
  },
] as const;
export type ApplicationSection = (typeof applicationSections)[number]["id"];
export type ApplicationSectionDefinition = (typeof applicationSections)[number];
export function sectionFromHash(hash: string): ApplicationSection | null {
  return applicationSections.find((s) => `#${s.id}` === hash)?.id ?? null;
}

/**
 * What the records establish, for destinations that hide until something is
 * there. The stack model this used to read is no longer populated, so every
 * hideable destination stayed dark however much Pi recorded.
 *
 * A destination lights up when a record *speaks for* one of its subjects. The
 * map alone is not enough for most of them: it draws shapes, and a shape is
 * not a thing that exists. Processes and Storage are the exception, because a
 * planned map is worth navigating to before anything runs — and both pages
 * say plainly that nothing has been looked at yet.
 */
export function recordedSections(
  records: SavedInformation[],
  /** Whether Pi has asked the owner for a value it has not been given. */
  waiting = false,
) {
  const live = records.filter((record) => !record.retiredAt);
  const states = (...kinds: string[]) =>
    live.some((record) =>
      kinds.includes(record.presentation?.states?.ref.kind ?? ""),
    );
  const map = live
    .map((record) => record.presentation?.content)
    .find((content) => content?.kind === "topology");
  const parts = map?.kind === "topology" ? map.parts : [];
  const has = (...kinds: string[]) =>
    parts.some((part) => kinds.includes(part.kind));
  const secrets = live.some(
    (record) => record.presentation?.states?.ref.kind === "variable",
  );
  return {
    processes: states("process") || has("web", "private"),
    storage: states("volume") || has("volume"),
    security: states("door", "access", "firewall") || has("gate", "tls"),
    database: states("database"),
    cache: states("cache", "queue"),
    jobs: states("job"),
    // Configuration is worth a destination the moment anything names one,
    // including a value Pi has asked the owner for and not yet been given.
    variables: secrets || waiting,
    cdn: states("cdn"),
    // Backups and Monitoring are always listed: "nothing is watching" and
    // "nothing has been established about copies" are the answers a reader
    // most needs, and a destination that hides them says the opposite.
  } as Partial<Record<ApplicationSection, boolean>>;
}

/** Whether a hideable destination has anything recorded to show. */
export function sectionRecorded(
  section: ApplicationSection,
  stack: ApplicationStack,
  facts: ApplicationFacts = {},
  hasHost = false,
  /** What the records establish; preferred over the retired stack model. */
  recorded: Partial<Record<ApplicationSection, boolean>> = {},
) {
  if (recorded[section] !== undefined) return recorded[section];
  switch (section) {
    case "processes":
      return stack.recorded;
    case "database":
      return stack.databases.length > 0;
    case "cache":
      return stack.services.length > 0 || stack.queues.length > 0;
    case "jobs":
      return stack.jobs.length > 0;
    case "storage":
      return stack.volumes.length > 0;
    // Delivery through a CDN is only a destination once one is caching.
    case "cdn":
      return (
        facts.domains?.cdn.state === "active" ||
        facts.domains?.cdn.state === "partial"
      );
    // A provisioned host can be inspected even before its first firewall read.
    case "security":
      return hasHost || Boolean(facts.security);
    default:
      return true;
  }
}

/** The destinations to list: every recorded one, plus the one being viewed. */
export function visibleSections(
  stack: ApplicationStack,
  active: ApplicationSection | null,
  facts: ApplicationFacts = {},
  hasHost = false,
  recorded: Partial<Record<ApplicationSection, boolean>> = {},
) {
  return applicationSections.filter(
    (section) =>
      section.id === active ||
      sectionRecorded(section.id, stack, facts, hasHost, recorded),
  );
}

/**
 * The destinations this application does not show, with the reason each row
 * carries once revealed: the application does not use it, nothing can record
 * it yet, or it is known only after the first deployment.
 */
export function hiddenSections(
  stack: ApplicationStack,
  active: ApplicationSection | null,
  facts: ApplicationFacts = {},
  hasHost = false,
  recorded: Partial<Record<ApplicationSection, boolean>> = {},
) {
  return applicationSections
    .filter(
      (section) =>
        "hideable" in section &&
        section.hideable &&
        section.id !== active &&
        !sectionRecorded(section.id, stack, facts, hasHost, recorded),
    )
    .map((section) => ({
      ...section,
      note:
        section.id === "security"
          ? "check firewall rules"
          : !("available" in section && section.available)
            ? "nothing recorded yet"
            : stack.recorded
              ? "not used"
              : "after deployment",
    }));
}
