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
// It marked every service "checked", as though somebody had connected to all
// of them. Some ports have been connected to: the port probe opens a TCP
// connection from outside and records `open` or `refused` on that port. Most
// have not. So each door says what established it, from its own record and
// never from the application-wide firewall read, which is evidence about the
// provider's rules and about no single port.
//
// It inferred a route. A route is not on record either, so the middle of the
// connection says only what the record supports: a published port, a rule
// held to one network, or no published port at all.
//
// And it had a tidy notion of "unexpected". A port nobody has looked at is
// uncertainty, not an opening someone left behind, and it is drawn as the
// first and coloured as neither.

import { useState } from "react";

import { ago } from "../architecture-prototype/model";
import type { Door, ReachProps } from "./reach-story";

import "./perimeter.css";

/**
 * Where a door sits. A refused port is its own place: it is a way in that
 * stops at the boundary, and putting it on the inner ring would draw it as a
 * service waiting for someone already inside.
 */
type Place = "outside" | "restricted" | "inside" | "refused" | "unplaced";

function placeOf(door: Door): Place {
  if (door.reach === "closed") return "refused";
  if (door.unasked) return "unplaced";
  if (door.reach === "internet") return "outside";
  if (door.reach === "restricted") return "restricted";
  return "inside";
}

/**
 * What established this one door, in words.
 *
 * Only the first two are observations: the port probe connected from outside
 * and wrote down what happened. The rest are configuration, and say so. The
 * firewall read is not here on purpose — it establishes what the provider
 * allows, which is not a reading of any particular port.
 */
type Basis = NonNullable<Door["established"]>;

const BASIS_WORD: Record<Basis, string> = {
  answered: "A check connected to it from outside",
  // "Refused" in the record covers a refusal and a dropped connection
  // alike, and the detail underneath often says which. Do not narrow it
  // here: a line that says "refused" over a detail that says "timed out"
  // contradicts itself.
  refused: "A check from outside got nothing through",
  looked: "A check ran without settling it",
  configured: "From the deployment's own configuration",
  unasked: "Nobody has connected to it",
};

function basisOf(door: Door): Basis {
  return door.established ?? (door.unasked ? "unasked" : "configured");
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
        data-open={door.established === "answered" || undefined}
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
  const refused = ways.filter((door) => placeOf(door) === "refused");
  const unplaced = ways.filter((door) => placeOf(door) === "unplaced");
  // How many of the ways in have actually been connected to. The rest are on
  // record because the deployment configured them, which is a weaker thing
  // and is never written as though someone had looked.
  const answered = outside.filter((door) => door.established === "answered");

  const within = [...restricted, ...inside];
  const innerR = radiusFor(within.length, 86);
  const outerR = Math.max(radiusFor(outside.length, 150), innerR + 78);
  const size = (outerR + 44) * 2;
  // The projection files three kinds under holes. A port being open to
  // everyone is established, and the map above says it better than a list.
  const unknowns = story.holes.filter((hole) => !hole.id.startsWith("open:"));
  const [picked, setPicked] = useState(
    () => outside[0]?.id ?? ways[0]?.id ?? "",
  );
  const door = ways.find((one) => one.id === picked) ?? ways[0] ?? null;

  return (
    <div className="pm">
      {head}
      <div className="sg-section-content">
        <header className="pm-head">
          <div>
            <h2>What is let in, and from where.</h2>
            <p>
              {ways.length === 0
                ? "No record names a port on this server. What has been established about the way in is below."
                : "The outer ring is open to the internet. The inner ring limits access to specific sources or the server itself. Select a port to see what is configured and what has been checked."}
            </p>
          </div>
          {ways.length > 0 && (
            <span className="pm-count">
              {outside.length} open to the internet
              {answered.length > 0 &&
                ` · ${answered.length} answered when checked`}
              {unplaced.length > 0 &&
                ` · ${unplaced.length} nobody has checked`}
            </span>
          )}
        </header>

        {/* Two empty rings around a name are decoration. With nothing to
            place, the page is the paragraph above and what is below it. */}
        {ways.length > 0 && (
          <div className="pm-layout">
            <div className="pm-map">
              <svg
                viewBox={`${250 - size / 2} ${232 - size / 2} ${size} ${size}`}
                aria-label="What can reach in"
              >
                <circle
                  className="pm-ring-outer"
                  cx="250"
                  cy="232"
                  r={outerR}
                />
                <circle
                  className="pm-ring-inner"
                  cx="250"
                  cy="232"
                  r={innerR}
                />
                <circle className="pm-core" cx="250" cy="232" r="46" />
                <text className="pm-ring-caption" x="250" y={232 - outerR - 26}>
                  OPEN TO THE INTERNET
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
                  <i aria-hidden="true" /> Open to the internet
                </li>
                <li data-tone="inside">
                  <i aria-hidden="true" /> Needs to be let in first
                </li>
                {answered.length > 0 && (
                  <li data-tone="open">
                    <i aria-hidden="true" /> A check connected to it
                  </li>
                )}
              </ul>

              <ol className="pm-list">
                {[
                  ["Open to the internet", outside] as const,
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
                            data-open={
                              one.established === "answered" || undefined
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

              {refused.length > 0 && (
                <div className="pm-unplaced" data-kind="refused">
                  <span>
                    Stopped at the boundary: a check from outside got nothing
                    through on{" "}
                    {refused.length === 1 ? "this port" : "these ports"}
                  </span>
                  <div>
                    {refused.map((one) => (
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
                A ring is what it takes to reach something, not where the
                software runs.
              </p>
            </div>

            {door && <Connection door={door} story={story} now={now} />}
          </div>
        )}

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
  story,
  now,
}: {
  door: Door;
  story: ReachProps["story"];
  now: number;
}) {
  const [more, setMore] = useState(false);
  const basis = basisOf(door);
  const place = placeOf(door);

  const start =
    place === "outside" || place === "refused"
      ? "Anyone on the internet"
      : place === "restricted"
        ? "Only the networks named below"
        : place === "unplaced"
          ? "Not established"
          : "Something already on the server";

  // The middle says only what a record can support. No route is on record, so
  // this never draws hops it does not have, and the firewall read is never
  // borrowed as evidence about this port.
  const middle =
    place === "refused"
      ? "Nothing got through from outside"
      : place === "unplaced"
        ? "Nothing has looked"
        : place === "outside"
          ? "This port is open to everyone"
          : place === "restricted"
            ? "Held to those networks"
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
          <small>
            {place === "refused"
              ? `never reached on ${story.name}’s server`
              : `on ${story.name}’s server`}
          </small>
        </li>
      </ol>

      {/* door.concern is not rendered. The projection writes one sentence,
          "Anyone on the internet can reach this port", on every internet door
          and nothing else ever. The route above already says that, and saying
          it again in a coloured panel turns a public website into an
          incident. */}
      <div className="pm-rests">
        <span className="pm-eyebrow">What that rests on</span>
        <p>{door.detail}</p>
        {door.sources.length > 0 && (
          <p className="pm-sources">
            Allowed to <code>{door.sources.join(", ")}</code>
          </p>
        )}
        {(basis === "unasked" || basis === "configured") && (
          <p className="pm-when">
            The port and who it is open to are on record because the deployment
            set them; nothing has connected to it to find out what happens. That
            is not a claim either way.
          </p>
        )}
        {basis === "looked" && (
          <p className="pm-when">
            A check ran on this port and did not settle whether it answers.
          </p>
        )}
        {(basis === "answered" || basis === "refused") && (
          <p className="pm-when">
            {basis === "answered"
              ? "Something accepted a connection on this port from outside"
              : "Nothing got through to this port from outside"}
            , {ago(door.at ?? null, now)}.
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
