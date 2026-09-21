"use client";

// Monitoring's lede and its Watching map.
//
// The server is a frame and the parts are cards inside it, in the language of
// the Architecture page. The watcher is a card outside with a wire in; with
// no watcher it is a ghost where one would go, because the page's whole job
// is to say whether anything would tell you. One pip per check, and the
// picked part lists its checks as sentences: what was tested, whether it
// worked, and how much longer that result counts.

import {
  ChatCircleText,
  Check,
  Cylinder,
  Database,
  Eye,
  GearSix,
  Globe,
  HardDrives,
  Hourglass,
  Warning,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import { FRESH_MS } from "./architecture-prototype/model";
import type { Tone } from "./deployment-prototype/deployment-model";
import { LittleServer } from "./deployment-prototype/little-server";
import { Tag } from "./deployment-prototype/tag";
import type {
  MonitoringStory,
  PartLook,
  WatchedPart,
  Watching,
} from "./monitoring-records";
import { ago, countWord, when } from "./stack-prototype/stack-model";
import "./monitoring-watching.css";

/** Verified green needs evidence under a day old. */
export const toneOf = (at: string | null, now: number): Tone =>
  !at ? "planned" : now - Date.parse(at) < FRESH_MS ? "verified" : "stale";

export function AskButton({
  children,
  onClick,
  primary,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={primary ? "ax-button axmw-ask-primary" : "axmw-ask"}
      onClick={onClick}
    >
      <ChatCircleText weight="bold" />
      {children}
    </button>
  );
}

const watchDraft = (name: string) =>
  `Set up a health watch for ${name}: check each part every minute, restart one that stops, and tell me when something fails.`;

export function MonitoringLede({
  story,
  watching: parts,
  now,
  aside,
  onAsk,
}: {
  story: MonitoringStory;
  watching: Watching;
  now: number;
  /** A sentence from outside the checks the lede should carry. */
  aside: string | null;
  onAsk: (draft: string) => void;
}) {
  const failing = story.looks.find((look) => look.state === "failing");
  const watching = story.watcher?.state === "running";
  const quiet = story.watcher?.state === "stale";
  const { counts } = parts;
  const judged = counts.counts + counts.expired;
  // How many results are still evidence about now. "Every check is passing"
  // over a list of expired passes was the lede contradicting its own page.
  const standing = !judged
    ? null
    : counts.expired
      ? `${countWord(counts.counts)} of ${countWord(judged).toLowerCase()} ${judged === 1 ? "check is" : "checks are"} recent enough to count.`
      : `${judged === 1 ? "Its one check is" : `All ${countWord(judged).toLowerCase()} checks are`} recent enough to count.`;
  const heard = story.watcher?.lastObservationAt ?? null;
  const lede = failing
    ? {
        say: `${failing.name} is failing.`,
        tone: "failed" as Tone,
        word: `Failing · ${ago(failing.at!, now)}`,
        sub: [failing.detail, story.watcher?.detail]
          .filter(Boolean)
          .map((sentence) => `${sentence}.`)
          .join(" "),
        label: "Ask Hallvi to look into it",
        draft: `${failing.name} is failing: ${failing.detail}. Find out why and tell me what you would change.`,
      }
    : {
        say: watching
          ? `${story.name} is being watched.`
          : quiet
            ? `Whatever was watching ${story.name} has gone quiet.`
            : `Nothing is watching ${story.name}.`,
        // Green only for a watcher that is reporting: a recent one-off check
        // beside "nothing is watching" is not reassurance.
        tone: (watching ? "verified" : "stale") as Tone,
        word: watching
          ? heard
            ? `Watcher reported ${ago(heard, now)}`
            : "Watcher running"
          : story.lastCheckAt
            ? `Last checked ${ago(story.lastCheckAt, now)}`
            : "Never checked",
        sub: [
          watching ? `${story.watcher!.detail}.` : null,
          story.lastCheckAt
            ? `Hallvi last checked it ${when(story.lastCheckAt)}.`
            : "No record carries a check of it.",
          standing,
          aside,
        ]
          .filter(Boolean)
          .join(" "),
        ...(watching
          ? {
              label: "Ask Hallvi to check it now",
              draft: `Check every part of ${story.name} now and tell me whether anything has changed since the last check.`,
            }
          : quiet
            ? {
                label: "Ask why the watch went quiet",
                draft: `The health watch on ${story.name} has stopped reporting. Find out why, get it reporting again, and tell me what you changed.`,
              }
            : {
                label: "Ask Hallvi to set up a health watch",
                draft: watchDraft(story.name),
              }),
      };

  return (
    <div className="axmw-lede">
      <div>
        <h2>{lede.say}</h2>
        <p>
          <Tag tone={lede.tone}>{lede.word}</Tag>
          <span>{lede.sub}</span>
        </p>
      </div>
      <AskButton primary onClick={() => onAsk(lede.draft)}>
        {lede.label}
      </AskButton>
    </div>
  );
}

function KindIcon({ kind }: { kind: string }) {
  const Icon =
    {
      web: Globe,
      host: HardDrives,
      volume: Cylinder,
      database: Database,
    }[kind] ?? GearSix;
  return <Icon weight="duotone" aria-hidden="true" />;
}

const lookIcon: Record<PartLook["state"], ReactNode> = {
  counts: <Check weight="bold" />,
  expired: <Hourglass weight="bold" />,
  failed: <Warning weight="bold" />,
  read: <Eye weight="bold" />,
};

const lasts = (ms: number) =>
  ms < 3_600_000
    ? `${Math.max(1, Math.round(ms / 60_000))} min`
    : ms < 86_400_000
      ? `${Math.round(ms / 3_600_000)} h`
      : `${Math.round(ms / 86_400_000)} days`;

/** "Worked 8 min ago · counts for 7 min more". */
function verdict(look: PartLook, now: number) {
  if (!look.at) return "Never checked";
  const at = ago(look.at, now);
  if (look.state === "failed") return `Failed ${at}`;
  if (look.state === "read") return `Recorded ${at}`;
  if (look.state === "expired") return `Worked ${at} · too long ago to count`;
  return look.left === null
    ? `Worked ${at}`
    : `Worked ${at} · counts for ${lasts(look.left)} more`;
}

const partWords = (part: WatchedPart, now: number) =>
  part.state === "never"
    ? "Never checked"
    : part.state === "failed"
      ? "Failing"
      : part.state === "counts"
        ? `Working ${ago(part.lastAt!, now)}`
        : `Last checked ${ago(part.lastAt!, now)}`;

export function WatchingMap({
  story,
  watching,
  now,
  onAsk,
}: {
  story: MonitoringStory;
  watching: Watching;
  now: number;
  onAsk: (draft: string) => void;
}) {
  const host = watching.parts.find((part) => part.kind === "host") ?? null;
  const inside = watching.parts.filter((part) => part !== host);
  const [picked, setPicked] = useState(
    (
      watching.parts.find((part) => part.state === "failed") ??
      inside[0] ??
      host
    )?.id,
  );
  const part = watching.parts.find((item) => item.id === picked) ?? null;
  const rails = host ? [host, ...inside] : inside;
  // One clock for every rail: the oldest reading on record, to now.
  const from =
    watching.parts
      .flatMap((item) => item.readings.map((reading) => reading.at))
      .sort()[0] ?? null;
  const span = from ? Math.max(now - Date.parse(from), 1) : 1;
  const place = (at: string) =>
    `${Math.min(100, Math.max(0, ((Date.parse(at) - (now - span)) / span) * 100)).toFixed(2)}%`;
  const on = story.watcher?.state === "running";
  const quiet = story.watcher?.state === "stale";

  return (
    <section className="axmw" aria-labelledby="axmw-title">
      <header className="axmw-section-head">
        <div>
          <h2 id="axmw-title">Watching</h2>
          <p>
            The parts of {story.name}, when each was last checked, and whether
            anything keeps checking. Every mark is a reading on record; the
            stretch after it is how long nobody has looked. Pick a part to see
            its checks.
          </p>
        </div>
      </header>

      <div className="axmw-card">
        <div className="axmw-map">
          <div
            className="axmw-watcher"
            data-state={on ? "on" : quiet ? "quiet" : "none"}
          >
            <LittleServer
              mood={
                watching.counts.failed
                  ? "attention"
                  : on
                    ? "checking"
                    : "resting"
              }
              className="axmw-guy"
            />
            <b>
              {on ? "Watcher" : quiet ? "Watcher, gone quiet" : "No watcher"}
            </b>
            <small>
              {on || quiet
                ? `${story.watcher!.detail}.`
                : "Nothing checks between Hallvi's visits, so nothing would tell you if a part stopped."}
            </small>
            {!on && !quiet && (
              <AskButton onClick={() => onAsk(watchDraft(story.name))}>
                Set up a watch
              </AskButton>
            )}
          </div>
          <span
            className="axmw-wire"
            data-on={on || undefined}
            aria-hidden="true"
          />
          <div className="axmw-frame">
            {/* The run of readings. One rail per part on one shared clock,
                from the oldest reading on record to now, so what stands out
                is the stretch nobody looked at — which is the subject of
                this page. A part the map draws and no record states is a
                rail that was never laid. */}
            <div className="axmw-rails">
              {rails.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="axmw-rail"
                  data-state={item.state}
                  aria-pressed={item.id === picked}
                  title={item.id}
                  onClick={() => setPicked(item.id)}
                >
                  <span className="axmw-rail-name">
                    <KindIcon kind={item.kind} />
                    <span>
                      <b>{item.kind === "host" ? "Server" : item.name}</b>
                      <small>
                        {item.kind === "host" ? item.id : item.kindWord}
                      </small>
                    </span>
                  </span>
                  <span className="axmw-track" aria-hidden="true">
                    {item.lastAt && (
                      // From the last look to now: still counting, or not.
                      <i
                        className="axmw-since"
                        data-state={item.state}
                        style={{ left: place(item.lastAt) }}
                      />
                    )}
                    {item.readings.map((reading) => (
                      <i
                        key={`${reading.at}:${reading.title}`}
                        className="axmw-tick"
                        data-failed={reading.failed || undefined}
                        style={{ left: place(reading.at) }}
                        title={reading.title}
                      />
                    ))}
                  </span>
                  <em>
                    {partWords(item, now)}
                    {item.watched && (
                      <span className="axmw-badge">
                        <Eye weight="bold" /> Watched
                      </span>
                    )}
                  </em>
                </button>
              ))}
              {watching.ghosts.map((gap) => (
                <div key={gap.id} className="axmw-rail axmw-ghost">
                  <span className="axmw-rail-name">
                    <span>
                      <b>
                        {gap.title.replace(" is drawn but not observed", "")}
                      </b>
                      <small>Drawn on the map, not observed</small>
                    </span>
                  </span>
                  <span className="axmw-track axmw-unlaid" title={gap.detail}>
                    nothing has ever observed this
                  </span>
                  <em>No record states it</em>
                </div>
              ))}
              <div className="axmw-axis" aria-hidden="true">
                <span />
                <span>
                  <small>{from ? ago(from, now) : ""}</small>
                  <small>now</small>
                </span>
                <span />
              </div>
            </div>
          </div>
        </div>

        <ul className="axmw-key" aria-label="Key">
          <li>
            <i data-state="counts" /> Worked, and recent enough to count
          </li>
          <li>
            <i data-state="expired" /> Worked, too long ago to count
          </li>
          <li>
            <i data-state="failed" /> Failed
          </li>
        </ul>

        {part && (
          <article className="axmw-detail" aria-label={part.name}>
            <header>
              <div>
                <h3>{part.name}</h3>
                <p>
                  {part.kindWord}
                  {part.id !== part.name ? ` · ${part.id}` : ""}
                </p>
              </div>
              <AskButton
                onClick={() =>
                  onAsk(
                    part.state === "failed"
                      ? `${part.name} on ${story.name} is failing. Find out why and tell me what you would change.`
                      : `Check ${part.name} on ${story.name} now and tell me what you find.`,
                  )
                }
              >
                {part.state === "failed" ? "Ask why it fails" : "Check it now"}
              </AskButton>
            </header>
            {part.looks.length ? (
              <ul>
                {part.looks.map((look) => (
                  <li key={look.id} data-state={look.state}>
                    <span className="axmw-look-icon">
                      {lookIcon[look.state]}
                    </span>
                    <div>
                      <b>{look.title}</b>
                      {look.state === "failed" || look.state === "read"
                        ? look.detail && <span data-detail>{look.detail}</span>
                        : look.means && <span>{look.means}</span>}
                    </div>
                    <em>{verdict(look, now)}</em>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="axmw-none">
                It is on record as being there, and nothing has tested whether
                it works.
              </p>
            )}
          </article>
        )}
      </div>
    </section>
  );
}
