"use client";

// Database, on real records.
//
// The selected design (the register): every database a record names, how
// much of what could be known about it is known (`evidence.tsx`), and every
// check that touched it. Opening a row names what nobody has looked at and
// asks for it in one question.
//
// "Is this data safe" is the second question anyone arrives here with, and
// this page used to answer it four times over in its own words. Backups owns
// that story now. What is left here is one read-only line of it and the way
// to the page that owns it.
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
  FactCell,
  Known,
  MissingFacts,
  Unchecked,
  databaseFacts,
} from "./evidence";
import { ProtectionLine } from "./protection-line";
import { probeReading } from "./pulse";
import {
  Ask,
  Board,
  Facts,
  Figure,
  Lede,
  Name,
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
} from "./register";

const probeTone = (probe: DatabaseProbe) => probeReading(probe).tone;
const probeWord = (probe: DatabaseProbe) => probeReading(probe).word;

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
  // The query checks, one per database, where one was ever run.
  const queries = present.flatMap((row) =>
    row.answering ? [row.answering] : [],
  );
  const queried =
    queries
      .filter((probe) => probe.passed && probe.at)
      .map((probe) => probe.at!)
      .sort()
      .at(-1) ?? null;
  // What a record could say about each database, and what it does say.
  const facts = new Map(rows.map((row) => [row.id, databaseFacts(row, now)]));
  const factsOf = (row: DatabaseRow) => facts.get(row.id) ?? [];
  const factOf = (row: DatabaseRow, key: string) =>
    factsOf(row).find((fact) => fact.key === key)!;

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
      key: "known",
      head: "Known",
      width: 200,
      cell: (row) => <Known facts={factsOf(row)} />,
    },
    {
      key: "answering",
      head: "Answering",
      width: 150,
      cell: (row) => {
        const fact = factOf(row, "answering");
        return fact.state === "known" ? (
          <Tag tone="good">{fact.value}</Tag>
        ) : fact.state === "absent" ? (
          <Tag tone="bad">no</Tag>
        ) : (
          <FactCell fact={fact} />
        );
      },
    },
    {
      key: "checks",
      head: "Checks",
      width: 110,
      cell: (row) =>
        row.probes.length ? (
          <Pips
            empty=""
            items={row.probes.map((probe) => ({
              id: probe.key,
              tone: probeTone(probe),
              title: `${probe.label}: ${probeWord(probe)}`,
            }))}
          />
        ) : (
          <FactCell fact={factOf(row, "checks")} />
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
          The database {applicationName} depends on, where its data lives, and
          whether it answers.
        </Lede>

        <Strip>
          <Figure
            label={present.length > 1 ? "Databases" : "Database"}
            value={
              present.length > 1
                ? present.length
                : (first?.label ?? "None here")
            }
            // A missing path is not an absent database. Falling through to
            // the absence sentence printed "A record states there is no
            // database" under the name of one that answers queries.
            note={
              present.length > 1
                ? present.map((row) => row.label).join(", ")
                : first
                  ? (first.path ?? "Where its data lives is not recorded.")
                  : "A record states there is no database."
            }
          />
          <Figure
            label="Size"
            value={first?.size ?? "Not measured"}
            note={
              first?.size
                ? `Read ${ago(first.sizeAt, now)}`
                : "No record carries a size"
            }
          />
          <Figure
            label="Answering"
            // Only the check that ran a query answers this. A failed one is
            // "No"; a pass inside its horizon is "Yes"; an older pass is what
            // it is, a yes from last time; anything else is nobody having
            // asked, however many other checks passed.
            value={
              !queries.length
                ? "Not checked"
                : queries.some((probe) => !probe.passed && !probe.noted)
                  ? "No"
                  : queries.every((probe) => probe.passed && probe.fresh)
                    ? "Yes"
                    : queries.every((probe) => probe.passed)
                      ? "Last time, yes"
                      : "Not checked"
            }
            tone={
              queries.some((probe) => !probe.passed && !probe.noted)
                ? "bad"
                : queries.length &&
                    queries.every((probe) => probe.passed && probe.fresh)
                  ? "good"
                  : "plain"
            }
            note={
              queries.some((probe) => !probe.passed && !probe.noted)
                ? queries
                    .filter((probe) => !probe.passed && !probe.noted)
                    .map((probe) => probe.detail ?? probe.label)
                    .join(", ")
                : queried
                  ? `A query ran ${ago(queried, now)}`
                  : "Nothing has connected to it and run a query"
            }
          />
        </Strip>

        <Board
          title={present.length > 1 ? "Databases" : "Database"}
          note="A row opens what proves it and everything recorded about it."
        >
          <Register
            rows={rows}
            columns={columns}
            label={(row) => row.label}
            tone={(row) =>
              row.probes.some((probe) => !probe.passed && !probe.noted)
                ? "bad"
                : row.absent || !row.probes.length
                  ? "idle"
                  : "plain"
            }
            defaultOpen={rows.length === 1 ? rows[0].id : null}
            detail={(row) => {
              const broken = row.probes.find(
                (probe) => !probe.passed && !probe.noted,
              );
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
                  <MissingFacts
                    facts={factsOf(row)}
                    subject={`the ${row.label} database`}
                    onAsk={onAsk}
                  />
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
                              <Unchecked
                                key="detail"
                                reason="The check ran. Nobody wrote down what it looked at."
                              >
                                not written down
                              </Unchecked>
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
                      ...factsOf(row)
                        .filter(
                          (fact) =>
                            fact.key !== "checks" && fact.key !== "answering",
                        )
                        .map((fact) => ({
                          label: fact.label,
                          value: <FactCell fact={fact} />,
                        })),
                      ...row.extras,
                    ]}
                  />
                </Opened>
              );
            }}
          />
        </Board>

        <ProtectionLine
          protection={protection}
          verdict={verdict}
          now={now}
          onOpenBackups={() => onOpenDestination("backups")}
        />
      </div>
    </div>
  );
}
