"use client";

// Hallvi, and where the first deployment has got to, above the conversation.
//
// A new application's conversation was one grey sentence on an empty page,
// and while Pi worked the only sign of life was a small spinner. This keeps
// Little Server in the room and shows the four things that happen between a
// repository and an address that opens.
//
// Every stop is read from what is recorded — a request, an attached host, a
// deployment record, an access record — never from a timer or a guess at how
// far along Pi is. What moves while Pi works is the stop it is on, because
// that is all anyone knows; nothing here counts up to a hundred.

import { ArrowRight, Check } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { useState } from "react";

import "./journey-rail.css";

const Mascot = dynamic(
  () => import("../home/mascot-scene").then((m) => m.MascotScene),
  { ssr: false, loading: () => null },
);

export interface JourneyFacts {
  /** Pi has said what the application needs, or gone further. */
  read: boolean;
  /** A host request is open and waits for the owner. */
  placeWaiting: boolean;
  /** A host is attached and SSH-verified. */
  placed: boolean;
  /** A deployment record exists. */
  deployed: boolean;
  /** An application-access record exists: there is something to open. */
  opens: boolean;
}

const STOPS = [
  { id: "read", label: "Read it", doing: "Reading the repository" },
  { id: "place", label: "A place to run", doing: "Arranging where it runs" },
  { id: "deploy", label: "Deploy", doing: "Deploying and checking it" },
  { id: "open", label: "Open it", doing: "Opening a way in" },
] as const;

export function JourneyRail({
  application,
  facts,
  working,
  says,
  waitingOnYou,
  started,
  canStart,
  onStart,
}: {
  application: string;
  facts: JourneyFacts;
  /** A turn is running right now. */
  working: boolean;
  /** The most specific true thing about that turn, in plain words. */
  says: string | null;
  /** The running turn, or an open card, is waiting for the owner. */
  waitingOnYou: boolean;
  /** The owner has said something in this conversation. */
  started: boolean;
  /** A message can be sent: the model is connected and nothing is running. */
  canStart: boolean;
  onStart: () => void;
}) {
  const done = [facts.read, facts.placed, facts.deployed, facts.opens];
  // A later stop proves the earlier ones, however the records arrived.
  for (let index = done.length - 2; index >= 0; index--)
    if (done[index + 1]) done[index] = true;
  const at = done.indexOf(false);
  const finished = at === -1;

  // Shown for the first deployment and its arrival, not on every later visit:
  // whether it was unfinished when this page opened is decided once.
  const [watched] = useState(!finished);
  const [dances, setDances] = useState(0);
  if (finished && !watched) return null;

  const needsYou = waitingOnYou || (facts.placeWaiting && !working);
  const mood = finished
    ? "celebrating"
    : needsYou
      ? "pointing"
      : working
        ? "working"
        : started
          ? "ready"
          : "waving";
  const line = finished
    ? `${application} is running. Open it from the card below.`
    : needsYou
      ? facts.placeWaiting
        ? "Your turn: the card below asks where it should run."
        : "Your turn: something below is waiting for you."
      : working
        ? `${says ?? STOPS[at]!.doing}…`
        : started
          ? "I’m here. Tell me what you’d like next."
          : canStart
            ? `I’ve added ${application}. Shall I read it and get it running?`
            : `I’ve added ${application}. Connect ChatGPT below and I’ll get started.`;

  return (
    <section
      className="hv-rail"
      data-tone={finished ? "done" : needsYou ? "waiting" : "working"}
      aria-label="Progress of the first deployment"
    >
      <button
        type="button"
        className="hv-rail-mascot"
        aria-label="Make Hallvi dance"
        onClick={() => setDances((count) => count + 1)}
      >
        <Mascot
          color="#7a8bd6"
          mood={mood}
          dance={finished ? "cartwheel" : "shuffle"}
          // Arriving earns one dance of its own.
          danceRequest={dances + (finished ? 1 : 0)}
        />
      </button>
      <div className="hv-rail-body">
        <p className="hv-rail-says" key={line} role="status">
          {line}
          {!started && !working && canStart && !finished && (
            <button type="button" className="hv-rail-start" onClick={onStart}>
              Get it running <ArrowRight weight="bold" aria-hidden="true" />
            </button>
          )}
        </p>
        <ol className="hv-rail-stops">
          {STOPS.map((stop, index) => {
            const state = done[index]
              ? "done"
              : index === at
                ? needsYou
                  ? "waiting"
                  : working
                    ? "active"
                    : "next"
                : "pending";
            return (
              <li key={stop.id} data-state={state}>
                <span className="hv-rail-mark" aria-hidden="true">
                  {done[index] ? <Check weight="bold" /> : index + 1}
                </span>
                <span className="hv-rail-label">
                  {stop.label}
                  <span className="hv-visually-hidden">
                    {state === "done"
                      ? ", done"
                      : state === "active"
                        ? ", in progress"
                        : state === "waiting"
                          ? ", waiting for you"
                          : ""}
                  </span>
                </span>
                <span className="hv-rail-bar" aria-hidden="true" />
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
