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
    available: false,
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: CalendarCheck,
    group: "stack",
    hideable: true,
    available: false,
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
    available: false,
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

/** Whether a hideable destination has anything recorded to show. */
export function sectionRecorded(
  section: ApplicationSection,
  stack: ApplicationStack,
  facts: ApplicationFacts = {},
  hasHost = false,
) {
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
) {
  return applicationSections.filter(
    (section) =>
      section.id === active ||
      sectionRecorded(section.id, stack, facts, hasHost),
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
) {
  return applicationSections
    .filter(
      (section) =>
        "hideable" in section &&
        section.hideable &&
        section.id !== active &&
        !sectionRecorded(section.id, stack, facts, hasHost),
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
