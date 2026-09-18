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
// far along Pi is. While Pi works there is a small spinner beside the turn's
// own status line and nothing else moves: work of unknown length gets no bar.
// It lives in the pane's top row, small, so it keeps no room from the
// conversation; permissions moved to the composer to make that row free.

import { ArrowRight, Check, SpinnerGap } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";

import "./journey-rail.css";

const Mascot = dynamic(
  () => import("../home/mascot-scene").then((m) => m.MascotScene),
  { ssr: false, loading: () => null },
);

export const READ_REPOSITORY_MESSAGE =
  "Read this repository and explain what the application does, what it needs to run, and a sensible hosting option. Do not rent a server, deploy, or change anything yet. Ask me where I want it to run after explaining what you found.";

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

const needsYouLater = (waiting: boolean) =>
  waiting ? ("pointing" as const) : ("working" as const);

export function JourneyRail({
  application,
  facts,
  working,
  says,
  waitingOnYou,
  started,
  canStart,
  onStart,
  connectHref,
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
  connectHref?: string;
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
  // After that, Hallvi is only in the row while there is something to say:
  // a turn running, or something waiting. The stops have served their turn.
  const later = finished && !watched;
  if (later && !working && !waitingOnYou) return null;

  const needsYou = waitingOnYou || (facts.placeWaiting && !working);
  const mood = later
    ? needsYouLater(waitingOnYou)
    : finished
      ? "celebrating"
      : needsYou
        ? "pointing"
        : working
          ? "working"
          : started
            ? "ready"
            : "waving";
  const line = later
    ? waitingOnYou
      ? "Your turn: something below is waiting for you."
      : `${says ?? "Working"}…`
    : finished
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
              ? `I’ve added ${application}. Ready to read its repository.`
              : `I’ve added ${application}. Connect ChatGPT to continue.`;

  const intro = !started && !working && !needsYou && !facts.read && !finished;
  if (intro)
    return (
      <section
        className="hv-first-app"
        aria-label="Get to know your application"
      >
        <button
          type="button"
          className="hv-first-app-mascot hv-rail-mascot"
          aria-label="Make Hallvi dance"
          onClick={() => setDances((count) => count + 1)}
        >
          <Mascot
            color="#7a8bd6"
            mood="waving"
            dance="shuffle"
            danceRequest={dances}
          />
        </button>
        <div>
          <h2>Let’s get to know {application}.</h2>
          <p>
            I’ll read the repository and explain what it needs. Then we’ll
            choose where it runs.
          </p>
          {connectHref ? (
            <>
              <p className="hv-first-app-next">
                Connect ChatGPT so I can read {application}.
              </p>
              <Link className="hv-rail-start" href={connectHref}>
                Connect ChatGPT <ArrowRight aria-hidden="true" />
              </Link>
            </>
          ) : (
            <button
              type="button"
              className="hv-rail-start"
              disabled={!canStart}
              onClick={onStart}
            >
              Read repository <ArrowRight aria-hidden="true" />
            </button>
          )}
          <p className="hv-first-app-note">
            This first look won’t rent a server or deploy anything.
          </p>
        </div>
      </section>
    );

  return (
    <section
      className="hv-rail"
      data-tone={
        later
          ? waitingOnYou
            ? "waiting"
            : "working"
          : finished
            ? "done"
            : needsYou
              ? "waiting"
              : "working"
      }
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
      <p className="hv-rail-says" key={line} role="status">
        {working && !needsYou && (
          <SpinnerGap className="hv-rail-spin" aria-hidden="true" />
        )}
        <span>{line}</span>
        {!started && !working && canStart && !finished && (
          <button type="button" className="hv-rail-start" onClick={onStart}>
            Read repository <ArrowRight weight="bold" aria-hidden="true" />
          </button>
        )}
      </p>
      {!later && (
        <ol className="hv-rail-stops">
          {STOPS.map((stop, index) => {
            const state = done[index]
              ? "done"
              : index === at
                ? needsYou
                  ? "waiting"
                  : "current"
                : "pending";
            return (
              <li key={stop.id} data-state={state}>
                <span className="hv-rail-mark" aria-hidden="true">
                  {done[index] ? <Check weight="bold" /> : index + 1}
                </span>
                {stop.label}
                <span className="hv-visually-hidden">
                  {state === "done"
                    ? ", done"
                    : state === "waiting"
                      ? ", waiting for you"
                      : state === "current"
                        ? ", current"
                        : ""}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
