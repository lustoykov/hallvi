"use client";

// Processes, on real records.
//
// The selected design (the register), fed by the `process` subjects Pi
// stated: one row per process with what it runs, how it is reached, the
// readings a record carries and every check that touched it. A row opens in
// place onto its command and onto what proves it — each check with what it
// looked at, from where, and when.
//
// Its empty state is the one that matters: nothing recorded is not "no
// processes", it is nobody looked, and the page says so and offers the one
// question that would change it. The same rule holds cell by cell: a reading
// nobody recorded is grey and says "not recorded", never a zero.

import { useMemo } from "react";

import type { SavedInformation } from "@/server/operator-data";

import type { ApplicationSection } from "./application-sections";
import type { PageChrome } from "./deployment-prototype/page-head";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import { EmptySketch } from "./empty-sketch";
import { processesFromRecords } from "./processes-records";
import { probeReading } from "./pulse";
import {
  Ask,
  Bar,
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
} from "./register";
import type { ProcessCard, Probe } from "./stack-prototype/line-story";

const ROLE_WORD: Record<ProcessCard["role"], string> = {
  web: "web app",
  private: "private",
  worker: "worker",
  service: "service",
};

/** "661.8 MiB", "3.73 GiB", "1,484 MB" → MiB. Null when it does not parse. */
export function mebibytes(text: string | null | undefined) {
  const match = text?.replace(/,/g, "").match(/([\d.]+)\s*([KMGT])i?B/i);
  if (!match) return null;
  const scale = { K: 1 / 1024, M: 1, G: 1024, T: 1024 * 1024 }[
    match[2].toUpperCase() as "K" | "M" | "G" | "T"
  ];
  return Number(match[1]) * scale;
}

type Row = ProcessCard & { id: string };

export function ProcessesPage({
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
  onOpenConversation?: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  onAsk: (draft: string) => void;
}) {
  const story = useMemo(
    () => processesFromRecords({ records, applicationId, now }),
    [records, applicationId, now],
  );
  // The live pulse refreshes nothing here. It asks whether the address
  // answers, and no process check asks that: a page can load in front of a
  // container whose health check has started failing. See `pulse-asks.ts`.
  const read = (_row: ProcessCard, probe: Probe) => probeReading(probe);
  /** Ran and failed. A note (`info`) did neither. */
  const broke = (probe: Probe) => probe.passed === false && !probe.noted;
  const access = records
    .filter((record) => !record.retiredAt)
    .find(
      (record) => record.presentation?.content?.kind === "application-access",
    );

  const head = (
    <PageHead
      bar={chrome.bar}
      title="Processes"
      name={applicationName}
      openUrl={
        story.state === "running" ? (access?.presentation?.url ?? null) : null
      }
      restricted={story.restricted}
      reachable={reachable}
      onReopen={onReopen}
    />
  );

  if (story.state === "none")
    return (
      <div className="ax-root" data-variant="register">
        {head}
        <div className="hv-deploy-none">
          <h2>Nothing here has been looked at yet.</h2>
          <p>
            No record names a process for this application. That is not a claim
            that it runs nothing — only that Hallvi has not checked, or has not
            written down what it found.
          </p>
          <p>
            Once it has, each process appears here with what it runs, how a
            visit reaches it, every check that touched it and when.
          </p>
          <button
            type="button"
            className="hv-primary-button"
            onClick={() =>
              onAsk(
                "What processes is this application running, and is each one healthy right now?",
              )
            }
          >
            Ask Hallvi what is running
          </button>
          <EmptySketch kind="timeline" />
        </div>
      </div>
    );

  const rows: Row[] = story.processes.map((item) => ({
    ...item,
    id: item.name,
  }));
  const probes = rows.flatMap((row) => row.probes);
  const judged = probes.filter((probe) => !probe.noted);
  const failed = probes.filter(broke);
  const unchecked = rows.filter((row) => !row.probes.length);

  const capacity = mebibytes(story.host?.memory);
  const measured = rows
    .map((row) => mebibytes(row.memoryUsed))
    .filter((value): value is number => value !== null);
  const memory = measured.reduce((sum, value) => sum + value, 0);

  const counted = rows
    .map((row) =>
      row.restarts === null || row.restarts === undefined
        ? null
        : Number(row.restarts),
    )
    .filter(
      (value): value is number => value !== null && Number.isFinite(value),
    );
  const restarts = counted.reduce((sum, value) => sum + value, 0);

  const columns: Column<Row>[] = [
    {
      key: "name",
      head: "Process",
      sort: (row) => row.product,
      cell: (row) => (
        <Name
          title={row.product}
          note={row.product === row.name ? undefined : row.name}
        />
      ),
    },
    {
      key: "role",
      head: "Role",
      width: 92,
      sort: (row) => row.role,
      cell: (row) => <Tag>{ROLE_WORD[row.role]}</Tag>,
    },
    {
      key: "image",
      head: "Runs",
      width: 210,
      cell: (row) =>
        row.image === "Not recorded" ? (
          <None />
        ) : (
          <Clip text={row.imageShort} mono />
        ),
    },
    {
      key: "memory",
      head: "Memory",
      width: 150,
      sort: (row) => mebibytes(row.memoryUsed) ?? -1,
      cell: (row) => {
        const used = mebibytes(row.memoryUsed);
        if (!row.memoryUsed) return <None />;
        return used !== null && capacity ? (
          <Bar
            value={used}
            max={capacity}
            tone={used / capacity > 0.8 ? "bad" : "plain"}
            label={row.memoryUsed}
          />
        ) : (
          <Num>{row.memoryUsed}</Num>
        );
      },
    },
    {
      key: "restarts",
      head: "Restarts",
      width: 112,
      align: "end",
      sort: (row) => Number(row.restarts ?? -1),
      cell: (row) =>
        row.restarts === null || row.restarts === undefined ? (
          <None />
        ) : Number(row.restarts) === 0 ? (
          <None>none</None>
        ) : (
          <Num>{row.restarts}</Num>
        ),
    },
    {
      key: "checks",
      head: "Checks",
      width: 96,
      cell: (row) => (
        <Pips
          empty="never checked"
          items={row.probes.map((probe) => ({
            id: probe.name,
            tone: read(row, probe).tone,
            title: `${probe.name}: ${read(row, probe).word}`,
          }))}
        />
      ),
    },
    {
      key: "passed",
      head: "Last passed",
      width: 110,
      align: "end",
      sort: (row) => Date.parse(row.lastPassed ?? "") || 0,
      cell: (row) =>
        row.lastPassed ? <Num>{ago(row.lastPassed, now)}</Num> : <None>—</None>,
    },
  ];

  return (
    <div className="ax-root" data-variant="register">
      {head}
      <div className="hv-rg-sheet">
        <Lede
          holds={`${rows.length} ${rows.length === 1 ? "process" : "processes"}${story.host ? ` on ${story.host.name}` : ""}`}
        >
          Everything long-running that a record names: what it runs, how it is
          reached, and every check that touched it.
        </Lede>

        <Strip>
          <Figure
            label="Processes"
            value={rows.length}
            tone={story.state === "failed" ? "bad" : "plain"}
            note={rows.map((row) => row.product).join(", ")}
          />
          <Figure
            label="Checks"
            value={
              judged.length
                ? `${judged.length - failed.length} of ${judged.length} passed`
                : "None run"
            }
            // Ageing never turns a pass into a warning. Amber is for a look
            // that just came back empty, red for a check that failed.
            tone={failed.length ? "bad" : judged.length ? "good" : "plain"}
            note={
              failed.length
                ? failed.map((probe) => probe.name).join(", ")
                : story.verifiedAt
                  ? `Last passed ${ago(story.verifiedAt, now)}`
                  : "Checked by the deployment, not continuously"
            }
          />
          <Figure
            label="Memory"
            value={measured.length ? `${Math.round(memory)} MiB` : "—"}
            bar={
              measured.length && capacity
                ? { value: memory, max: capacity }
                : undefined
            }
            note={
              measured.length
                ? `Recorded for ${measured.length} of ${rows.length}${story.host?.memory ? ` · the server has ${story.host.memory}` : ""}`
                : "No record carries a memory reading"
            }
          />
          <Figure
            label="Restarts"
            value={counted.length ? restarts : "—"}
            tone={counted.length && restarts > 4 ? "bad" : "plain"}
            note={
              counted.length
                ? `Counted for ${counted.length} of ${rows.length}`
                : "No record counts restarts"
            }
          />
        </Strip>

        <Board
          title="Processes"
          note="A row opens its command and what proves it."
          tools={
            <Ask
              onAsk={onAsk}
              prompt="Check every process of this application now: is each one running, healthy and answering? Record memory use and restarts for each."
            >
              Check them all now
            </Ask>
          }
        >
          <Register
            rows={rows}
            columns={columns}
            tone={(row) =>
              row.probes.some(broke)
                ? "bad"
                : !row.probes.length
                  ? "idle"
                  : "plain"
            }
            defaultOpen={rows.find((row) => row.probes.some(broke))?.id ?? null}
            detail={(row) => {
              const broken = row.probes.find(broke);
              return (
                <Opened
                  asks={
                    <>
                      <Ask
                        onAsk={onAsk}
                        tone={broken ? "bad" : "plain"}
                        prompt={
                          broken
                            ? `The check "${broken.name}" on ${row.name} failed. What is wrong, and what would fix it?`
                            : `Is ${row.name} healthy right now? Check it, and record its memory use and restarts.`
                        }
                      >
                        {broken ? "Why did it fail?" : `Check ${row.name} now`}
                      </Ask>
                      <Ask
                        onAsk={onAsk}
                        prompt={`Restart ${row.name} and tell me what changes.`}
                      >
                        Restart {row.name}
                      </Ask>
                    </>
                  }
                >
                  <Note>
                    {row.roleWords}. {row.reach}.
                  </Note>
                  {row.command && (
                    <pre className="hv-rg-out">{row.command}</pre>
                  )}
                  {row.probes.length ? (
                    <div>
                      <span className="hv-rg-label">What proves it</span>
                      <Sub
                        heads={[
                          "Check",
                          "What was looked at",
                          "From",
                          "When",
                          "Result",
                        ]}
                        rows={row.probes.map((probe) => ({
                          id: probe.name,
                          tone: read(row, probe).tone,
                          cells: [
                            probe.name,
                            probe.probe === probe.name ? (
                              <None key="probe">no detail written down</None>
                            ) : (
                              probe.probe
                            ),
                            probe.inside ? (
                              "inside the server"
                            ) : (
                              <None key="from">—</None>
                            ),
                            <Num key="when">{ago(probe.at, now)}</Num>,
                            <Tag key="result" tone={read(row, probe).tone}>
                              {read(row, probe).word}
                            </Tag>,
                          ],
                        }))}
                      />
                    </div>
                  ) : (
                    <Note>
                      No check has touched this process. It is on record, and
                      nothing says whether it is running.
                    </Note>
                  )}
                  <Facts
                    items={[
                      {
                        label: "Image",
                        value:
                          row.image === "Not recorded" ? (
                            <None />
                          ) : (
                            <span className="hv-rg-mono">{row.image}</span>
                          ),
                      },
                      { label: "Port", value: row.port ?? <None /> },
                      { label: "Health", value: row.health ?? <None /> },
                      { label: "CPU", value: row.cpuUsed ?? <None /> },
                      { label: "Memory", value: row.memoryUsed ?? <None /> },
                      { label: "Restarts", value: row.restarts ?? <None /> },
                    ]}
                  />
                </Opened>
              );
            }}
          />
          <Foot>
            <span>
              {story.entry
                ? `${story.entry.title}. ${story.entry.detail} `
                : ""}
              {unchecked.length ? `${unchecked.length} never checked. ` : ""}
              {/* A gap, not a reading: nothing here watches between visits. */}
              Nothing restarts a process that stops, and only the checks Hallvi
              ran are recorded.
            </span>
          </Foot>
        </Board>

        {story.processChanges.length > 0 && (
          <Board title="Recent changes" note="Records that touched a process.">
            <Register
              rows={story.processChanges}
              columns={[
                {
                  key: "title",
                  head: "What happened",
                  cell: (row) => <Clip text={row.title} />,
                },
                {
                  key: "state",
                  head: "Outcome",
                  width: 110,
                  cell: (row) => (
                    <Tag
                      tone={
                        row.state === "failed"
                          ? "bad"
                          : row.state === "verified"
                            ? "good"
                            : "plain"
                      }
                    >
                      {row.state === "queued" ? "recorded" : row.state}
                    </Tag>
                  ),
                },
                {
                  key: "at",
                  head: "When",
                  width: 110,
                  align: "end",
                  cell: (row) => <Num>{ago(row.at, now)}</Num>,
                },
              ]}
            />
            <Foot>
              <span>The newest five.</span>
              <Go onGo={() => onOpenDestination("history")}>Open History</Go>
            </Foot>
          </Board>
        )}
      </div>
    </div>
  );
}
