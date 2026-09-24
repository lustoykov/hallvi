"use client";

// Storage, on real records.
//
// One question: what is on disk, and does it survive the container being
// replaced. Whether it survives losing the server is Backups' question, and
// the protection line at the top is all this page says about it.
//
// Its empty state is the one the old page got wrong: it printed a confident
// "no volumes" from a model nothing populated, which is the most expensive
// kind of wrong — a container without a volume loses its data when it is
// replaced, and a reader who was told there were none had been told the
// opposite of "nobody checked".

import { useMemo } from "react";

import type { SavedInformation } from "@/server/operator-data";

import type { ApplicationSection } from "./application-sections";
import type { Vol } from "./backup-prototype/protect-story";
import { protectionFromRecords, protectionVerdict } from "./backups-records";
import type { PageChrome } from "./deployment-prototype/page-head";
import { PageHead, type Reachability } from "./deployment-prototype/page-head";
import { EmptySketch } from "./empty-sketch";
import { ProtectionLine } from "./protection-line";
import {
  Ask,
  Board,
  Clip,
  Facts,
  Figure,
  Lede,
  Name,
  None,
  Num,
  Opened,
  Register,
  Strip,
  Tag,
  ago,
  type Column,
} from "./register";
import { storageFromRecords, volumeName } from "./storage-records";

type Row = Vol & { id: string };

const size = (row: Vol) =>
  row.sizeText ?? (row.sizeGb === null ? null : `${row.sizeGb.toFixed(1)} GB`);

export function StoragePage({
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
  const story = useMemo(
    () => storageFromRecords({ records, applicationId, now }),
    [records, applicationId, now],
  );
  const protection = useMemo(
    () => protectionFromRecords(records, now, applicationId),
    [records, now, applicationId],
  );
  const verdict = useMemo(
    () => protectionVerdict(protection, now),
    [protection, now],
  );

  const head = (
    <PageHead
      bar={chrome.bar}
      title="Storage"
      name={applicationName}
      openUrl={null}
      restricted={false}
      reachable={reachable}
      onReopen={onReopen}
    />
  );

  // Nothing on disk is nothing to protect, so the line stays away: a young
  // application meets one offer here, not two.
  if (!story.volumes.length)
    return (
      <div className="ax-root" data-variant="register">
        {head}
        <div className="hv-deploy-none">
          <h2>Nothing here has been looked at yet.</h2>
          <p>
            No record names a volume for this application. That is not a claim
            that it stores nothing, and it is not a claim that it stores nothing
            durably — it means Hallvi has not checked which of the two is true.
          </p>
          <p>
            It matters: a container with no volume loses everything it wrote the
            moment it is replaced, and a container with one does not. Only a
            check can tell them apart.
          </p>
          <button
            type="button"
            className="hv-primary-button"
            onClick={() =>
              onAsk(
                "Where does this application keep data that has to survive the container being replaced, and does it actually survive?",
              )
            }
          >
            Ask Hallvi what is on disk
          </button>
          <EmptySketch kind="flow" />
        </div>
      </div>
    );

  const rows: Row[] = story.volumes.map((volume) => ({
    ...volume,
    id: volume.name,
  }));
  const measured = rows.filter((row) => size(row));
  // One volume that came through a replacement says nothing about the one
  // beside it that has never been through one. The figure reports the
  // subset that was tested rather than a blanket yes.
  const lost = rows.filter((row) => row.lostAt);
  const kept = rows.filter((row) => row.keptAt && !row.lostAt);
  const untested = rows.filter((row) => !row.keptAt && !row.lostAt);
  const newestKept =
    kept
      .map((row) => row.keptAt!)
      .sort()
      .at(-1) ?? null;

  const columns: Column<Row>[] = [
    {
      key: "volume",
      head: "Volume",
      sort: (row) => row.name,
      cell: (row) => <Name title={volumeName(row)} note={row.name} />,
    },
    {
      key: "mount",
      head: "Where it is mounted",
      cell: (row) => (row.mount ? <Clip text={row.mount} mono /> : <None />),
    },
    {
      key: "size",
      head: "Size",
      width: 116,
      align: "end",
      sort: (row) => row.sizeGb ?? -1,
      cell: (row) => {
        const text = size(row);
        return text ? <Num>{text}</Num> : <None>not measured</None>;
      },
    },
    {
      key: "kept",
      head: "Survives replacement",
      width: 180,
      cell: (row) =>
        row.lostAt ? (
          <Tag tone="bad">lost {ago(row.lostAt, now)}</Tag>
        ) : row.keptAt ? (
          <Tag tone="good">kept {ago(row.keptAt, now)}</Tag>
        ) : (
          <None>never tested</None>
        ),
    },
  ];

  return (
    <div className="ax-root" data-variant="register">
      {head}
      <ProtectionLine
        protection={protection}
        verdict={verdict}
        now={now}
        onOpenBackups={() => onOpenDestination("backups")}
      />
      <div className="hv-rg-sheet">
        <Lede
          holds={`${rows.length} ${rows.length === 1 ? "volume" : "volumes"}`}
        >
          Everything {applicationName} writes that outlives the container it
          runs in.
        </Lede>

        <Strip>
          <Figure
            label="Volumes"
            value={rows.length}
            note={rows.map(volumeName).join(", ")}
          />
          <Figure
            label="Measured"
            value={
              measured.length ? `${measured.length} of ${rows.length}` : "None"
            }
            note={
              measured.length
                ? "A size is only as good as the day it was read."
                : "No record carries a size."
            }
          />
          <Figure
            label="Survives replacement"
            value={
              lost.length
                ? `${lost.length} of ${rows.length} did not`
                : !kept.length
                  ? "Not checked"
                  : untested.length
                    ? `${kept.length} of ${rows.length} kept`
                    : "Yes"
            }
            tone={
              lost.length
                ? "bad"
                : untested.length || !kept.length
                  ? "plain"
                  : "good"
            }
            note={
              lost.length
                ? `${lost.map(volumeName).join(", ")} did not come through one.`
                : !kept.length
                  ? "Nothing has replaced a container and looked afterwards."
                  : untested.length
                    ? `Came through a replacement ${ago(newestKept, now)}. Not tested: ${untested.map(volumeName).join(", ")}.`
                    : `Came through a replacement ${ago(newestKept, now)}`
            }
          />
        </Strip>

        <Board title="Volumes" note="A row opens what is inside it.">
          <Register
            rows={rows}
            columns={columns}
            label={(row) => row.name}
            tone={(row) => (row.lostAt ? "bad" : row.keptAt ? "plain" : "idle")}
            defaultOpen={rows.length === 1 ? rows[0].id : null}
            empty="No record names a volume for this application. That is not a claim that it stores nothing."
            detail={(row) => (
              <Opened
                asks={
                  <Ask
                    onAsk={onAsk}
                    prompt={`Measure ${row.name} now and record its size, and say what inside it is taking the space.`}
                  >
                    Measure it
                  </Ask>
                }
              >
                <Facts
                  items={[
                    {
                      label: "Holds",
                      value: row.pieces.length ? (
                        row.pieces.map((piece) => piece.label).join(", ")
                      ) : (
                        <None>nobody has looked inside</None>
                      ),
                    },
                    { label: "Mounted at", value: row.mount || <None /> },
                    {
                      label: "Docker name",
                      value: row.docker ? (
                        <span className="hv-rg-mono">{row.docker}</span>
                      ) : (
                        <None />
                      ),
                    },
                    {
                      label: "Owner",
                      value: row.ownerName || row.owner || <None />,
                    },
                    {
                      label: "Measured",
                      value: row.measuredAt ? (
                        ago(row.measuredAt, now)
                      ) : (
                        <None>never</None>
                      ),
                    },
                    {
                      label: "Noted",
                      value: row.note ?? <None>nothing noted</None>,
                    },
                  ]}
                />
              </Opened>
            )}
          />
        </Board>
      </div>
    </div>
  );
}
