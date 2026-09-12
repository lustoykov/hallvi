"use client";

// PROTOTYPE · opus-ui-improvements · Domains, direction A.
// Address: no diagram. The address a visitor types, set life-size and taken
// apart, with an empty slot exactly where each missing piece would go — the
// certificate is one dotted letter, the name is a dotted slot under the
// server's number. Type a name into it and the address it would become is
// written underneath, with what would have to be true, in order. Picking a
// part underlines its piece of the address and opens its words.

import { ChatCircleText, Lock, LockOpen } from "@phosphor-icons/react";
import { useState } from "react";

import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import type { Tone } from "../deployment-prototype/deployment-model";
import type { ReachDirectionProps } from "./index";
import { listed } from "../backup-prototype/model";
import { ago, when, type Leg } from "./reach-model";
import "./address.css";

const toneOfLeg: Record<Leg["state"], Tone> = {
  ok: "verified",
  pending: "checking",
  failed: "failed",
  absent: "planned",
  skipped: "planned",
};
const wordOfLeg: Record<Leg["state"], string> = {
  ok: "Working",
  pending: "Waiting",
  failed: "Failed",
  absent: "Not set up",
  skipped: "Not needed",
};
/** What each missing piece is called when it is named in a sentence. */
const want: Record<Leg["id"], string> = {
  name: "a name of its own",
  https: "a certificate",
  cdn: "a CDN",
  serves: "something to serve",
};
/** A name typed in the slot, reduced to what could go in an address. */
const tidy = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9.-]/g, "")
    .slice(0, 40);

export function AddressDirection({
  story,
  now,
  head,
  activity,
  onAsk,
  onOpenDestination,
}: ReachDirectionProps) {
  const [part, setPart] = useState<Leg["id"] | null>(null);
  const [typed, setTyped] = useState("");
  const secure = story.tls.state === "valid";
  const named = Boolean(story.domain);
  const wanted = tidy(typed);
  const open = story.legs.find((leg) => leg.id === part) ?? null;
  const missing = story.legs.filter(
    (leg) => leg.who && leg.state !== "ok" && leg.state !== "skipped",
  );

  const lede = named
    ? secure
      ? `${story.name} answers on ${story.domain!.name}, over HTTPS.`
      : `${story.domain!.name} points here, but nothing is encrypted yet.`
    : `${story.name} has no name of its own. Visitors type the server’s number.`;

  return (
    <section className="axad" aria-label="Domains">
      {head}
      {activity}
      <div className="axad-lede">
        <div>
          <h2>{lede}</h2>
          <p>
            <Tag tone={named && secure ? "verified" : "planned"}>
              {named
                ? secure
                  ? `Certificate valid${story.tls.expiresAt ? ` until ${when(story.tls.expiresAt)}` : ""}`
                  : "Name only"
                : "No domain connected"}
            </Tag>
            <span>
              {story.audience === "controller"
                ? `Only your network reaches it${story.controllerIp ? ` · ${story.controllerIp}` : ""}. `
                : "Anyone on the internet reaches it. "}
              Domain setup is not implemented yet; this is what it would say.
            </span>
          </p>
        </div>
        <button
          type="button"
          className="ax-button axad-ask"
          onClick={() =>
            onAsk(
              named
                ? `Check that ${story.domain!.name} still resolves here and that its certificate renews.`
                : `I want ${story.name} to answer on a name of its own. What do you need from me?`,
            )
          }
        >
          <ChatCircleText weight="bold" />
          {named ? "Ask about this name" : "Ask for a name"}
        </button>
      </div>

      {/* The address, life-size. Missing pieces are empty slots in place. */}
      <div className="axad-rail" data-lit={part ?? undefined}>
        <div className="axad-line">
          <span className="axad-seg" data-seg="https" data-on={secure}>
            <button
              type="button"
              onClick={() => setPart(part === "https" ? null : "https")}
              aria-pressed={part === "https"}
            >
              http
              {secure ? (
                <b>s</b>
              ) : (
                <i className="axad-slot" aria-label="no certificate">
                  s
                </i>
              )}
            </button>
          </span>
          <span className="axad-punct">://</span>
          <span className="axad-seg" data-seg="name" data-on={named}>
            <button
              type="button"
              onClick={() => setPart(part === "name" ? null : "name")}
              aria-pressed={part === "name"}
            >
              {story.hostName ?? "no address"}
            </button>
          </span>
          {!named && (
            <span className="axad-seg axad-port" data-seg="serves">
              <button
                type="button"
                onClick={() => setPart(part === "serves" ? null : "serves")}
                aria-pressed={part === "serves"}
              >
                {story.portLabel ? `:${story.portLabel}` : ":80"}
              </button>
            </span>
          )}
          <span className="axad-punct">{story.path}</span>
          <span className="axad-lock" data-on={secure}>
            {secure ? <Lock weight="fill" /> : <LockOpen weight="regular" />}
          </span>
        </div>

        {!named && (
          <div className="axad-try">
            <label>
              <span>The name you want</span>
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="dashboard.yourdomain.com"
                aria-label="Try a name"
                spellCheck={false}
              />
            </label>
            <p className="axad-ghost" data-filled={Boolean(wanted)}>
              <span>https://</span>
              <b>{wanted || "the name you want"}</b>
              <span>/</span>
            </p>
          </div>
        )}
      </div>

      {!named && (
        <ol className="axad-order">
          <li>
            <b>You</b> point <i>{wanted || "the name"}</i> at{" "}
            <code>
              {story.address?.replace(/^https?:\/\//, "") ?? "this server"}
            </code>{" "}
            with one A record. Only the account that owns the name can do it.
          </li>
          <li>
            <b>Server Guy</b> waits until the name answers with this server,
            then records that it resolves.
          </li>
          <li>
            <b>Server Guy</b> asks a certificate authority for a certificate,
            which is only possible once the name resolves, and installs it.
          </li>
          <li>
            <b>Server Guy</b> renews it about every three months, from then on.
          </li>
        </ol>
      )}

      <div className="axad-parts">
        {story.legs.map((leg) => (
          <button
            key={leg.id}
            type="button"
            className="axad-part"
            data-state={leg.state}
            data-open={part === leg.id || undefined}
            onClick={() => setPart(part === leg.id ? null : leg.id)}
          >
            <span className="axad-part-head">
              <small>{leg.label}</small>
              <Tag tone={toneOfLeg[leg.state]}>{wordOfLeg[leg.state]}</Tag>
            </span>
            <strong>{leg.value}</strong>
            <span className="axad-part-detail">{leg.detail}</span>
            {leg.who && leg.state !== "ok" && (
              <span className="axad-who" data-who={leg.who}>
                {leg.who === "you" ? "Your move" : "Server Guy’s move"}
              </span>
            )}
          </button>
        ))}
      </div>

      {open && (
        <div className="axad-open" role="region" aria-label={open.label}>
          <h3>{open.label}</h3>
          <p>{open.detail}</p>
          {open.note && <p className="axad-note">{open.note}</p>}
          {open.id === "cdn" && (
            <button
              type="button"
              className="ax-textlink"
              onClick={() => onOpenDestination("cdn")}
            >
              Caching and clearing live in CDN
            </button>
          )}
          {open.id === "serves" && story.routes.length > 0 && (
            <dl className="ax-facts axad-routes">
              {story.routes.map((route) => (
                <div key={`${route.host}-${route.port}`}>
                  <dt>{route.host}</dt>
                  <dd>
                    <code>{route.service}</code> · port {route.port} ·{" "}
                    {route.protocol}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      <footer className="axad-foot">
        <LittleServer
          mood={named && secure ? "ready" : "resting"}
          className="axad-guy"
        />
        <div>
          <p>
            {missing.length
              ? `${
                  missing.length === 1 ? "One piece is" : "Two pieces are"
                } still missing in front of ${story.name}: ${listed(
                  missing.map((leg) => want[leg.id]),
                )}. Nothing here is watched; the address and the reach come
              from the deployment on record`
              : `Everything in front of ${story.name} is on record`}
            {story.verifiedAt
              ? `, last verified ${ago(story.verifiedAt, now)}.`
              : "."}
          </p>
          <button
            type="button"
            className="ax-textlink"
            onClick={() => onOpenDestination("security")}
          >
            Who can reach it at all is on Security
          </button>
        </div>
      </footer>
      {story.invented && <p className="ax-invented">{story.invented}</p>}
    </section>
  );
}
