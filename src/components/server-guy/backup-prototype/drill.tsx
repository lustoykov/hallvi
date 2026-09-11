"use client";

// PROTOTYPE · opus-ui-improvements · throwaway.
// Direction C, Drill: the page asks "what if" instead of drawing the
// system. Pick a mishap and it answers from the record: what comes back
// and from where, how much you would lose, and which recovery steps anyone
// has actually tried. Storage drills what happens to the volumes; Backups
// drills recovering from the copies. The answer changes in place when you
// pick another; nothing moves on arrival.

import {
  Archive,
  ArrowsClockwise,
  Bug,
  ChatCircleText,
  Check,
  ClockCounterClockwise,
  Fire,
  Gauge,
  Question,
  X,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import type { MascotMood } from "../home/mascot-scene";
import { FRESH_MS } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import { clock, countWord, when } from "../stack-prototype/stack-model";
import type { ProtectDirectionProps } from "./index";
import { lasting, listed, soft } from "./model";
import "./drill.css";

type Back = "kept" | "copy" | "lost" | "unknown";
type Proof = "proven" | "isolated" | "untested" | "fact";
interface Outcome {
  id: string;
  question: string;
  icon: ReactNode;
  verdict: string;
  tone: Tone;
  word: string;
  back: { key: string; label: string; state: Back; note: string }[];
  /** How much would be lost, when a copy is what brings it back. */
  loss: { from: string; words: string } | null;
  /** What to say instead, when nothing written is lost. */
  lossNone: string | null;
  retention: boolean;
  steps: { text: string; proof: Proof }[];
  evidence: { at: string; text: string }[];
  ask: { label: string; draft: string };
}

const moodOf: Record<Tone, MascotMood> = {
  verified: "ready",
  stale: "resting",
  failed: "attention",
  planned: "ready",
  checking: "working",
};
const backIcon: Record<Back, ReactNode> = {
  kept: <Check weight="bold" />,
  copy: <Archive weight="bold" />,
  lost: <X weight="bold" />,
  unknown: <Question weight="bold" />,
};
const proofWords: Record<Proof, string> = {
  proven: "Done before",
  isolated: "Tested in isolation",
  untested: "Not tested",
  fact: "From its settings",
};

export function DrillDirection({
  page,
  story,
  now,
  head,
  activity,
  onAsk,
}: ProtectDirectionProps) {
  const copy = story.copies[0] ?? null;
  const restore = story.restores[0] ?? null;
  const keep = story.protection.keep;
  const fresh = Boolean(copy) && now - Date.parse(copy!.at) < FRESH_MS;
  const since = copy ? lasting(now - Date.parse(copy.at)) : null;
  const covered = story.pieces.filter((piece) => piece.method);
  const db = story.pieces.find((piece) => piece.key.endsWith(":db")) ?? null;
  const n = story.volumes.length;
  const bootUntested = story.checks.some(
    (check) => check.state === "untested" && /Starting/.test(check.label),
  );
  const restoreProof: Proof = restore ? "isolated" : "untested";
  const loss = copy
    ? {
        from: copy.at,
        words: `Up to ${since} of changes: everything since ${when(copy.at)}. Less if scheduled copies ran; none is on record here.`,
      }
    : null;
  const copyEvidence = [
    copy && { at: copy.at, text: copy.detail },
    restore && { at: restore.at, text: restore.detail },
  ].filter((item): item is { at: string; text: string } => Boolean(item));

  const outcomes: Record<string, Outcome> = {
    replace: {
      id: "replace",
      question: "A release replaces the containers",
      icon: <ArrowsClockwise weight="bold" />,
      verdict: story.keptAt
        ? `Nothing is lost. ${n === 1 ? "The volume stays" : n === 2 ? "Both volumes stay" : "Every volume stays"} attached, as ${n === 1 ? "it" : "they"} did ${when(story.keptAt)}.`
        : "Nothing should be lost: volumes stay when containers are replaced. No replacement is on record yet.",
      tone: story.keptAt ? "verified" : "planned",
      word: story.keptAt ? "Nothing lost" : "Expected to keep everything",
      back: story.pieces.map((piece) => ({
        key: piece.key,
        label: piece.label,
        state: "kept",
        note: `stays in ${piece.volume}`,
      })),
      loss: null,
      lossNone: "Nothing: the data never leaves its volumes.",
      retention: false,
      steps: [
        {
          text: "Recreate the containers from the same images and attach the volumes again.",
          proof: story.keptAt ? "proven" : "untested",
        },
        {
          text: "Run the deployment's checks again, the database check included.",
          proof: story.keptAt ? "proven" : "untested",
        },
      ],
      evidence: story.keptAt
        ? [{ at: story.keptAt, text: story.keptDetail ?? "" }]
        : [],
      ask: {
        label: "Ask Server Guy to check the volumes",
        draft:
          "Check that every volume is attached and healthy after the last release.",
      },
    },
    lost: {
      id: "lost",
      question: "The server is lost",
      icon: <Fire weight="bold" />,
      verdict: copy
        ? `You'd get back ${listed(covered.map((piece) => soft(piece.label)))} from the copy of ${when(copy.at)}, and lose what changed since.`
        : "Everything on it would be lost: no copy off the server is on record.",
      tone: copy ? (fresh ? "verified" : "stale") : "failed",
      word: copy ? `Up to ${since} lost` : "All lost",
      back: story.pieces.map((piece) =>
        piece.method && copy
          ? {
              key: piece.key,
              label: piece.label,
              state: "copy",
              note: `from the copy of ${when(copy.at)}`,
            }
          : {
              key: piece.key,
              label: piece.label,
              state: "lost",
              note: piece.method
                ? "no copy on record"
                : "not in the backup plan",
            },
      ),
      loss,
      lossNone: null,
      retention: false,
      steps: [
        {
          text: "Create a new server and deploy the same images from the record.",
          proof: "untested",
        },
        {
          text: "Download the newest copy and restore it there.",
          proof: restoreProof,
        },
        {
          text: "Start the application on the restored data and run its checks.",
          proof: bootUntested || !restore ? "untested" : "isolated",
        },
        {
          text: "Switch production over to the new server.",
          proof: "untested",
        },
      ],
      evidence: copyEvidence,
      ask: {
        label: "Ask Server Guy to rehearse it",
        draft:
          "Rehearse recovering from a lost server: restore the newest copy somewhere isolated, start the application on it, and report what worked.",
      },
    },
    older: {
      id: "older",
      question: "You need an older copy",
      icon: <ClockCounterClockwise weight="bold" />,
      verdict:
        story.copies.length > 1
          ? `${countWord(story.copies.length)} copies are on record; the oldest is from ${when(story.copies.at(-1)!.at)}.`
          : copy
            ? `Only one copy is on record, from ${when(copy.at)}.${keep ? ` The schedule keeps up to ${keep}; the others aren't on record here.` : ""}`
            : "No copy is on record.",
      tone: copy ? "stale" : "failed",
      word: `${story.copies.length}${keep ? ` of ${keep}` : ""} on record`,
      back: [],
      loss: null,
      lossNone: null,
      retention: true,
      steps: [
        {
          text: "List the copies the host has kept, with their dates.",
          proof: "untested",
        },
        {
          text: "Restore the one you need somewhere isolated and compare it.",
          proof: restoreProof,
        },
      ],
      evidence: [
        ...story.schedules
          .slice(0, 1)
          .map((item) => ({ at: item.at, text: item.detail })),
        ...copyEvidence.slice(0, 1),
      ],
      ask: {
        label: "Ask Server Guy to list the copies",
        draft:
          "List the backup copies kept off the server, with their dates and sizes.",
      },
    },
    full: {
      id: "full",
      question: "The disk fills up",
      icon: <Gauge weight="bold" />,
      verdict: story.disk
        ? `The disk has ${Math.max(0, story.disk.totalGb - story.disk.usedGb)} GB left, measured ${when(story.disk.measuredAt)}.`
        : "You wouldn't see it coming: nothing measures the disk or the volumes.",
      tone: "planned",
      word: story.disk ? "Measured" : "Not measured",
      back: story.pieces.map((piece) => ({
        key: piece.key,
        label: piece.label,
        state: "unknown",
        note: "stays, but new writes would fail",
      })),
      loss: null,
      lossNone: "Nothing already written, but new data couldn't be saved.",
      retention: false,
      steps: [
        {
          text: "Measure each volume and the server's disk.",
          proof: "untested",
        },
        ...story.volumes
          .filter((volume) => volume.note)
          .map((volume) => ({
            text: `${volume.owner} ${volume.note!.replace(/^keeps/, "keeps only")} of data, which limits how much ${volume.name} grows.`,
            proof: "fact" as const,
          })),
        { text: "Warn you before the disk fills.", proof: "untested" },
      ],
      evidence: [],
      ask: {
        label: "Ask Server Guy to measure them",
        draft:
          "Measure how much space each volume and the server's disk use, and warn me before it fills.",
      },
    },
  };
  if (db)
    outcomes.corrupt = {
      id: "corrupt",
      question: `${db.label} gets corrupted`,
      icon: <Bug weight="bold" />,
      verdict:
        copy && db.method
          ? `You'd restore ${db.label} from the copy of ${when(copy.at)} and lose what changed in it since. Server Guy wouldn't notice on its own.`
          : `${db.label} has no copy on record to restore from.`,
      tone: copy && db.method ? "stale" : "failed",
      word: copy && db.method ? `Up to ${since} lost` : "Not covered",
      back: story.pieces.map((piece) =>
        piece.key === db.key
          ? {
              key: piece.key,
              label: piece.label,
              state: copy && db.method ? "copy" : "lost",
              note:
                copy && db.method
                  ? `from the copy of ${when(copy.at)}`
                  : "no copy on record",
            }
          : {
              key: piece.key,
              label: piece.label,
              state: "kept",
              note: "unaffected",
            },
      ),
      loss: copy && db.method ? loss : null,
      lossNone: null,
      retention: false,
      steps: [
        {
          text: "Notice it. The database check runs only during deployments, so nothing watches it now.",
          proof: "untested",
        },
        {
          text: `Stop ${db.owner} and restore ${db.label} from the newest copy.`,
          proof: restoreProof,
        },
        {
          text: `Start ${db.owner} and run the database check.`,
          proof: "untested",
        },
      ],
      evidence: copyEvidence,
      ask: {
        label: "Ask Server Guy to watch it",
        draft: `Watch ${db.owner}'s database health continuously and tell me when it fails.`,
      },
    };

  const order = (
    page === "storage"
      ? ["replace", "lost", "full"]
      : ["lost", "corrupt", "older"]
  ).filter((id) => outcomes[id]);
  const [picked, setPicked] = useState(order[0]);
  // Only a change you make animates the answer; the first one is simply there.
  const [changed, setChanged] = useState(false);
  const outcome = outcomes[picked] ?? outcomes[order[0]];

  return (
    <section
      className="axbd"
      aria-label={page === "storage" ? "Storage" : "Backups"}
    >
      {head}
      {activity}
      <div className="axbd-body">
        <nav className="axbd-picks" aria-label="What if">
          {order.map((id) => {
            const item = outcomes[id];
            return (
              <button
                key={id}
                type="button"
                className="axbd-pick"
                data-tone={item.tone}
                aria-pressed={id === outcome.id}
                onClick={() => {
                  setPicked(id);
                  setChanged(true);
                }}
              >
                <span className="axbd-pick-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <b>{item.question}</b>
                <small>{item.word}</small>
              </button>
            );
          })}
          <p className="axbd-picks-note">
            Every answer comes from the record; nothing is run.
          </p>
        </nav>

        <article
          key={outcome.id}
          className="axbd-result"
          data-changed={changed || undefined}
          aria-live="polite"
        >
          <header className="axbd-top">
            <LittleServer mood={moodOf[outcome.tone]} className="axbd-guy" />
            <div>
              <h2 className="axbd-verdict">{outcome.verdict}</h2>
              <p className="axbd-sure">
                <Tag tone={outcome.tone}>{outcome.word}</Tag>
              </p>
            </div>
          </header>

          <div className="axbd-cols">
            {outcome.back.length > 0 && (
              <section>
                <h3>What comes back</h3>
                <ul className="axbd-back">
                  {outcome.back.map((item) => (
                    <li key={item.key} data-state={item.state}>
                      <span className="axbd-state" aria-hidden="true">
                        {backIcon[item.state]}
                      </span>
                      <span>
                        <b>{item.label}</b>
                        <small>{item.note}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {outcome.retention && keep && (
              <section>
                <h3>Copies kept</h3>
                <span
                  className="axbd-tiles"
                  aria-label={`${story.copies.length} of ${keep} on record`}
                >
                  {Array.from({ length: keep }, (_, index) => (
                    <i
                      key={index}
                      data-on={index < story.copies.length || undefined}
                    />
                  ))}
                </span>
                <p className="axbd-none">
                  {story.copies.length} on record. The rest may exist on the
                  host; they aren&apos;t on record here.
                </p>
              </section>
            )}
            {(outcome.loss || outcome.lossNone) && (
              <section>
                <h3>What you&apos;d lose</h3>
                {outcome.loss ? (
                  <div className="axbd-loss">
                    <div className="axbd-loss-bar" aria-hidden="true" />
                    <div className="axbd-loss-ends">
                      <span>
                        {when(outcome.loss.from)}
                        <small>newest copy</small>
                      </span>
                      <span>
                        {clock(new Date(now).toISOString())}
                        <small>now</small>
                      </span>
                    </div>
                    <p>{outcome.loss.words}</p>
                  </div>
                ) : (
                  <p className="axbd-none">{outcome.lossNone}</p>
                )}
              </section>
            )}
          </div>

          <section>
            <h3>What Server Guy would do</h3>
            <ol className="axbd-steps">
              {outcome.steps.map((step) => (
                <li key={step.text}>
                  <span>{step.text}</span>
                  <em className="axbd-proof" data-proof={step.proof}>
                    {proofWords[step.proof]}
                  </em>
                </li>
              ))}
            </ol>
          </section>

          {outcome.evidence.length > 0 && (
            <section className="axbd-evidence">
              <h3>On record</h3>
              <ul>
                {outcome.evidence.map((item) => (
                  <li key={item.at}>
                    <time>{when(item.at)}</time>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <button
            type="button"
            className="ax-button axbd-ask"
            onClick={() => onAsk(outcome.ask.draft)}
          >
            <ChatCircleText weight="bold" />
            {outcome.ask.label}
          </button>
        </article>
      </div>
    </section>
  );
}
