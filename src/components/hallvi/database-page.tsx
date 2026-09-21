"use client";

// Database, on real records.
//
// The selected design (the register): every database a record names, with
// where its bytes are, how big it was when somebody last read it, and every
// check that touched it.
//
// Under it, the backup situation, because "is this data safe" is the second
// question anyone arrives here with and it used to be the whole page. It is
// the same verdict Backups prints, read from the same projection, as four
// plain rows: is a copy scheduled, is there one off the server, has one ever
// been restored, and what a copy holds. The three never borrow from one
// another — a passing health check is not a copy, and a copy is not a
// restore.
//
// Its empty state has to be careful: an application may genuinely have no
// database, and this page cannot tell that apart from nobody having looked —
// only a record stating one `absent` can.

import { useMemo } from "react";

import type { SavedInformation } from "@/server/operator-data";

import type { ApplicationSection } from "./application-sections";
import { protectionFromRecords, protectionVerdict } from "./backups-records";
import {
  databaseAssessed,
  databasesFromRecords,
  type DatabaseProbe,
  type DatabaseRow,
} from "./database-records";
import type { PageChrome } from "./deployment-prototype/page-head";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import { EmptySketch } from "./empty-sketch";
import {
  Ask,
  Board,
  Clip,
  Facts,
  Figure,
  Foot,
  Go,
  Lede,
  Name,
  None,
  Note,
  Num,
  Opened,
  Pips,
  Register,
  Strip,
  Sub,
  Tag,
  ago,
  type Column,
  type Tone,
} from "./register";

function probeTone(probe: DatabaseProbe): Tone {
  if (!probe.passed) return "bad";
  return probe.fresh ? "good" : "warn";
}

function probeWord(probe: DatabaseProbe) {
  if (!probe.passed) return "failed";
  return probe.fresh ? "passed" : "passed, too long ago to count";
}

const VERDICT_TONE: Record<string, Tone> = {
  verified: "good",
  warning: "warn",
  failed: "bad",
  unknown: "warn",
  quiet: "plain",
};

interface ProtectionRow {
  id: string;
  question: string;
  answer: string;
  tone: Tone;
  detail: string;
  at: string | null;
}

export function DatabasePage({
  records,
  applicationId,
  applicationName,
  now,
  reachable = "checking",
  onReopen,
  chrome,
  onOpenDestination,
  onAsk,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
  /** Whether a private way in still answers; see PageHead. */
  reachable?: Reachability;
  /** Asks Pi to reopen private access when it is closed. */
  onReopen?: () => void;
  chrome: PageChrome;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  const rows = useMemo(
    () => databasesFromRecords({ records, now }),
    [records, now],
  );
  const protection = useMemo(
    () => protectionFromRecords(records, now, applicationId),
    [records, now, applicationId],
  );
  const verdict = useMemo(
    () => protectionVerdict(protection, now),
    [protection, now],
  );
  const assessed = useMemo(() => databaseAssessed(records), [records]);

  const head = (
    <PageHead
      bar={chrome.bar}
      title="Database"
      name={applicationName}
      openUrl={null}
      restricted={false}
      reachable={reachable}
      onReopen={onReopen}
    />
  );

  if (!assessed)
    return (
      <div className="ax-root" data-variant="register">
        {head}
        <div className="hv-deploy-none">
          <h2>Nothing here has been looked at yet.</h2>
          <p>
            No record names a database for {applicationName}. It may not have
            one — plenty of applications do not — but nothing here has
            established that either way, and an unchecked database and an absent
            one are not the same thing.
          </p>
          <button
            type="button"
            className="hv-primary-button"
            onClick={() =>
              onAsk(
                `Does ${applicationName} have a database? If it does, say which engine, where its data lives and whether it answers; if it does not, record that.`,
              )
            }
          >
            Ask Hallvi to look
          </button>
          <EmptySketch kind="timeline" />
        </div>
      </div>
    );

  const present = rows.filter((row) => !row.absent);
  const first = present[0] ?? null;
  const probes = present.flatMap((row) => row.probes);
  const failed = probes.filter((probe) => !probe.passed);
  const stale = probes.filter((probe) => probe.passed && !probe.fresh);
  const lastPassed =
    present
      .map((row) => row.lastPassed)
      .filter((at): at is string => Boolean(at))
      .sort()
      .at(-1) ?? null;

  const { summary, copies, newestCopyCoverage } = protection;
  const newestCopy = copies[0] ?? null;
  const safety: ProtectionRow[] = [
    {
      id: "schedule",
      question: "Is a copy scheduled?",
      answer: summary.schedule
        ? "Yes"
        : protection.declaredAbsent
          ? "No"
          : protection.planned
            ? "A plan, no schedule"
            : "Not known yet",
      tone: summary.schedule
        ? "good"
        : protection.declaredAbsent
          ? "bad"
          : "warn",
      detail: summary.schedule
        ? `${summary.schedule.words}${summary.keep ? ` · keeps ${summary.keep}` : ""}`
        : protection.declaredAbsent
          ? "Hallvi looked, and no backup plan exists."
          : "No record says copies are meant to happen.",
      at: summary.schedule?.at ?? null,
    },
    {
      id: "copy",
      question: "Is there a copy off the server?",
      answer: !newestCopy
        ? "None on record"
        : newestCopy.kind === "same-server"
          ? "Only beside the data"
          : newestCopy.kind === "unclassified"
            ? "A copy, place unstated"
            : "Yes",
      tone: !newestCopy
        ? "warn"
        : newestCopy.kind === "same-server" ||
            newestCopy.kind === "unclassified"
          ? "warn"
          : "good",
      detail: newestCopy
        ? newestCopy.detail
        : "A copy stored somewhere else, so losing the server does not lose the data.",
      at: newestCopy?.at ?? null,
    },
    {
      id: "restore",
      question: "Would a copy actually restore?",
      answer: summary.restore ? "One has been opened" : "Never tested",
      tone: summary.restore ? "good" : "warn",
      detail:
        summary.restore?.detail ??
        "A backup only counts once one has been opened and loaded successfully.",
      at: summary.restore?.at ?? null,
    },
    {
      id: "holds",
      question: "What would a copy hold?",
      answer: !newestCopy
        ? protection.coverLabels.length
          ? "What the plan names"
          : "Nothing stated"
        : newestCopyCoverage.basis === "unrecorded"
          ? "Not written down"
          : newestCopyCoverage.missing.length
            ? "Not everything"
            : "Everything on record",
      tone:
        newestCopy && newestCopyCoverage.missing.length
          ? "bad"
          : newestCopy && newestCopyCoverage.basis !== "unrecorded"
            ? "good"
            : "plain",
      detail:
        newestCopy && newestCopyCoverage.missing.length
          ? `Missing: ${newestCopyCoverage.missing.map((one) => one.label).join(", ")}.`
          : protection.coverLabels.length
            ? `The plan covers ${protection.coverLabels.join(", ")}.${
                protection.uncovered.length
                  ? ` Not in any plan: ${protection.uncovered.map((one) => one.label).join(", ")}.`
                  : ""
              }`
            : protection.uncovered.length
              ? `In no plan: ${protection.uncovered.map((one) => one.label).join(", ")}.`
              : "No record says what a copy contains.",
      at: null,
    },
  ];

  const columns: Column<DatabaseRow>[] = [
    {
      key: "database",
      head: "Database",
      sort: (row) => row.label,
      cell: (row) => (
        <Name
          title={row.label}
          note={row.label === row.id ? undefined : row.id}
        />
      ),
    },
    {
      key: "where",
      head: "Where its data lives",
      cell: (row) => (row.path ? <Clip text={row.path} mono /> : <None />),
    },
    {
      key: "size",
      head: "Size",
      width: 110,
      align: "end",
      cell: (row) => (row.size ? <Num>{row.size}</Num> : <None />),
    },
    {
      key: "owner",
      head: "Used by",
      width: 150,
      cell: (row) => (row.owner ? <Clip text={row.owner} /> : <None />),
    },
    {
      key: "checks",
      head: "Checks",
      width: 96,
      cell: (row) => (
        <Pips
          empty="never checked"
          items={row.probes.map((probe) => ({
            id: probe.key,
            tone: probeTone(probe),
            title: `${probe.label}: ${probeWord(probe)}`,
          }))}
        />
      ),
    },
    {
      key: "answered",
      head: "Last answered",
      width: 120,
      align: "end",
      sort: (row) => Date.parse(row.lastPassed ?? "") || 0,
      cell: (row) =>
        row.absent ? (
          <Tag>none here</Tag>
        ) : row.lastPassed ? (
          <Num>{ago(row.lastPassed, now)}</Num>
        ) : (
          <None>—</None>
        ),
    },
  ];

  return (
    <div className="ax-root" data-variant="register">
      {head}
      <div className="hv-rg-sheet">
        <Lede
          holds={
            present.length === 1 && first
              ? [first.label, first.size].filter(Boolean).join(" · ")
              : `${present.length} databases`
          }
        >
          The database {applicationName} depends on: where its data lives,
          whether it answers, and whether a copy of it exists anywhere else.
        </Lede>

        <Strip>
          <Figure
            label={present.length > 1 ? "Databases" : "Database"}
            value={
              present.length > 1
                ? present.length
                : (first?.label ?? "None here")
            }
            note={
              present.length > 1
                ? present.map((row) => row.label).join(", ")
                : (first?.path ?? "A record states there is no database.")
            }
          />
          <Figure
            label="Size"
            value={first?.size ?? "—"}
            note={
              first?.size
                ? `Read ${ago(first.sizeAt, now)}`
                : "No record carries a size"
            }
          />
          <Figure
            label="Answering"
            value={
              failed.length
                ? "No"
                : !probes.length
                  ? "Not checked"
                  : stale.length === probes.length
                    ? "It did"
                    : "Yes"
            }
            tone={
              failed.length
                ? "bad"
                : !probes.length || stale.length === probes.length
                  ? "warn"
                  : "good"
            }
            note={
              failed.length
                ? failed.map((probe) => probe.label).join(", ")
                : lastPassed
                  ? `Last passed ${ago(lastPassed, now)}${stale.length === probes.length ? " · too long ago to count" : ""}`
                  : "Nothing has connected to it and run a query"
            }
          />
          <Figure
            label="Backups"
            value={
              newestCopy
                ? `Copied ${ago(newestCopy.at, now)}`
                : summary.schedule
                  ? "Scheduled, no copy"
                  : "No copy"
            }
            tone={VERDICT_TONE[verdict.tone] ?? "warn"}
            note={verdict.says}
          />
        </Strip>

        <Board
          title={present.length > 1 ? "Databases" : "Database"}
          note="A row opens what proves it and everything recorded about it."
        >
          <Register
            rows={rows}
            columns={columns}
            tone={(row) =>
              row.probes.some((probe) => !probe.passed)
                ? "bad"
                : row.absent || !row.probes.length
                  ? "idle"
                  : "plain"
            }
            defaultOpen={rows.length === 1 ? rows[0].id : null}
            detail={(row) => {
              const broken = row.probes.find((probe) => !probe.passed);
              return (
                <Opened
                  asks={
                    <>
                      <Ask
                        onAsk={onAsk}
                        tone={broken ? "bad" : "plain"}
                        prompt={
                          broken
                            ? `The check "${broken.label}" on the ${row.label} database failed. What is wrong, and what would fix it?`
                            : `Connect to the ${row.label} database, check that it answers, and record its size now.`
                        }
                      >
                        {broken ? "Why did it fail?" : "Check it now"}
                      </Ask>
                      <Ask
                        onAsk={onAsk}
                        prompt={`What is in the ${row.label} database? List its largest tables with row counts and sizes, and say what is growing.`}
                      >
                        What is taking the space?
                      </Ask>
                    </>
                  }
                >
                  {row.probes.length ? (
                    <div>
                      <span className="hv-rg-label">What proves it</span>
                      <Sub
                        heads={[
                          "Check",
                          "What was looked at",
                          "When",
                          "Result",
                        ]}
                        rows={row.probes.map((probe) => ({
                          id: probe.key,
                          tone: probeTone(probe),
                          cells: [
                            probe.label,
                            probe.detail ?? (
                              <None key="detail">no detail written down</None>
                            ),
                            <Num key="when">{ago(probe.at, now)}</Num>,
                            <Tag key="result" tone={probeTone(probe)}>
                              {probeWord(probe)}
                            </Tag>,
                          ],
                        }))}
                      />
                    </div>
                  ) : (
                    <Note>
                      {row.absent
                        ? "A record states this application has no such database."
                        : "No check has touched this database. It is on record, and nothing says whether it answers."}
                    </Note>
                  )}
                  <Facts
                    items={[
                      { label: "Engine", value: row.label },
                      {
                        label: "Path",
                        value: row.path ? (
                          <span className="hv-rg-mono">{row.path}</span>
                        ) : (
                          <None />
                        ),
                      },
                      { label: "Size", value: row.size ?? <None /> },
                      { label: "Used by", value: row.owner ?? <None /> },
                      { label: "Port", value: row.port ?? <None /> },
                      ...row.extras,
                    ]}
                  />
                </Opened>
              );
            }}
          />
        </Board>

        <Board title="Backups" note={verdict.limit ?? verdict.says}>
          <Register
            rows={safety}
            columns={[
              {
                key: "question",
                head: "Question",
                width: 250,
                cell: (row) => <strong>{row.question}</strong>,
              },
              {
                key: "answer",
                head: "Answer",
                width: 190,
                cell: (row) => <Tag tone={row.tone}>{row.answer}</Tag>,
              },
              {
                key: "detail",
                head: "What is on record",
                cell: (row) => <Clip text={row.detail} />,
              },
              {
                key: "at",
                head: "When",
                width: 110,
                align: "end",
                cell: (row) =>
                  row.at ? <Num>{ago(row.at, now)}</Num> : <None>—</None>,
              },
            ]}
          />
          <Foot>
            <span>
              The same records Backups reads. A passing check is not a copy, and
              a copy is not a restore.
            </span>
            {verdict.next && (
              <Ask onAsk={onAsk} prompt={verdict.next.draft}>
                {verdict.next.label}
              </Ask>
            )}
            <Go onGo={() => onOpenDestination("backups")}>Open Backups</Go>
          </Foot>
        </Board>
      </div>
    </div>
  );
}
