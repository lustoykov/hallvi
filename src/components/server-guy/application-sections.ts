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
  SlidersHorizontal,
} from "@phosphor-icons/react";
import type { ApplicationStack } from "@/server/application-stack";

/**
 * The stable destinations. The application group is always there; the
 * stack group shows only the resources this application's deployment
 * records, so a simple application never carries empty infrastructure
 * controls; the care group covers protection, evidence and delivery.
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
  // `available` says whether any backend can record the resource today.
  {
    id: "processes",
    label: "Processes",
    icon: Cpu,
    group: "stack",
    available: true,
  },
  {
    id: "database",
    label: "Database",
    icon: Database,
    group: "stack",
    available: true,
  },
  {
    id: "cache",
    label: "Cache & queue",
    icon: Lightning,
    group: "stack",
    available: false,
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: CalendarCheck,
    group: "stack",
    available: false,
  },
  {
    id: "storage",
    label: "Storage",
    icon: HardDrive,
    group: "stack",
    available: true,
  },
  { id: "backups", label: "Backups", icon: Archive, group: "care" },
  { id: "logs", label: "Logs", icon: TerminalWindow, group: "care" },
  { id: "monitoring", label: "Monitoring", icon: Pulse, group: "care" },
  { id: "domains", label: "Domains", icon: Globe, group: "care" },
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

/** Whether the stack group's destination has anything recorded to show. */
export function sectionRecorded(
  section: ApplicationSection,
  stack: ApplicationStack,
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
    default:
      return true;
  }
}

/** The destinations to list: every recorded one, plus the one being viewed. */
export function visibleSections(
  stack: ApplicationStack,
  active: ApplicationSection | null,
) {
  return applicationSections.filter(
    (section) => section.id === active || sectionRecorded(section.id, stack),
  );
}

/**
 * The stack destinations this application does not show, with the reason
 * each row carries once revealed: the application does not use it, nothing
 * can record it yet, or it is known only after the first deployment.
 */
export function hiddenStackSections(
  stack: ApplicationStack,
  active: ApplicationSection | null,
) {
  return applicationSections
    .filter(
      (section) =>
        section.group === "stack" &&
        section.id !== active &&
        !sectionRecorded(section.id, stack),
    )
    .map((section) => ({
      ...section,
      note: !("available" in section && section.available)
        ? "not available yet"
        : stack.recorded
          ? "not used"
          : "after deployment",
    }));
}
