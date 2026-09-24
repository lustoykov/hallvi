"use client";

// What is known about a row, and what nobody has looked at.
//
// A reading nobody took used to print "not recorded", "never checked", "no
// detail written down", "No record carries a size" or a bare dash, in
// whatever words the cell's author reached for, and a register of four
// processes could be half grey. The columns that carried those readings give
// way to one: how much of what could be known about this row is known.
//
// Three answers, and a reader has to be able to tell them apart:
//
//   unchecked  nothing has settled it. Nobody looked, or what was written
//              down was neither outcome. Grey, labelled, and the reason is
//              on hover, so the grey is never mute.
//   na         there is nothing here to read and a check would not change
//              that. A recorded fact about the thing, not a gap in it.
//   absent     somebody looked and the answer was none. A reading, so it is
//              drawn in ink like every other reading, never grey.
//
// A dash is none of the three and appears nowhere. Not-applicable never
// counts against a row: a worker with no public address is not a row with a
// hole in it.
//
// Each fact is said once in an opened row. What has no reading is named in
// the line above (`MissingFacts`); what has one is in the list below
// (`recorded`).

import type { ReactNode } from "react";

import type { DatabaseRow } from "./database-records";
import { Ask, Pips, ago } from "./register";
import type { ProcessCard } from "./stack-prototype/line-story";

export type FactState = "known" | "unchecked" | "na" | "absent";

export interface Fact {
  key: string;
  label: string;
  state: FactState;
  /** What the record says, where it says anything. */
  value: ReactNode;
  /** Why there is no reading. On hover, so the grey is never mute. */
  reason: string;
}

/** Grey, labelled, and it says why on hover. Never a dash, never a zero. */
export function Unchecked({
  reason,
  children = "not checked",
}: {
  reason: string;
  children?: ReactNode;
}) {
  return (
    <span className="hv-rg-unchecked" title={reason}>
      {children}
    </span>
  );
}

/** Nothing to read, and a check would not change that. */
export function NotApplicable({
  reason,
  children = "n/a",
}: {
  reason: string;
  children?: ReactNode;
}) {
  return (
    <span className="hv-rg-unchecked" data-kind="na" title={reason}>
      {children}
    </span>
  );
}

/** Somebody looked and the answer was none. A reading, drawn like one. */
export function Absent({ children }: { children: ReactNode }) {
  return <span className="hv-rg-absent">{children}</span>;
}

/** One cell, whichever of the four it turns out to be. */
export function FactCell({ fact }: { fact: Fact }) {
  if (fact.state === "known") return <>{fact.value}</>;
  if (fact.state === "absent") return <Absent>{fact.value}</Absent>;
  if (fact.state === "na") return <NotApplicable reason={fact.reason} />;
  return <Unchecked reason={fact.reason} />;
}

/** What counts: what a check could settle. Not-applicable is not a gap. */
export const askable = (facts: Fact[]) =>
  facts.filter((fact) => fact.state !== "na");

/**
 * The facts that carry a reading, for the list that shows readings.
 *
 * What has none is named once, in the line above it. A fact list that also
 * printed a "not checked" chip per gap said the same thing twice and put
 * the field of grey back, one row lower.
 */
export const recorded = (facts: Fact[]) =>
  facts.filter((fact) => fact.state === "known" || fact.state === "absent");

/** The pips, and "3 of 5 facts" beside them. */
export function Known({ facts }: { facts: Fact[] }) {
  const counted = askable(facts);
  const read = counted.filter((fact) => fact.state !== "unchecked");
  // Everything about this row is not-applicable, so there is nothing to
  // count and "0 of 0" would read as a failure to look.
  if (!counted.length)
    return (
      <NotApplicable reason={facts[0]?.reason ?? "Nothing here to read."} />
    );
  return (
    <span className="hv-rg-known">
      <Pips
        empty="nothing read"
        items={counted.map((fact) => ({
          id: fact.key,
          tone:
            fact.state === "unchecked" ? ("idle" as const) : ("good" as const),
          title:
            fact.state === "unchecked"
              ? `${fact.label}: not checked. ${fact.reason}`
              : `${fact.label}: recorded`,
        }))}
      />
      <em>
        {read.length} of {counted.length} facts
      </em>
    </span>
  );
}

/**
 * What an opened row has no reading for, by name, with one ask for the lot.
 *
 * The only place a gap is named. The fact list under it shows readings, so
 * a reader meets each fact once, on the side it belongs to.
 */
export function MissingFacts({
  facts,
  subject,
  onAsk,
}: {
  facts: Fact[];
  /** The thing, as the question would name it: "the paperless-web process". */
  subject: string;
  onAsk: (draft: string) => void;
}) {
  const open = facts.filter((fact) => fact.state === "unchecked");
  const na = facts.filter((fact) => fact.state === "na");
  const names = open.map((fact) => fact.label.toLowerCase()).join(", ");
  return (
    <div className="hv-rg-missing">
      {open.length ? (
        <>
          <span className="hv-rg-label">Not checked</span>
          {open.map((fact) => (
            <Unchecked key={fact.key} reason={fact.reason}>
              {fact.label.toLowerCase()}
            </Unchecked>
          ))}
        </>
      ) : (
        <p className="hv-rg-note">
          Nothing about {subject} is waiting to be checked.
        </p>
      )}
      {na.length ? (
        <>
          <span className="hv-rg-label">Not applicable</span>
          {na.map((fact) => (
            <NotApplicable key={fact.key} reason={fact.reason}>
              {fact.label.toLowerCase()}
            </NotApplicable>
          ))}
        </>
      ) : null}
      {open.length ? (
        <Ask onAsk={onAsk} prompt={`Check ${subject} now and record ${names}.`}>
          Check {open.length === 1 ? "it" : `all ${open.length}`}
        </Ask>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- the facts */

/**
 * What a record could say about one process, and what it does say.
 *
 * `Public address` is the honest not-applicable: the role is itself a
 * recorded fact, and a service on the private Compose network has no public
 * address to measure. Running a check would not produce one.
 */
export function processFacts(row: ProcessCard): Fact[] {
  return [
    {
      key: "image",
      label: "Image",
      state: row.image === "Not recorded" ? "unchecked" : "known",
      value: <span className="hv-rg-mono">{row.image}</span>,
      reason: "No record says which image this process runs.",
    },
    {
      key: "address",
      label: "Public address",
      state: row.role === "web" ? "known" : "na",
      value: row.reach,
      reason: `A ${row.role} on the private network has no public address.`,
    },
    {
      key: "port",
      label: "Port",
      state: row.port === null ? "unchecked" : "known",
      value: row.port,
      reason: "No record says which port this process listens on.",
    },
    {
      key: "memory",
      label: "Memory",
      state: row.memoryUsed ? "known" : "unchecked",
      value: row.memoryUsed,
      reason: "No record carries a memory reading for this process.",
    },
    {
      key: "cpu",
      label: "CPU",
      state: row.cpuUsed ? "known" : "unchecked",
      value: row.cpuUsed,
      reason: "No record carries a CPU reading for this process.",
    },
    {
      key: "restarts",
      label: "Restarts",
      // Zero is a reading. It is drawn in ink, not grey, because somebody
      // counted and the answer was none.
      state:
        row.restarts === null || row.restarts === undefined
          ? "unchecked"
          : Number(row.restarts) === 0
            ? "absent"
            : "known",
      value: Number(row.restarts) === 0 ? "none" : row.restarts,
      reason: "Nobody has counted how often this process has restarted.",
    },
    {
      key: "health",
      label: "Health check",
      state: row.health ? "known" : "unchecked",
      value: row.health,
      reason: "No record says whether this process declares a health check.",
    },
  ];
}

/**
 * The same for a database. A record stating there is no such database makes
 * every reading not-applicable: there is nothing to measure, and a check
 * would find nothing.
 */
export function databaseFacts(row: DatabaseRow, now: number): Fact[] {
  const stated = "A record states this application has no such database.";
  const answering = row.answering;
  const state = (known: boolean): FactState =>
    row.absent ? "na" : known ? "known" : "unchecked";
  return [
    {
      key: "path",
      label: "Where its data lives",
      state: state(Boolean(row.path)),
      value: <span className="hv-rg-mono">{row.path}</span>,
      reason: row.absent
        ? stated
        : "No record says where this database keeps files.",
    },
    {
      key: "size",
      label: "Size",
      state: state(Boolean(row.size)),
      value: <span className="hv-rg-num">{row.size}</span>,
      reason: row.absent ? stated : "Nobody has measured this database.",
    },
    {
      key: "owner",
      label: "Used by",
      state: state(Boolean(row.owner)),
      value: row.owner,
      reason: row.absent
        ? stated
        : "No record says which process connects to it.",
    },
    {
      key: "port",
      label: "Port",
      state: state(Boolean(row.port)),
      value: row.port,
      reason: row.absent ? stated : "No record says which port it listens on.",
    },
    {
      key: "checks",
      label: "Checks",
      state: row.absent ? "na" : row.probes.length ? "known" : "unchecked",
      value: `${row.probes.length} recorded`,
      reason: row.absent ? stated : "No check has ever touched this database.",
    },
    {
      key: "answering",
      label: "Answering",
      // A query that ran and came back no is a reading, and reads as one.
      // A note (`info`) is neither outcome: it settles nothing, so it leaves
      // the question open instead of turning into a red "no".
      state: row.absent
        ? "na"
        : !answering || answering.noted
          ? "unchecked"
          : answering.passed
            ? "known"
            : "absent",
      value:
        answering?.passed && !answering.noted
          ? answering.at
            ? `yes, ${ago(answering.at, now)}`
            : "yes"
          : "no",
      reason: row.absent
        ? stated
        : answering?.noted
          ? "A record notes this database without saying whether a query answered."
          : "Nothing has connected to it and run a query.",
    },
  ];
}
