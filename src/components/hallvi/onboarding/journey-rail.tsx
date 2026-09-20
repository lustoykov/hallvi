"use client";

// Hallvi's welcome, then the four quiet stops of the first deployment.
//
// A new application's conversation was one grey sentence on an empty page,
// and while Pi worked the only sign of life was a small spinner. This keeps
// Little Server in the room and shows the four things that happen between a
// repository and an address that opens.
//
// Every stop is read from what is recorded — a request, an attached host, a
// deployment record, an access record — never from a timer or a guess at how
// far along Pi is. The compact stops live beside the composer, while live
// activity stays in the transcript where Hallvi is thinking. Once access is
// recorded, the first-deployment rail is finished and does not return.

import { ArrowRight, Check } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
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

/** What the welcome needs to know about a repository it cannot read yet. */
export interface WelcomeRepository {
  /** "owner/name". */
  name: string;
  status: "blocked" | "not-yet";
  /** A GitHub account is signed in. */
  connected: boolean;
  /** This release can sign in to GitHub at all. */
  signIn: boolean;
  checking: boolean;
  onOpen: () => void;
  onCheck: () => void;
}

/** One sentence and one action. Never an action this release cannot take. */
function repositorySays(repository: WelcomeRepository) {
  const { name } = repository;
  if (repository.status === "not-yet")
    return {
      says: `I haven’t been able to check ${name} yet.`,
      action: repository.checking ? "Checking…" : "Check repository",
      run: repository.onCheck,
    };
  if (repository.connected)
    return {
      says: `Hallvi has a GitHub login saved, but couldn’t read ${name}. Check its address and repository access.`,
      action: "Choose repositories",
      run: repository.onOpen,
    };
  if (repository.signIn)
    return {
      says: `I couldn’t open ${name}. If it’s private, connecting GitHub lets me in.`,
      action: "Connect GitHub",
      run: repository.onOpen,
    };
  return {
    says: `I couldn’t open ${name}, and this Hallvi release can’t sign in to GitHub. Public repositories still work.`,
    action: null,
    run: repository.onOpen,
  };
}

const STOPS = [
  { id: "read", label: "Read it" },
  { id: "place", label: "A place to run" },
  { id: "deploy", label: "Deploy" },
  { id: "open", label: "Open it" },
] as const;

export function JourneyRail({
  application,
  facts,
  waitingOnYou,
  placement,
  canStart,
  onStart,
  onConnect,
  requestOpen,
  repository,
}: {
  application: string;
  facts: JourneyFacts;
  /** An open card or request is waiting for the owner. */
  waitingOnYou: boolean;
  /** The first welcome is spacious; progress beside the composer is compact. */
  placement: "welcome" | "progress";
  /** A message can be sent: the model is connected and nothing is running. */
  canStart?: boolean;
  onStart?: () => void;
  /** ChatGPT is not connected; this opens the request for it below. */
  onConnect?: () => void;
  /** A request is open in the transcript: the welcome steps back to a line. */
  requestOpen?: boolean;
  /** The repository cannot be read yet; the welcome says so instead. */
  repository?: WelcomeRepository;
}) {
  const done = [facts.read, facts.placed, facts.deployed, facts.opens];
  // A later stop proves the earlier ones, however the records arrived.
  for (let index = done.length - 2; index >= 0; index--)
    if (done[index + 1]) done[index] = true;
  const at = done.indexOf(false);
  const finished = at === -1;
  const [dances, setDances] = useState(0);
  const needsYou = waitingOnYou || facts.placeWaiting;

  if (placement === "welcome") {
    const mascot = (mood: "waving" | "ready") => (
      <button
        type="button"
        className="hv-first-app-mascot hv-rail-mascot"
        aria-label="Make Hallvi dance"
        onClick={() => setDances((count) => count + 1)}
      >
        <Mascot
          color="#7a8bd6"
          mood={mood}
          dance="shuffle"
          danceRequest={dances}
        />
      </button>
    );
    // The request is open in the transcript: the welcome steps back to one
    // line, so the blocker is said in one place.
    if (requestOpen)
      return (
        <section className="hv-first-app" data-compact>
          {mascot("ready")}
          <div>
            <h2>Let’s get to know {application}.</h2>
            <p>
              One thing first — it’s just below. Reading the repository is still
              yours to start afterwards.
            </p>
          </div>
        </section>
      );
    const unread = repository ? repositorySays(repository) : null;
    return (
      <section
        className="hv-first-app"
        aria-label="Get to know your application"
      >
        {mascot(unread ? "ready" : "waving")}
        <div>
          <h2>Let’s get to know {application}.</h2>
          <p>
            I’ll read the repository and explain what it needs. Then we’ll
            choose where it runs.
          </p>
          {unread && onConnect ? (
            // Both are missing. They are different things, so they are two
            // lines, and only the first one is blue.
            <ul className="hv-first-app-needs" aria-label="Before we start">
              <li>
                <span>
                  <strong>A model to think with</strong>
                  ChatGPT isn’t connected.
                </span>
                <button
                  type="button"
                  className="hv-rail-start"
                  onClick={onConnect}
                >
                  Connect ChatGPT <ArrowRight aria-hidden="true" />
                </button>
              </li>
              <li>
                <span>
                  <strong>Open {repository!.name}</strong>
                  {unread.says}
                </span>
                <button
                  type="button"
                  className="hv-first-app-quiet"
                  disabled={repository!.checking}
                  onClick={unread.run}
                >
                  {unread.action ?? "See why"}
                </button>
              </li>
            </ul>
          ) : unread ? (
            <>
              <p className="hv-first-app-next">{unread.says}</p>
              <button
                type="button"
                className={
                  unread.action ? "hv-rail-start" : "hv-first-app-quiet"
                }
                disabled={repository!.checking}
                onClick={unread.run}
              >
                {unread.action ?? "See why"}{" "}
                {unread.action && <ArrowRight aria-hidden="true" />}
              </button>
            </>
          ) : onConnect ? (
            <>
              <p className="hv-first-app-next">
                Connect ChatGPT so I can read {application}.
              </p>
              <button
                type="button"
                className="hv-rail-start"
                onClick={onConnect}
              >
                Connect ChatGPT <ArrowRight aria-hidden="true" />
              </button>
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
  }

  if (finished) return null;

  return (
    <section className="hv-rail" aria-label="Progress of the first deployment">
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
            <li
              key={stop.id}
              data-state={state}
              aria-current={index === at ? "step" : undefined}
            >
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
    </section>
  );
}
