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
  StackSimple,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import type { SavedInformation } from "@/server/operator-data";

/**
 * The stable destinations, in the order the sidebar draws them, so a simple
 * application never carries empty infrastructure controls.
 *
 * The activity group is History and command output, and it is drawn apart
 * from the rest: they are the record of what has been done, not parts of the
 * application, and as rows beside Backups and Access they read as two more
 * things needing attention. The sidebar closes them into one heading and
 * opens it again whenever a link lands on either.
 *
 * Which of them a given application lists is decided by its records rather
 * than by a flag here; see `standings` below.
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
  },
  {
    id: "database",
    label: "Database",
    icon: Database,
    group: "stack",
  },
  {
    id: "cache",
    label: "Cache & queue",
    icon: Lightning,
    group: "stack",
  },
  {
    id: "jobs",
    label: "Jobs",
    icon: CalendarCheck,
    group: "stack",
  },
  {
    id: "storage",
    label: "Storage",
    icon: HardDrive,
    group: "stack",
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
  // One destination for who can reach the application: the name, the ports
  // and the path between them. It is never hidden, because the answers a
  // reader most needs from it are the ones nobody has established yet.
  { id: "access", label: "Access", icon: Globe, group: "care" },
  {
    id: "cdn",
    label: "CDN",
    icon: StackSimple,
    group: "care",
  },
  // Listed once a variable or a pending request names one: the page is where
  // a value Pi asked for goes.
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
  const wanted = hash.toLowerCase();
  return applicationSections.find((s) => `#${s.id}` === wanted)?.id ?? null;
}

/**
 * What a destination has to show, in four answers that must never collapse
 * into one word:
 *
 *   recorded    a record gives the page content.
 *   unchecked   nobody has looked. Silence.
 *   absent      somebody looked and there is none. A fact.
 *   not-set-up  nothing was arranged, and arranging it is a decision.
 *
 * A destination is carried by a record that says its subject is **present**.
 * An absent one is an answer of its own and belongs under "Show more", not in
 * the list: whoami's one volume record says it has no persistent application
 * data, and a sidebar that read that as "Storage" put a storage page on a
 * stateless container, off the very record that says there is none.
 *
 * The map is not enough either. It draws shapes, and a shape is not a thing
 * that exists.
 */
export type Standing = "recorded" | "absent" | "unchecked" | "not-set-up";

/** The subjects that speak for each destination whose listing is earned. */
const speaks: Partial<Record<ApplicationSection, string[]>> = {
  processes: ["process"],
  storage: ["volume"],
  database: ["database"],
  cache: ["cache", "queue"],
  jobs: ["job"],
  variables: ["variable"],
  access: ["door", "access", "firewall", "domain", "certificate"],
  backups: ["backup-plan", "backup-copy", "restore-test"],
  monitoring: ["monitor"],
  cdn: ["cdn"],
};

/** The pages whose emptiness is a decision, not a gap in looking. */
const arranged = new Set<ApplicationSection>(["backups", "monitoring", "cdn"]);

/**
 * Pages that exist for every application, whatever it runs: the three that
 * describe it, and the two that record what has been done to it.
 */
const always = new Set<ApplicationSection>([
  "overview",
  "architecture",
  "deployment",
  "history",
  "logs",
]);

/**
 * Access is listed whatever the records say, because its unknowns are the
 * point. A page that appears only once a firewall has been read is a page
 * that hides the fact that nobody read one.
 */
const NEVER_HIDDEN: ApplicationSection = "access";

/**
 * Whether anything on record holds data this application would lose.
 *
 * Backups is listed from this rather than from a copy existing, because the
 * page is about what there is to lose and the moment there is something is
 * the moment it is worth reading. An application with documents and no copy
 * is exactly the case that must not be quiet.
 */
const holdsData = (records: SavedInformation[]) =>
  records.some(
    (record) =>
      !record.retiredAt &&
      ["volume", "database"].includes(
        record.presentation?.states?.ref.kind ?? "",
      ) &&
      record.presentation?.states?.presence !== "absent",
  );

export function standingOf(
  section: ApplicationSectionDefinition,
  records: SavedInformation[],
  waiting = false,
): Standing {
  if (always.has(section.id)) return "recorded";
  if (section.id === "backups" && holdsData(records)) return "recorded";
  // A value Pi has asked the owner for and not been given is content for
  // Environment Variables: the page is where the answer goes.
  if (section.id === "variables" && waiting) return "recorded";
  const kinds = speaks[section.id];
  if (!kinds) return "recorded";
  const mine = records
    .filter((record) => !record.retiredAt)
    .filter((record) =>
      kinds.includes(record.presentation?.states?.ref.kind ?? ""),
    );
  if (mine.some((record) => record.presentation?.states?.presence !== "absent"))
    return "recorded";
  // Somebody looked and said there is none. That is an answer, and it is not
  // the same answer as silence.
  if (mine.length) return "absent";
  return arranged.has(section.id) ? "not-set-up" : "unchecked";
}

/** The words a row wears when it is not carrying content. */
export function wordsFor(standing: Standing) {
  if (standing === "absent") return "checked · none here";
  if (standing === "not-set-up") return "not set up";
  return "not checked";
}

export interface SectionStanding {
  section: ApplicationSectionDefinition;
  standing: Standing;
}

/** Every destination with what is known about it, in the sidebar's order. */
export function standings(
  records: SavedInformation[],
  /** Whether Pi has asked the owner for a value it has not been given. */
  waiting = false,
): SectionStanding[] {
  return applicationSections.map((section) => ({
    section,
    standing: standingOf(section, records, waiting),
  }));
}

const listed = (active: ApplicationSection | null) => (row: SectionStanding) =>
  row.standing === "recorded" ||
  row.section.id === NEVER_HIDDEN ||
  row.section.id === active;

/** A destination as the sidebar draws it: the row, and why it is quiet. */
export type ListedSection = ApplicationSectionDefinition & { note?: string };

const withNote = (row: SectionStanding): ListedSection => ({
  ...row.section,
  note: row.standing === "recorded" ? undefined : wordsFor(row.standing),
});

/**
 * The destinations to list: the ones a record gives content, Access, and
 * whichever one is open. A listed page with nothing to show still says so.
 */
export function visibleSections(
  active: ApplicationSection | null,
  rows: SectionStanding[],
): ListedSection[] {
  return rows.filter(listed(active)).map(withNote);
}

/**
 * The rest, one press away under "Show more", each carrying the reason it is
 * not listed. A page that is not listed is never gone.
 */
export function hiddenSections(
  active: ApplicationSection | null,
  rows: SectionStanding[],
): (ApplicationSectionDefinition & { note: string })[] {
  return rows
    .filter((row) => !listed(active)(row))
    .map((row) => ({ ...row.section, note: wordsFor(row.standing) }));
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
