"use client";

// PROTOTYPE · opus-ui-improvements · Security, direction A.
// Doors: the server drawn as the face it presents to the world, one door per
// way in. A lamp over each door says who may knock, the plate says which
// port it is, and what has no door is bricked up and labelled. Opening a
// door swings it and reads out what is behind it, how the record knows, and
// what proved anything ever answered there. What is inside the server sits
// behind the wall, with no door to the outside at all.

import {
  ArrowsClockwise,
  ChatCircleText,
  Key,
  Warning,
} from "@phosphor-icons/react";
import { useState } from "react";

import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import type { ReachDirectionProps } from "./index";
import { ago, when, type Door } from "./reach-model";
import "./doors.css";

const lampOf = (door: Door) =>
  door.reach === "closed"
    ? "off"
    : door.concern
      ? "warn"
      : door.reach === "private"
        ? "inside"
        : "on";

export function DoorsDirection({
  story,
  now,
  head,
  activity,
  onAsk,
  onOpenDestination,
  panel,
  onCheck,
  checking,
}: ReachDirectionProps) {
  const outside = story.doors.filter(
    (door) => door.reach !== "private" && door.id !== "rest",
  );
  const inside = story.doors.filter((door) => door.reach === "private");
  const [open, setOpen] = useState<string | null>(null);
  // A private service with a rule of its own is no longer behind the wall.
  const pierced = new Set(
    inside
      .filter((door) =>
        outside.some(
          (other) => other.reach === "internet" && other.port === door.port,
        ),
      )
      .map((door) => door.port),
  );
  const shown = story.doors.find((door) => door.id === open) ?? null;
  const worrying = outside.filter((door) => door.reach === "internet");
  const read = story.firewall.state === "read";
  const rest = story.doors.find((door) => door.id === "rest") ?? null;
  // With no firewall attached there is no wall to have doors in.
  const walled = rest?.reach === "closed";

  return (
    <section className="axdo" aria-label="Security">
      {head}
      {activity}
      {panel}
      <div className="axdo-lede">
        <div>
          <h2>
            {!walled
              ? "Nothing stands in front of this server."
              : worrying.length === 1
                ? "One door on this server answers any network at all."
                : worrying.length
                  ? `${worrying.length} doors on this server answer any network at all.`
                  : "Every door on this server is held to a network you named."}
          </h2>
          <p>
            <Tag tone={read ? "verified" : "planned"}>
              {read
                ? `Read from ${story.firewall.provider} ${ago(story.firewall.at, now)}`
                : "Asked for, never read back"}
            </Tag>
            <span>
              {story.firewall.detail} A door standing open is not a fault: a web
              application needs one. What matters is who is on the other side.
            </span>
          </p>
        </div>
        <div className="axdo-acts">
          {onCheck && (
            <button
              type="button"
              className="ax-button axdo-check"
              disabled={checking}
              onClick={onCheck}
            >
              <ArrowsClockwise
                weight="bold"
                className={checking ? "ax-spin" : undefined}
              />
              {checking ? "Checking…" : "Check now"}
            </button>
          )}
          <button
            type="button"
            className="ax-button axdo-ask"
            onClick={() =>
              onAsk(
                `Read the firewall for ${story.name} from the provider and tell me every port that is open and to whom.`,
              )
            }
          >
            <ChatCircleText weight="bold" />
            Ask for a read of the firewall
          </button>
        </div>
      </div>

      <div className="axdo-place">
        {inside.length > 0 && (
          <div className="axdo-inside" aria-label="Inside the server">
            <span className="axdo-inside-label">
              Inside the server · no door to the outside
            </span>
            <div className="axdo-inside-row">
              {inside.map((door) => (
                <button
                  key={door.id}
                  type="button"
                  className="axdo-inner"
                  data-open={open === door.id || undefined}
                  onClick={() => setOpen(open === door.id ? null : door.id)}
                >
                  <b>{door.title}</b>
                  <small>
                    {door.port ? `port ${door.port} · ` : ""}
                    {pierced.has(door.port)
                      ? "opened from outside"
                      : "no published port"}
                  </small>
                  {pierced.has(door.port) && (
                    <i>
                      <Warning weight="fill" /> a rule reaches it from any
                      network
                    </i>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="axdo-wall">
          {outside.map((door) => (
            <div
              key={door.id}
              className="axdo-bay"
              data-lamp={lampOf(door)}
              data-open={open === door.id || undefined}
            >
              <span className="axdo-lamp" aria-hidden="true" />
              <span className="axdo-sign">{door.reachWords}</span>
              <button
                type="button"
                className="axdo-door"
                aria-expanded={open === door.id}
                onClick={() => setOpen(open === door.id ? null : door.id)}
              >
                <span className="axdo-frame" aria-hidden="true">
                  <span className="axdo-behind">
                    {door.serves ?? "nothing recorded"}
                  </span>
                </span>
                <span className="axdo-leaf">
                  <span className="axdo-plate">{door.port}</span>
                  <span className="axdo-title">{door.title}</span>
                  {door.id === "ssh" || door.port === "22" ? (
                    <span className="axdo-keyhole" aria-hidden="true">
                      <Key weight="fill" />
                    </span>
                  ) : (
                    <span className="axdo-handle" aria-hidden="true" />
                  )}
                  {door.unasked && (
                    <span className="axdo-flag">
                      <Warning weight="fill" /> unasked for
                    </span>
                  )}
                </span>
              </button>
            </div>
          ))}

          {walled ? (
            <div className="axdo-bricks" aria-label="Every other port">
              <span>Every other port</span>
              <small>No way in</small>
            </div>
          ) : (
            rest && (
              <div className="axdo-gap" aria-label="Every other port">
                <b>
                  <Warning weight="fill" /> {rest.title}
                </b>
                <span>{rest.detail}</span>
              </div>
            )
          )}
          <LittleServer
            mood={worrying.length ? "checking" : "ready"}
            className="axdo-guy"
          />
        </div>
        <span className="axdo-floor" aria-hidden="true" />
      </div>

      {shown && (
        <div className="axdo-read" role="region" aria-label={shown.title}>
          <div className="axdo-read-head">
            <h3>
              {shown.reach === "private" || !shown.port
                ? shown.title
                : `Port ${shown.port} · ${shown.title}`}
            </h3>
            <Tag
              tone={
                shown.concern
                  ? "failed"
                  : shown.told === "provider"
                    ? "verified"
                    : "planned"
              }
            >
              {shown.reachWords}
            </Tag>
          </div>
          <p>{shown.detail}</p>
          {shown.concern && (
            <p className="axdo-concern">
              <Warning weight="fill" /> {shown.concern}
            </p>
          )}
          <dl className="ax-facts">
            <div>
              <dt>Behind it</dt>
              <dd>{shown.serves ?? "Nothing recorded listens"}</dd>
            </div>
            <div>
              <dt>Allowed sources</dt>
              <dd>
                {shown.sources.length
                  ? shown.sources.map((source) => (
                      <code key={source}>{source}</code>
                    ))
                  : "None: nothing outside the server"}
              </dd>
            </div>
            <div>
              <dt>How this is known</dt>
              <dd>
                {shown.toldWords}
                {shown.at ? ` · ${when(shown.at)}` : ""}
              </dd>
            </div>
            <div>
              <dt>Ever answered</dt>
              <dd>
                {shown.proof
                  ? `${shown.proof.words} · ${when(shown.proof.at)}`
                  : "Nothing has tested it"}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <div className="axdo-below">
        <section aria-label="What else protects it">
          <h3>Not a door, but protection</h3>
          <ul className="axdo-guards">
            {story.guards.map((guard) => (
              <li key={guard.id}>
                <b>{guard.title}</b>
                <span>{guard.detail}</span>
                {guard.at && <small>{when(guard.at)}</small>}
              </li>
            ))}
          </ul>
        </section>
        <section aria-label="What nothing covers">
          <h3>What nothing here covers</h3>
          <ul className="axdo-holes">
            {story.holes.map((hole) => (
              <li key={hole.id}>
                <b>{hole.title}</b>
                <span>{hole.detail}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="ax-textlink"
            onClick={() => onOpenDestination("domains")}
          >
            The name and certificate in front of it
          </button>
        </section>
      </div>
      {story.invented && <p className="ax-invented">{story.invented}</p>}
    </section>
  );
}
