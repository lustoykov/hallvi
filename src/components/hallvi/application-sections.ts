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
import type { SavedInformation } from "@/server/operator-data";

/**
 * The stable destinations. The application group is always there; the
 * stack group shows only the resources this application's deployment
 * records, so a simple application never carries empty infrastructure
 * controls; the care group covers protection and delivery.
 *
 * The activity group is History and command output, and it is drawn apart
 * from the rest: they are the record of what has been done, not parts of the
 * application, and as rows beside Backups and Domains they read as two more
 * things needing attention. The sidebar closes them into one heading and
 * opens it again whenever a link lands on either.
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
    group: "activity",
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
  {
    // Not "Logs". Nothing in this product retrieves an application's own
    // logs — no tool does it — and this page has only ever held Hallvi's
    // command output, which History carries as evidence on the event that
    // produced it. Named for what it holds.
    id: "logs",
    label: "Command output",
    icon: TerminalWindow,
    group: "activity",
  },
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
    // Gated like the rest: it appears once a variable or a pending request
    // names one. It has to be `hideable` to say so, because a gated section
    // without it is dropped by both lists and the destination simply
    // disappears rather than waiting under "Show more".
    hideable: true,
    available: true,
  },
] as const;
export type ApplicationSection = (typeof applicationSections)[number]["id"];
export type ApplicationSectionDefinition = (typeof applicationSections)[number];
export function sectionFromHash(hash: string): ApplicationSection | null {
  return applicationSections.find((s) => `#${s.id}` === hash)?.id ?? null;
}

/**
 * What the records establish, plus whether anything has been deployed at all.
 *
 * A destination lights up when a record *speaks for* one of its subjects. The
 * map alone is not enough for most of them: it draws shapes, and a shape is
 * not a thing that exists. Processes and Storage are the exception, because a
 * planned map is worth navigating to before anything runs — and both pages
 * say plainly that nothing has been looked at yet.
 *
 * `deployed` is not a destination. It is what tells a row hidden because
 * nothing names it apart from one hidden because nothing has happened yet.
 */
export type Recorded = Partial<Record<ApplicationSection, boolean>> & {
  deployed?: boolean;
};

export function recordedSections(
  records: SavedInformation[],
  /** Whether Pi has asked the owner for a value it has not been given. */
  waiting = false,
): Recorded {
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
    deployed: live.some(
      (record) => record.presentation?.content?.kind === "deployment",
    ),
    // Backups and Monitoring are always listed: "nothing is watching" and
    // "nothing has been established about copies" are the answers a reader
    // most needs, and a destination that hides them says the opposite.
  };
}

/**
 * Whether a destination has anything recorded to show.
 *
 * Only the records answer this now. There used to be a second answer behind
 * them, read off a deployment model the product stopped writing to, and a
 * fallback that can only ever say "nothing" is worse than no fallback: it
 * reads like an answer.
 */
export function sectionRecorded(
  section: ApplicationSection,
  recorded: Recorded = {},
) {
  return recorded[section] ?? true;
}

/** The destinations to list: every recorded one, plus the one being viewed. */
export function visibleSections(
  active: ApplicationSection | null,
  recorded: Recorded = {},
) {
  return applicationSections.filter(
    (section) => section.id === active || sectionRecorded(section.id, recorded),
  );
}

/**
 * The destinations this application does not show, with the reason each row
 * carries once revealed: the application does not use it, nothing can record
 * it yet, or it is known only after the first deployment.
 */
export function hiddenSections(
  active: ApplicationSection | null,
  recorded: Recorded = {},
) {
  return applicationSections
    .filter(
      (section) =>
        "hideable" in section &&
        section.hideable &&
        section.id !== active &&
        !sectionRecorded(section.id, recorded),
    )
    .map((section) => ({
      ...section,
      note:
        section.id === "security"
          ? "check firewall rules"
          : !("available" in section && section.available)
            ? "nothing can record this yet"
            : recorded.deployed
              ? // Deployed, and still nothing names one. "Not used" would be
                // a claim; "after deployment" was simply wrong, because the
                // deployment has happened. Said the same way Overview says
                // it, so the two surfaces describe one state in one phrase.
                "not checked yet"
              : "after deployment",
    }));
}

/**
 * The one destination a repeated record should send a reader to.
 *
 * A record names every view it belongs to, and the row of pills on its full
 * card keeps the sidebar's order — right for a row. A single link has to
 * choose one, and the record's own order is the better authority: Pi writes
 * `["backups", "overview"]` for a backup copy because Backups renders it and
 * Overview only mentions it. Choosing by sidebar order sent the reader to
 * the page that says least.
 *
 * Returns undefined when the record names no other view, which is when a
 * scroll to its first appearance is still the best available.
 */
export function recordDestination(
  views: readonly string[],
  currentView?: ApplicationSection,
) {
  return views
    .filter((view) => view !== currentView)
    .map((view) => applicationSections.find((section) => section.id === view))
    .find((section) => section !== undefined);
}
