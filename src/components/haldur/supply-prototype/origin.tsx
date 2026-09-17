"use client";

// PROTOTYPE · opus-ui-improvements · CDN.
// Origin: this page is about a layer that is not there, so it draws the one
// thing that is — the single machine every request reaches, and where in the
// world it stands — with the missing layer as an empty shelf above it. Then
// the questions Haldur would answer before recommending one, and the
// failure a cache brings with it, because a stale copy is the reason this is
// its own destination.

import { ChatCircleText, MapPin } from "@phosphor-icons/react";

import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import type { MascotMood } from "../home/mascot-scene";
import type { SupplyProps } from "./supply-story";
import "./origin.css";

const questions = [
  {
    id: "serves",
    title: "What does it actually serve?",
    detail:
      "Pages built for whoever is signed in cannot be cached at all. Images, fonts and script bundles can, and they are the ones worth moving closer.",
  },
  {
    id: "same",
    title: "Is the answer the same for every visitor?",
    detail:
      "A cache in front of something personal serves one visitor’s page to the next. That is the failure worth avoiding, not a slow first byte.",
  },
  {
    id: "where",
    title: "Where are the people using it?",
    detail:
      "Distance is the whole point. A handful of people in the same country as the machine gain almost nothing.",
  },
];

export function OriginDirection({
  story,
  head,
  activity,
  onAsk,
  onOpenDestination,
}: SupplyProps) {
  const { cdn } = story;
  // A cache in front is not the same claim as a working site. When the origin
  // behind it does not answer, the cache is still perfectly "on" — and every
  // visitor gets the provider's error page. The page says which.
  const dark = cdn.on && cdn.originReachable === "no";
  const mood: MascotMood = dark ? "attention" : "ready";
  return (
    <section className="axog" aria-label="CDN">
      {head}
      {activity}
      <div className="axog-lede">
        <div>
          <h2>
            {dark
              ? `${cdn.provider ?? "The cache"} answers for ${story.name}. The machine behind it does not.`
              : cdn.on
                ? `${cdn.provider ?? "A cache"} keeps copies in front of ${story.name}.`
                : `Every request for ${story.name} travels to one machine.`}
          </h2>
          <p>
            <Tag tone={dark ? "failed" : cdn.on ? "verified" : "planned"}>
              {dark
                ? `${cdn.provider ?? "The cache"} is in front; the origin is not answering`
                : cdn.on
                  ? `Caching through ${cdn.provider}`
                  : "No cache in front"}
            </Tag>
            <span>
              {dark
                ? `${cdn.detail} A visitor still reaches the cache and still gets a page — the provider's, not this application's.`
                : cdn.on
                  ? "The machine below still answers everything the cache does not hold, and a copy can be served after the machine changed — which is why clearing one lives here."
                  : `${cdn.detail} A missing cache is not a missing capability: the name and its certificate work without one, and most applications never need one.`}
            </span>
          </p>
        </div>
        <button
          type="button"
          className="ax-button axog-ask"
          onClick={() =>
            onAsk(
              cdn.on
                ? `What is cached in front of ${story.name} right now, and how do I clear it?`
                : `Would a CDN help ${story.name}? Look at what it actually serves and recommend one only if it makes sense.`,
            )
          }
        >
          <ChatCircleText weight="bold" />
          {cdn.on ? "Ask about the cache" : "Ask whether it would help"}
        </button>
      </div>

      <div className="axog-stack">
        <div className="axog-out">
          <span>Visitors, wherever they are</span>
          <i aria-hidden="true" />
        </div>
        <div
          className="axog-shelf"
          data-on={cdn.on || undefined}
          data-dark={dark || undefined}
        >
          {cdn.on ? (
            <>
              <b>{cdn.provider}</b>
              <span>{cdn.detail}</span>
            </>
          ) : (
            <>
              <b>No cache here</b>
              <span>
                Nothing keeps a copy nearer to anyone. Every request goes the
                whole way.
              </span>
            </>
          )}
        </div>
        <div className="axog-machine" data-dark={dark || undefined}>
          <LittleServer mood={mood} className="axog-guy" />
          <div>
            <b>{story.machine ?? "One machine"}</b>
            <span className="axog-where">
              <MapPin weight="fill" aria-hidden="true" />
              {story.place ?? "Location not recorded"}
            </span>
            {story.address && (
              <code className="axog-address">{story.address}</code>
            )}
          </div>
          <p>
            {dark
              ? `${cdn.origin ? `The cache forwards to ${cdn.origin}, and nothing` : "Nothing"} came back from it. Every request the cache cannot answer from a copy ends here.`
              : "One machine answers everything: the pages, the images and the API. It is the only copy there is."}
          </p>
          {cdn.concern && <p className="axog-concern">{cdn.concern}</p>}
        </div>
      </div>

      <section className="axog-weigh" aria-label="What Haldur would weigh">
        <h3>{cdn.on ? "What this layer is for" : "What Haldur would weigh"}</h3>
        <div className="axog-questions">
          {questions.map((question) => (
            <article key={question.id}>
              <b>{question.title}</b>
              <span>{question.detail}</span>
            </article>
          ))}
        </div>
      </section>

      <footer className="axog-foot">
        <p>
          <b>What a cache costs you.</b> A copy can be served long after the
          machine changed, which is why this is its own destination rather than
          a line on Domains: a stale page needs somewhere to be cleared from,
          and Haldur would state the scope before it cleared anything. Setting
          one up is not implemented yet.
        </p>
        <button
          type="button"
          className="ax-textlink"
          onClick={() => onOpenDestination("domains")}
        >
          The name and certificate in front of it
        </button>
      </footer>
      {story.invented && <p className="ax-invented">{story.invented}</p>}
    </section>
  );
}
