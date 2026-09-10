"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Direction B, Little Server's note: how it is doing, in its own words. A
// short, calm note where each fact is a phrase you can open for its
// evidence, signed by Little Server, with its console folded underneath.

import { ArrowsClockwise, CaretDown, ChatCircleText, SpinnerGap } from "@phosphor-icons/react";
import { Fragment, useCallback, useRef, useState } from "react";

import { ago, type ArchitectureModel, type Certainty, type LiveRecord } from "../architecture-prototype/model";
import type { HeroProps } from "./hero";
import type { Vital } from "./overview-model";
import { NeedCard, useCountdown, useDismiss, VitalPop, whenWords } from "./shared";
import { Mascot, useServerGuy } from "./use-server-guy";
import "./note.css";

type Piece = string | { vital: Vital["id"]; text: string; c?: Certainty } | { countdown: true };

const HOUR = 3_600_000;
const glyph = { pass: "✓", fail: "✗", work: "›", info: "·" } as const;
/** The part on the map each phrase is about. */
const partOf: Record<Vital["id"], string> = {
  checks: "app",
  backups: "offsite",
  server: "host",
  access: "gate:http",
};

function lastNight(at: string, now: number) {
  const ms = now - Date.parse(at);
  if (ms < 0 || ms > 24 * HOUR) return false;
  const hour = new Date(at).getHours();
  return hour >= 18 || hour < 7;
}

/** The note, as paragraphs of words and phrases that open their evidence. */
function writeNote(
  model: ArchitectureModel,
  record: LiveRecord,
  vitals: Record<Vital["id"], Vital>,
  needs: boolean,
): Piece[][] {
  const now = model.now;
  const name = model.headline;
  const app = model.byId.app;
  const host = model.byId.host;
  const offsite = model.byId.offsite;
  const service = model.parts.find((part) => part.kind === "private");
  const failed = model.parts.find((part) => part.evidence.certainty === "failed");
  const names = [app, service].filter(Boolean).map((part) => part!.name);
  const answered = names.length > 1 ? `${names.join(" and ")} both answered` : `${names[0] ?? name} answered`;
  const hostAnswered: Piece = { vital: "server", text: `answered me ${ago(host?.evidence.at ?? null, now)}` };

  if (model.status !== "live") {
    const city = model.region?.split(",")[0];
    return [
      [
        `Nothing runs yet. Once you approve the plan, I'll set up ${name} on `,
        { vital: "server", text: `a ${host?.name ?? "server"}${city ? ` in ${city}` : ""}` },
        `, check that ${names.length > 1 ? "both answer" : "it answers"}, and look after it from your network.`,
      ],
    ];
  }

  const paragraphs: Piece[][] = [];
  const first: Piece[] = [];
  const at = app?.evidence.at;
  if (needs) {
    if (failed && failed.id !== "host" && host?.evidence.certainty === "verified")
      first.push("The server itself ", hostAnswered, `, so it's ${failed.name}, not the machine.`);
  } else if (at && app?.evidence.certainty === "stale") {
    first.push(
      "When I last checked, ",
      { vital: "checks", text: whenWords(at, now) },
      `, ${answered}. I haven't looked since, so that may have changed.`,
    );
    if (host?.evidence.certainty === "verified") first.push(" The server itself ", hostAnswered, ".");
  } else if (at) {
    first.push("When I checked ", { vital: "checks", text: whenWords(at, now) }, `, ${answered}.`);
    if (host?.evidence.certainty === "verified") first.push(" The server ", hostAnswered, ".");
  }
  if (first.length) paragraphs.push(first);

  const second: Piece[] = [];
  const last = record.facts.protection?.lastAttempt;
  const copy = offsite?.evidence.certainty;
  if (copy === "absent") second.push("Nothing copies your data off the server yet.");
  else if (copy === "failed") second.push({ vital: "backups", text: "The last copy failed" }, ".");
  else if (last && copy === "stale")
    second.push(
      "The last copy I saw left the server ",
      { vital: "backups", text: ago(last.at, now) },
      ". I haven't seen one since.",
    );
  else if (last) {
    second.push(
      { vital: "backups", text: lastNight(last.at, now) ? "Last night's copy" : "The latest copy" },
      ` of your data${last.size ? `, ${last.size},` : ""} is safe in `,
      { vital: "backups", text: offsite?.name ?? "off-site storage" },
      " and was checked by checksum.",
    );
    const next = vitals.backups?.countdownTo;
    if (next) second.push(` The next one leaves ${whenWords(next, now)}, in `, { countdown: true }, ".");
  }
  if (model.restricted)
    second.push(
      " Only ",
      { vital: "access", text: "your network" },
      ` can open ${name}${model.byId.tls?.evidence.certainty === "absent" ? ", over plain HTTP" : ""}.`,
    );
  else second.push(" ", { vital: "access", text: "Anyone on the internet" }, ` can open ${name}.`);
  paragraphs.push(second);
  return paragraphs;
}

export function NoteHero({
  model,
  record,
  overview,
  recheck,
  offset,
  onPoint,
  onShow,
  onAsk,
  onOpenDestination,
}: HeroProps) {
  const [guy, mascot] = useServerGuy(model, recheck);
  const [open, setOpen] = useState<{ id: Vital["id"]; left: number; top: number } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const words = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(null), []);
  useDismiss(Boolean(open), ".axn-pop, .axn-tok", close);

  const vitals = Object.fromEntries(overview.vitals.map((vital) => [vital.id, vital])) as Record<
    Vital["id"],
    Vital
  >;
  const countdown = useCountdown(vitals.backups?.countdownTo, offset);
  const planned = model.status !== "live";
  const needs = overview.needs.length > 0;
  const paragraphs = writeNote(model, record, vitals, needs);
  const headline = overview.headline.replace("when Server Guy last looked", "when I last looked");
  const showLog = logOpen || guy.simulating;
  const lines = guy.lines.slice(-6);

  const place = (element: HTMLElement, id: Vital["id"]) => {
    const box = words.current?.getBoundingClientRect();
    if (!box) return;
    const token = element.getBoundingClientRect();
    setOpen((current) =>
      current?.id === id
        ? null
        : {
            id,
            left: Math.max(0, Math.min(token.left - box.left - 22, box.width - 340)),
            top: token.bottom - box.top + 10,
          },
    );
  };

  return (
    <section className={`axn${guy.simulating ? " is-live" : ""}`} aria-label="How it is doing">
      <div className="axn-author">
        <Mascot guy={guy} mascotRef={mascot} className="axn-mascot" />
      </div>
      <div className="axn-words" ref={words}>
        <h2 className="axn-say" key={headline}>
          {headline}
        </h2>
        {needs && (
          <div className="axn-needs">
            {overview.needs.map((need) => (
              <NeedCard
                key={need.id}
                need={need}
                onAsk={onAsk}
                onOpenDestination={onOpenDestination}
                onHover={onPoint}
                onShow={onShow}
              />
            ))}
          </div>
        )}
        <div className="axn-body">
          {paragraphs.map((pieces, i) => (
            <p
              key={`${i}:${pieces.map((piece) => (typeof piece === "string" ? piece : "text" in piece ? piece.text : "")).join("")}`}
              style={{ ["--i" as string]: i }}
            >
              {pieces.map((piece, j) =>
                typeof piece === "string" ? (
                  <Fragment key={j}>{piece}</Fragment>
                ) : "countdown" in piece ? (
                  <b key={j} className="axn-count">
                    {countdown}
                  </b>
                ) : (
                  <span
                    key={j}
                    role="button"
                    tabIndex={0}
                    className="axn-tok"
                    data-c={piece.c ?? vitals[piece.vital]?.status.certainty}
                    aria-expanded={open?.id === piece.vital}
                    onClick={(event) => place(event.currentTarget, piece.vital)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        place(event.currentTarget, piece.vital);
                      }
                    }}
                    onPointerEnter={() => onPoint(partOf[piece.vital])}
                    onPointerLeave={() => onPoint(null)}
                  >
                    {piece.text}
                  </span>
                ),
              )}
            </p>
          ))}
        </div>
        {open && vitals[open.id] && (
          <div className="axn-pop" style={{ left: open.left, top: open.top }}>
            <VitalPop vital={vitals[open.id]} onClose={close} onOpenDestination={onOpenDestination} onAsk={onAsk} />
          </div>
        )}

        <div className="axn-actions">
          {!planned && (
            <>
              <button type="button" className="ax-button" disabled={guy.running} onClick={guy.run}>
                {guy.running ? <SpinnerGap weight="bold" className="ax-spin" /> : <ArrowsClockwise weight="bold" />}
                {guy.running ? "Looking…" : "Look again"}
              </button>
              <small className="axn-sim">Simulated · nothing is contacted</small>
            </>
          )}
          <button
            type="button"
            className="ax-textlink axn-ask"
            onClick={() => onAsk(`Tell me more about how ${model.headline} is doing.`)}
          >
            <ChatCircleText weight="bold" />
            Ask about it
          </button>
        </div>

        <div className="axn-sign">
          <span>Little Server, from your network</span>
          <button
            type="button"
            className="axn-log-toggle"
            aria-expanded={showLog}
            onClick={() => setLogOpen((value) => !value)}
          >
            {guy.simulating ? "What I'm doing" : "What I did last"}
            <CaretDown weight="bold" />
          </button>
        </div>
        <div className={`axn-log${showLog ? " is-open" : ""}`}>
          <div>
            <div className="axn-log-lines" role="log" aria-live="polite">
              {lines.length === 0 && (
                <div className="axn-log-line" data-tone="info">
                  <time>--:--</time>
                  <b>·</b>
                  <span>{planned ? "Nothing has run yet." : "No work recorded yet."}</span>
                </div>
              )}
              {lines.map((line, i) => (
                <div
                  key={line.id}
                  className={`axn-log-line${i === lines.length - 1 ? " is-newest" : ""}`}
                  data-tone={line.tone}
                >
                  <time>
                    {new Date(line.at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })}
                  </time>
                  <b aria-hidden="true">{glyph[line.tone]}</b>
                  <span>
                    {line.text}
                    {line.invented && <em>{line.id.startsWith("live:") ? "simulated" : "invented"}</em>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
