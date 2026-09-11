"use client";

// PROTOTYPE · opus-ui-improvements · throwaway.
// Direction C, Answers: the questions you come to these pages with, each
// answered in a sentence, with the dated record behind it and the exact
// values a click away. Storage adds what survives what: each volume against
// a container replacement and against losing the server. No diagram here;
// Little Server gives the short answer first.

import {
  Archive,
  CaretDown,
  ChatCircleText,
  Check,
  WarningCircle,
} from "@phosphor-icons/react";
import { Fragment, useState, type ReactNode } from "react";

import type { MascotMood } from "../home/mascot-scene";
import { FRESH_MS } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import { ago, clock, countWord, when } from "../stack-prototype/stack-model";
import type { DataVolume } from "./data-model";
import type { DataDirectionProps } from "./index";
import "./answers.css";

const moodOf: Record<Tone, MascotMood> = {
  verified: "ready",
  stale: "resting",
  failed: "attention",
  planned: "ready",
  checking: "working",
};
const day = (at: string) =>
  new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
const glyph: Record<string, string> = { pass: "✓", fail: "✗", set: "›" };

interface Answer {
  id: string;
  question: string;
  answer: ReactNode;
  tag: { tone: Tone; text: string } | null;
  proof: ReactNode;
  /** More in words, under the proof: a schedule, or the survival grid. */
  extra: ReactNode;
  caption?: string;
  exact: { label: string; value: string; mono?: boolean }[];
  lines: { at: string; tone: string; text: string }[];
  action: { label: string; run: () => void } | null;
}

/** What the backup plan copies from a volume, in a few words. */
const planWords = (volume: DataVolume) =>
  volume.plan
    ? `${volume.plan.whole ? "The whole volume" : `${volume.database ?? "The database"} only`}, as a ${volume.plan.method}`
    : "Not in the backup plan";

export function AnswersDirection({
  page,
  story,
  now,
  head,
  activity,
  onAsk,
  onOpenDestination,
}: DataDirectionProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const store = story.database;
  const guard = story.protection;
  const copyAt = story.newestCopyAt;
  const n = story.volumes.length;
  const toneOf = (at: string): Tone =>
    now - Date.parse(at) < FRESH_MS ? "verified" : "stale";
  const measure = {
    label: "Ask Server Guy to measure them",
    draft: "Measure how much space each volume and the server's disk use.",
  };
  const answers: Answer[] = [];
  let say: string;
  let ask = measure;

  if (page === "database" && store) {
    const file = store.file?.split("/").at(-1) ?? null;
    const home = story.volumes.find((item) => item.database);
    const checked = store.probe?.at ?? null;
    const failure = store.firstFailure;
    say =
      checked && copyAt
        ? `Healthy and copied off the server, as of ${day(checked > copyAt ? checked : copyAt)}.`
        : checked
          ? `Healthy as of ${day(checked)}, with no copy off the server.`
          : copyAt
            ? `Copied off the server as of ${day(copyAt)}; nothing checks its health.`
            : "Nothing checks it, and no copy is off the server.";
    ask = {
      label: "Ask Server Guy to back it up now",
      draft: `Back up ${store.owner}'s database now and verify the copy.`,
    };
    answers.push(
      {
        id: "where",
        question: `Where does ${store.owner} keep its data?`,
        answer:
          store.kind === "sqlite" && file ? (
            <>
              In one SQLite file, <code>{file}</code>
              {home && (
                <>
                  , on the <code>{home.name}</code> volume
                </>
              )}
              .
            </>
          ) : (
            <>In {store.label}.</>
          ),
        tag: null,
        proof: story.createdAt
          ? `Recorded when it was deployed, ${when(story.createdAt)}.`
          : "Recorded by the deployment.",
        extra: null,
        exact: [
          ...(store.file
            ? [{ label: "Path", value: store.file, mono: true }]
            : []),
          ...(home
            ? [
                { label: "Volume", value: home.name, mono: true },
                ...(home.docker
                  ? [{ label: "Docker name", value: home.docker, mono: true }]
                  : []),
                { label: "Mounted at", value: home.mount, mono: true },
              ]
            : []),
        ],
        lines: [],
        action: null,
      },
      {
        id: "health",
        question: "Is it healthy?",
        answer: checked
          ? `Yes, at its last check, ${when(checked)}.${failure && failure.at < checked ? ` It failed once during a deployment, at ${clock(failure.at)}, and passed the next check.` : ""}`
          : "Nothing checks it yet.",
        tag: checked
          ? { tone: toneOf(checked), text: `Healthy ${ago(checked, now)}` }
          : { tone: "planned", text: "Not checked" },
        proof: store.probe ? (
          <>
            {store.owner} reported it through “{store.probe.name}”, from your
            network. A recorded check, not continuous monitoring.
          </>
        ) : null,
        extra: null,
        exact: store.probe
          ? [{ label: "Check", value: store.probe.probe, mono: true }]
          : [],
        lines: story.marks
          .filter((mark) => mark.lane === "health")
          .map((mark) => ({
            at: mark.at,
            tone: mark.tone,
            text: mark.tone === "fail" ? mark.detail : `Passed: ${mark.title}`,
          })),
        action: {
          label: "Ask Server Guy to check it now",
          run: () =>
            onAsk(`Check that ${store.owner}'s database is healthy now.`),
        },
      },
      {
        id: "copy",
        question: "Is there a copy off the server?",
        answer: guard.backup
          ? `Yes. The newest on record is from ${when(guard.backup.at)}.`
          : "No copy is on record.",
        tag: guard.backup
          ? {
              tone: toneOf(guard.backup.at),
              text: `Copied ${ago(guard.backup.at, now)}`,
            }
          : { tone: "planned", text: "None on record" },
        proof: guard.backup?.detail ?? null,
        extra: guard.schedule ? (
          <p>
            {guard.schedule.words}, set up {when(guard.schedule.at)}. Newer
            copies may exist; none is on record here.
          </p>
        ) : (
          <p>Backups aren&apos;t scheduled.</p>
        ),
        caption: "What the backup plan copies",
        exact: story.volumes.map((volume) => ({
          label: volume.name,
          value: planWords(volume),
        })),
        lines: story.marks
          .filter((mark) => mark.lane === "copies")
          .map((mark) => ({ at: mark.at, tone: mark.tone, text: mark.title })),
        action: guard.backup
          ? { label: "Open Backups", run: () => onOpenDestination("backups") }
          : {
              label: "Ask Server Guy to set up backups",
              run: () =>
                onAsk(
                  `Set up daily backups of ${store.owner}'s data off the server.`,
                ),
            },
      },
      {
        id: "restore",
        question: "Would a restore work?",
        answer: guard.restore
          ? `${/not tested/i.test(guard.restore.detail) ? "Partly proven." : "Yes."} A restore test passed ${when(guard.restore.at)}.`
          : "Not proven: no restore test is on record.",
        tag: guard.restore
          ? {
              tone: toneOf(guard.restore.at),
              text: `Tested ${ago(guard.restore.at, now)}`,
            }
          : { tone: "planned", text: "Not tested" },
        proof: guard.restore?.detail ?? null,
        extra: null,
        exact: [],
        lines: [],
        action: guard.restore
          ? null
          : {
              label: "Ask Server Guy to test a restore",
              run: () =>
                onAsk(
                  `Test restoring ${store.owner}'s database from the newest copy, somewhere isolated.`,
                ),
            },
      },
      {
        id: "users",
        question: "What else uses it?",
        answer: (
          <>
            Nothing else. Only {store.owner}, the <code>{store.ownerName}</code>{" "}
            process, opens it.
          </>
        ),
        tag: null,
        proof: story.files.length ? (
          <>
            {story.files
              .map(
                (item) => `${item.owner} keeps its own files on ${item.name}`,
              )
              .join("; ")}
            .{" "}
            <button
              type="button"
              className="ax-textlink"
              onClick={() => onOpenDestination("storage")}
            >
              Open Storage
            </button>
          </>
        ) : null,
        extra: null,
        exact: [],
        lines: [],
        action: null,
      },
      ...(story.dataGaps.some((gap) => gap.id === "size")
        ? [
            {
              id: "size",
              question: "How big is it?",
              answer: "Not measured yet.",
              tag: { tone: "planned" as Tone, text: "Not measured" },
              proof: "Its size and growth aren't recorded.",
              extra: null,
              exact: [],
              lines: [],
              action: {
                label: "Ask Server Guy to measure it",
                run: () =>
                  onAsk(
                    `Measure the size of ${store.owner}'s database and how fast it grows.`,
                  ),
              },
            },
          ]
        : []),
    );
  } else {
    const kept = story.keptAt;
    say = kept
      ? `${countWord(n)} ${n === 1 ? "volume, kept" : n === 2 ? "volumes, both kept" : "volumes, all kept"} through a container replacement.`
      : `${countWord(n)} ${n === 1 ? "volume" : "volumes"}, not replaced yet.`;
    const measured = story.volumes.filter((item) => item.sizeGb != null);
    answers.push(
      {
        id: "what",
        question: "What keeps data on this server?",
        answer: (
          <>
            {countWord(n)} {n === 1 ? "volume" : "volumes"}:{" "}
            {story.volumes.map((volume, index) => (
              <Fragment key={volume.name}>
                {index > 0 && "; "}
                <code>{volume.name}</code> holds {volume.holds}
                {volume.note ? ` (${volume.note})` : ""}
              </Fragment>
            ))}
            .
          </>
        ),
        tag: null,
        proof: story.createdAt
          ? `Created with the deployment, ${when(story.createdAt)}.`
          : "Recorded by the deployment.",
        extra: null,
        exact: story.volumes.map((volume) => ({
          label: volume.name,
          value: `${volume.mount}${volume.docker ? ` · ${volume.docker}` : ""} · used by ${volume.ownerName}`,
          mono: true,
        })),
        lines: [],
        action: null,
      },
      {
        id: "survives",
        question: "What survives what?",
        answer: `A container replacement keeps ${n === 1 ? "the volume" : n === 2 ? "both volumes" : "every volume"}; losing the server keeps only what was copied off it.`,
        tag: null,
        proof:
          "From the recorded replacement and the backup plan. The record doesn't list what each copy holds.",
        extra: (
          <div className="axan-grid-wrap">
            <table className="axan-grid">
              <thead>
                <tr>
                  <th scope="col">Volume</th>
                  <th scope="col">If the containers are replaced</th>
                  <th scope="col">If the server is lost</th>
                </tr>
              </thead>
              <tbody>
                {story.volumes.map((volume) => (
                  <tr key={volume.name}>
                    <th scope="row">
                      <code>{volume.name}</code>
                      <small>{volume.owner}</small>
                    </th>
                    <td>
                      <span className="axan-cell" data-state="kept">
                        <Check weight="bold" aria-hidden="true" />
                        <span>
                          {kept
                            ? `Kept, proven ${when(kept)}`
                            : "Kept: named volumes stay"}
                        </span>
                      </span>
                    </td>
                    <td>
                      {volume.plan && copyAt ? (
                        <span
                          className="axan-cell"
                          data-state="copy"
                          data-tone={toneOf(copyAt)}
                        >
                          <Archive weight="bold" aria-hidden="true" />
                          <span>
                            {volume.plan.whole
                              ? "All of it"
                              : `Only ${volume.database ?? "the database"}`}
                            , from the copy of {when(copyAt)}
                          </span>
                        </span>
                      ) : (
                        <span className="axan-cell" data-state="lost">
                          <WarningCircle weight="bold" aria-hidden="true" />
                          <span>
                            {volume.plan
                              ? "Lost: no copy on record yet"
                              : "Lost: not in the backup plan"}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ),
        caption: "What the backup plan copies",
        exact: story.volumes.map((volume) => ({
          label: volume.name,
          value: planWords(volume),
        })),
        lines: [],
        action: copyAt
          ? { label: "Open Backups", run: () => onOpenDestination("backups") }
          : null,
      },
      {
        id: "room",
        question: "How much room do they take?",
        answer:
          measured.length === n && n > 0
            ? measured
                .map((volume) => `${volume.name}: ${volume.sizeGb} GB`)
                .join(", ")
            : story.disk
              ? `The volumes aren't measured; the server's disk has ${story.disk.usedGb} of ${story.disk.totalGb} GB used.`
              : "Not measured yet: neither the volumes nor the server's disk.",
        tag:
          measured.length === n && n > 0
            ? null
            : { tone: "planned", text: "Not measured" },
        proof: "Size and growth appear here once Server Guy measures them.",
        extra: null,
        exact: [],
        lines: [],
        action: {
          label: measure.label,
          run: () => onAsk(measure.draft),
        },
      },
      {
        id: "reset",
        question: "Have they ever been reset?",
        answer: kept
          ? `Not on record. ${n === 1 ? "It was" : n === 2 ? "Both were" : "They were"} created with the deployment${story.createdAt ? ` on ${when(story.createdAt)}` : ""} and kept when the containers were recreated at ${clock(kept)}.`
          : `Not on record. ${n === 1 ? "It was" : "They were"} created with the deployment${story.createdAt ? ` on ${when(story.createdAt)}` : ""}.`,
        tag: null,
        proof: story.keptDetail,
        extra: null,
        exact: [],
        lines: story.marks
          .filter((mark) => mark.lane.startsWith("volume:"))
          .map((mark) => ({
            at: mark.at,
            tone: mark.tone,
            text: `${mark.lane.slice("volume:".length)}: ${mark.title}`,
          })),
        action: {
          label: "Open History",
          run: () => onOpenDestination("history"),
        },
      },
    );
  }

  return (
    <section
      className="axan"
      aria-label={page === "database" ? "Database" : "Storage"}
    >
      {head}
      {activity}
      <div className="axan-lede">
        <LittleServer mood={moodOf[story.tone]} className="axan-guy" />
        <h2 className="axan-say">{say}</h2>
        <button
          type="button"
          className="ax-button axan-ask"
          onClick={() => onAsk(ask.draft)}
        >
          <ChatCircleText weight="bold" />
          {ask.label}
        </button>
      </div>

      <dl className="axan-list">
        {answers.map((item) => {
          const more = item.exact.length > 0 || item.lines.length > 0;
          const shown = Boolean(open[item.id]);
          return (
            <div key={item.id} className="axan-row">
              <dt className="axan-q">{item.question}</dt>
              <dd className="axan-a">
                <p className="axan-answer">{item.answer}</p>
                {(item.tag || item.proof) && (
                  <p className="axan-proof">
                    {item.tag && (
                      <Tag tone={item.tag.tone}>{item.tag.text}</Tag>
                    )}
                    {item.proof && <span>{item.proof}</span>}
                  </p>
                )}
                {item.extra && <div className="axan-extra">{item.extra}</div>}
                {(more || item.action) && (
                  <div className="axan-tools">
                    {more && (
                      <button
                        type="button"
                        className="axan-more"
                        aria-expanded={shown}
                        onClick={() =>
                          setOpen((value) => ({
                            ...value,
                            [item.id]: !value[item.id],
                          }))
                        }
                      >
                        {shown ? "Hide the exact values" : "Exact values"}
                        <CaretDown weight="bold" aria-hidden="true" />
                      </button>
                    )}
                    {item.action && (
                      <button
                        type="button"
                        className="ax-textlink"
                        onClick={item.action.run}
                      >
                        {item.action.label}
                      </button>
                    )}
                  </div>
                )}
                {shown && (
                  <div className="axan-exact">
                    {item.caption && item.exact.length > 0 && (
                      <p>{item.caption}</p>
                    )}
                    {item.exact.length > 0 && (
                      <dl>
                        {item.exact.map((row) => (
                          <div key={row.label}>
                            <dt>{row.label}</dt>
                            <dd className={row.mono ? "ax-mono" : undefined}>
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {item.lines.length > 0 && (
                      <div className="axan-lines" role="log">
                        {item.lines.map((line, index) => (
                          <div key={index} data-tone={line.tone}>
                            <time>{when(line.at)}</time>
                            <b aria-hidden="true">{glyph[line.tone] ?? "·"}</b>
                            <span>{line.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
