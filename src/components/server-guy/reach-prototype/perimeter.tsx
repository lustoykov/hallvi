"use client";

// Security, as the perimeter the owner chose.
//
// The accepted design: a ring of what answers from the internet around the
// services that need something first, and beside it one connection at a time
// — where it starts, what it crosses, which port it arrives on, and what that
// rests on.
//
// The prototype it comes from could invent whatever it needed. This reads
// records, so three things it drew are not available here and are said
// differently rather than filled in.
//
// It marked a service "checked", as though somebody had connected to it.
// Nothing in the product does that. What exists is the provider's own
// firewall rules, read back, and what the deployment asked for — so a door
// says which of those it came from, and when, and to which networks.
//
// It inferred a route. A route is not on record either, so the middle of the
// connection says only what the record supports: a published port, a rule
// held to one network, or no published port at all.
//
// And it had a tidy notion of "unexpected". Here that is `concern`, which Pi
// wrote about this particular door. A public website and an SSH port are not
// incidents; a port nothing asked for is.

import { useState } from "react";

import { ago } from "../architecture-prototype/model";
import type { Door, ReachProps } from "./reach-story";

import "./perimeter.css";

/** Where a door sits: the outer ring, the inner one, or off the map. */
type Place = "outside" | "restricted" | "inside" | "unplaced";

function placeOf(door: Door): Place {
  if (door.unasked) return "unplaced";
  if (door.reach === "internet") return "outside";
  if (door.reach === "restricted") return "restricted";
  return "inside";
}

/**
 * What a reader needs to know about the strength of the claim.
 *
 * Deliberately not "checked": nothing here connected to the service. The
 * provider's rules being read back is the strongest thing on this page, and
 * it is still a statement about what is allowed rather than about what
 * answered.
 */
type Basis = "provider" | "plan" | "process" | "unasked";

const BASIS_WORD: Record<Basis, string> = {
  provider: "From the provider's own rules",
  plan: "From what the deployment asked for",
  process: "From what is running on the server",
  unasked: "Nobody has looked",
};

function basisOf(door: Door, read: boolean): Basis {
  if (door.unasked) return "unasked";
  if (door.reach === "private") return "process";
  return read ? "provider" : "plan";
}

/** One ring of nodes, placed evenly. Positions are computed, never drawn. */
/** Enough arc for a node and its label, whatever the count. */
export function radiusFor(count: number, smallest: number) {
  return Math.max(smallest, Math.ceil((count * 64) / (2 * Math.PI)));
}

function ring(
  doors: Door[],
  radius: number,
  from: number,
  picked: string,
  onPick: (id: string) => void,
) {
  return doors.map((door, index) => {
    const angle =
      ((from + (index * 360) / Math.max(doors.length, 1)) * Math.PI) / 180;
    const x = 250 + Math.cos(angle) * radius;
    const y = 232 + Math.sin(angle) * radius;
    return (
      <g
        key={door.id}
        className="pm-node"
        data-warn={
          door.reach === "internet" && door.unasked ? "yes" : undefined
        }
        data-picked={door.id === picked || undefined}
        role="button"
        tabIndex={0}
        aria-pressed={door.id === picked}
        aria-label={`${door.title}${door.port ? `, port ${door.port}` : ""}`}
        onClick={() => onPick(door.id)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onPick(door.id);
          }
        }}
      >
        <circle cx={x} cy={y} r={26} />
        <text className="pm-node-port" x={x} y={y + 4}>
          {door.port && door.port.length <= 6 ? door.port : "·"}
        </text>
        <title>{door.title}</title>
      </g>
    );
  });
}

export function PerimeterDirection({
  story,
  now,
  head,
  panel,
  onAsk,
}: ReachProps) {
  const read = story.firewall.state === "read";
  // "Everything else" is the model's way of saying what is refused. It is not
  // a way in, so it is a sentence under the map rather than a node on it.
  const ways = story.doors.filter((door) => door.id !== "rest");
  const rest = story.doors.find((door) => door.id === "rest") ?? null;

  const outside = ways.filter((door) => placeOf(door) === "outside");
  const restricted = ways.filter((door) => placeOf(door) === "restricted");
  const inside = ways.filter((door) => placeOf(door) === "inside");
  const unplaced = ways.filter((door) => placeOf(door) === "unplaced");
  // Deliberately not door.concern: the projection writes the same sentence
  // on every internet-reachable port, so counting those would report a public
  // website and an SSH port as things needing attention. What is actually
  // worth a look is a way in that answers the world and nobody has checked.
  const worth = ways.filter(
    (door) => door.reach === "internet" && door.unasked,
  );

  const within = [...restricted, ...inside];
  const innerR = radiusFor(within.length, 86);
  const outerR = Math.max(radiusFor(outside.length, 150), innerR + 78);
  const size = (outerR + 44) * 2;
  // The projection files three kinds under holes. A port being open to
  // everyone is established, and the map above says it better than a list.
  const unknowns = story.holes.filter((hole) => !hole.id.startsWith("open:"));
  const [picked, setPicked] = useState(() => worth[0]?.id ?? ways[0]?.id ?? "");
  const door = ways.find((one) => one.id === picked) ?? ways[0] ?? null;

  return (
    <div className="pm">
      {head}
      <div className="sg-section-content">
        <header className="pm-head">
          <div>
            <h2>What answers, and from where.</h2>
            <p>
              The outer ring is reachable from the internet. The inner ring
              needs to be on the server or inside the application&rsquo;s own
              network first.
            </p>
          </div>
          <span className="pm-count">
            {outside.length} {outside.length === 1 ? "answers" : "answer"} from
            the internet
            {unplaced.length > 0 && ` · ${unplaced.length} nobody has checked`}
          </span>
        </header>

        <div className="pm-layout">
          <div className="pm-map">
            <svg
              viewBox={`${250 - size / 2} ${232 - size / 2} ${size} ${size}`}
              aria-label="What can reach in"
            >
              <circle className="pm-ring-outer" cx="250" cy="232" r={outerR} />
              <circle className="pm-ring-inner" cx="250" cy="232" r={innerR} />
              <circle className="pm-core" cx="250" cy="232" r="46" />
              <text className="pm-ring-caption" x="250" y={232 - outerR - 26}>
                ANSWERS FROM THE INTERNET
              </text>
              <text className="pm-core-label" x="250" y="228">
                {story.name}
              </text>
              <text className="pm-core-note" x="250" y="245">
                {inside.length || restricted.length
                  ? "needs to be let in first"
                  : "nothing else on record"}
              </text>
              {ring(outside, outerR, -90, picked, setPicked)}
              {ring(within, innerR, -50, picked, setPicked)}
            </svg>

            <ul className="pm-key">
              <li data-tone="outside">
                <i aria-hidden="true" /> Answers from the internet
              </li>
              <li data-tone="inside">
                <i aria-hidden="true" /> Needs to be let in first
              </li>
              {worth.length > 0 && (
                <li data-tone="warn">
                  <i aria-hidden="true" /> Answers the world, and nobody has
                  checked it
                </li>
              )}
            </ul>

            <ol className="pm-list">
              {[
                ["Answers from the internet", outside] as const,
                ["Needs to be let in first", within] as const,
              ]
                .filter(([, list]) => list.length)
                .map(([heading, list]) => (
                  <li key={heading}>
                    <h4>{heading}</h4>
                    <div>
                      {list.map((one) => (
                        <button
                          key={one.id}
                          type="button"
                          aria-pressed={one.id === picked}
                          data-picked={one.id === picked || undefined}
                          data-warn={
                            one.reach === "internet" && one.unasked
                              ? "yes"
                              : undefined
                          }
                          onClick={() => setPicked(one.id)}
                        >
                          <code>{one.port}</code>
                          {one.title}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
            </ol>

            {unplaced.length > 0 && (
              <div className="pm-unplaced">
                <span>Not on the map: nobody has looked at these</span>
                <div>
                  {unplaced.map((one) => (
                    <button
                      key={one.id}
                      type="button"
                      aria-pressed={one.id === picked}
                      data-picked={one.id === picked || undefined}
                      onClick={() => setPicked(one.id)}
                    >
                      {one.title}
                      {one.port && <code>{one.port}</code>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="pm-caption">
              A ring is what it takes to reach something, not where the software
              runs. {rest?.detail ?? ""}
            </p>
          </div>

          {door ? (
            <Connection door={door} read={read} story={story} now={now} />
          ) : (
            <section className="pm-detail">
              <p className="pm-caption">
                No port, rule or process is on record for this application yet.
              </p>
            </section>
          )}
        </div>

        {panel}

        <section className="pm-around">
          <h3>Around the way in</h3>
          <dl>
            <div>
              <dt>The provider&rsquo;s firewall</dt>
              <dd>
                {story.firewall.detail}
                {rest && (
                  <span>
                    Anything no rule names is refused before it reaches the
                    host.
                  </span>
                )}
                <small>
                  {read
                    ? `Read from ${story.firewall.provider} ${ago(story.firewall.at, now)}`
                    : story.firewall.state === "none"
                      ? `Established as absent ${ago(story.firewall.at, now)}`
                      : "Nobody has read it back"}
                </small>
              </dd>
            </div>
            <div>
              <dt>Signing in to the server</dt>
              <dd>
                {story.ssh.detail}
                <small>
                  {story.ssh.told === "provider"
                    ? "From the provider"
                    : story.ssh.told === "stack"
                      ? "From the host itself"
                      : "From what the deployment asked for"}
                </small>
              </dd>
            </div>
            {story.guards.map((guard) => (
              <div key={guard.id}>
                <dt>{guard.title}</dt>
                <dd>
                  {guard.detail ?? "On record for this deployment."}
                  {guard.at && <small>Recorded {ago(guard.at, now)}</small>}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {unknowns.length > 0 && (
          <section className="pm-holes">
            <h3>What nobody has established</h3>
            <ul>
              {unknowns.map((hole) => (
                <li key={hole.id}>
                  <b>{hole.title}</b>
                  <small>{hole.detail}</small>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button
          type="button"
          className="pm-ask"
          onClick={() =>
            onAsk(
              `Check what actually answers on ${story.name}'s server from outside, port by port, and record what you find.`,
            )
          }
        >
          Ask Server Guy to check from outside
        </button>
      </div>
    </div>
  );
}

/** One connection: where it starts, what it crosses, and what that rests on. */
function Connection({
  door,
  read,
  story,
  now,
}: {
  door: Door;
  read: boolean;
  story: ReachProps["story"];
  now: number;
}) {
  const [more, setMore] = useState(false);
  const basis = basisOf(door, read);
  const place = placeOf(door);

  const start =
    place === "outside"
      ? "Anyone on the internet"
      : place === "restricted"
        ? "Only the networks named below"
        : place === "unplaced"
          ? "Not established"
          : "Something already on the server";

  // The middle says only what a record can support. No route is on record, so
  // this never draws hops it does not have.
  const middle =
    place === "unplaced"
      ? "Nothing has looked"
      : place === "outside"
        ? read
          ? "A rule on the provider's firewall allows it"
          : "The deployment asked for this port to be open"
        : place === "restricted"
          ? "Held to those networks at the provider"
          : "No port is published for it";

  return (
    <section className="pm-detail" aria-label={`${door.title}, in detail`}>
      <div className="pm-detail-top">
        <span className="pm-eyebrow">{BASIS_WORD[basis]}</span>
        {door.port && <code>:{door.port}</code>}
      </div>
      <h3>{door.title}</h3>
      {door.serves && <p className="pm-serves">{door.serves}</p>}

      <ol className="pm-route" data-unasked={door.unasked || undefined}>
        <li>
          <b>{start}</b>
          <small>where it would come from</small>
        </li>
        <li className="pm-route-cross">
          <span>{middle}</span>
          {door.port && <code>{door.port}</code>}
        </li>
        <li>
          <b>{door.title}</b>
          <small>on {story.name}&rsquo;s server</small>
        </li>
      </ol>

      {door.concern && <p className="pm-concern">{door.concern}</p>}

      <div className="pm-rests">
        <span className="pm-eyebrow">What that rests on</span>
        <p>{door.detail}</p>
        {door.sources.length > 0 && (
          <p className="pm-sources">
            Allowed to <code>{door.sources.join(", ")}</code>
          </p>
        )}
        {basis === "provider" && (
          <p className="pm-when">
            The rules were read from {story.firewall.provider}{" "}
            {ago(story.firewall.at, now)}. That is what the provider allows, not
            a check that this service answered.
          </p>
        )}
        {basis === "plan" && (
          <p className="pm-when">
            Nobody has read the provider&rsquo;s rules back, so this is what was
            asked for rather than what is in place.
          </p>
        )}
        {basis === "unasked" && (
          <p className="pm-when">
            Nothing has established whether this answers, or to whom. That is
            not a claim either way.
          </p>
        )}
      </div>

      <button
        type="button"
        className="pm-more"
        aria-expanded={more}
        onClick={() => setMore(!more)}
      >
        {more ? "Hide what is recorded" : "What is recorded"}
      </button>
      {more && (
        <dl className="pm-more-facts">
          <div>
            <dt>Port</dt>
            <dd>{door.port || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Reaches</dt>
            <dd>
              {door.unasked
                ? "Not established"
                : door.reach === "internet"
                  ? "The internet"
                  : door.reach === "restricted"
                    ? "The networks named above"
                    : door.reach === "private"
                      ? "Inside the server only"
                      : "Nothing"}
            </dd>
          </div>
          <div>
            <dt>Where that comes from</dt>
            <dd>{BASIS_WORD[basis]}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
