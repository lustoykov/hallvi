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
  answered: "A connection check answered",
  // "Refused" in the record covers a refusal and a dropped connection
  // alike, and the detail underneath often says which. Do not narrow it
  // here: a line that says "refused" over a detail that says "timed out"
  // contradicts itself.
  refused: "A connection check did not get through",
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

/**
 * What to write in a node.
 *
 * A published port is `18321 → 3000`, which is two numbers and does not fit a
 * circle — and the node used to give up and draw a middle dot, so the one
 * port `Notes` has on record was drawn as an unlabelled bubble. The number
 * that matters from outside is the first one; the whole mapping is in the
 * panel beside it and in the node's own tooltip.
 */
function portLabel(door: Door) {
  const outer = door.port?.split(/\s*→\s*/)[0]?.trim();
  return outer && outer.length <= 7 ? outer : (outer?.slice(0, 6) ?? "");
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
        // A way in that stops at the boundary is on the map, drawn as
        // stopped. It used to be exiled to a box underneath, which left the
        // one diagram on the page answering "what is let in" with half the
        // ports it had.
        data-refused={placeOf(door) === "refused" || undefined}
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
          {portLabel(door)}
        </text>
        <title>
          {door.title}
          {door.port ? ` · ${door.port}` : ""}
        </title>
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
  // Everything that arrives from the internet, whether it answered or was
  // refused. Both are what a reader came to see, and the node says which.
  const arriving = [...outside, ...refused];
  /**
   * Rings that hold their content, rather than a fixed circle the real data
   * never fills.
   *
   * The floors were sized for a crowd — an outer ring of 150 around an inner
   * of 86 around a 46 core — so an application with one port was two empty
   * circles and a name, and `Notes`, whose only port is on the inner ring,
   * drew a large empty ring captioned OPEN TO THE INTERNET around it. The
   * inner ring is drawn only when something is on it, and the outer one
   * keeps a tighter distance when nothing is.
   */
  const coreR = 44;
  const innerR = within.length
    ? Math.max(radiusFor(within.length, 92), coreR + 48)
    : coreR;
  const outerR = Math.max(
    arriving.length ? radiusFor(arriving.length, 118) : 0,
    innerR + (arriving.length ? 72 : 46),
  );
  // Room for the node that sits on top of the ring, and for the caption
  // above it: the first port is placed at -90°, so a caption tucked close to
  // the ring was drawn inside that node's own circle.
  const size = (outerR + 52) * 2;
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
      <div className="hv-section-content">
        <header className="pm-head">
          <div>
            <h2>What is let in, and from where.</h2>
            <p>
              {/* What is actually drawn below, which is not always two
                  rings: the inner one exists only when something is on it,
                  and the outer one holds ports that refused as well as ones
                  that answered. */}
              {ways.length === 0
                ? "No record names a port on this server. What has been established about the way in is below."
                : [
                    within.length
                      ? "The outer ring is what reaches in from the internet; the inner one is what has to be let in first."
                      : "The ring is what reaches in from the internet.",
                    refused.length
                      ? "A dashed port is one that refused the connection when it was checked."
                      : null,
                    "Select a port to see what is configured and what has been checked.",
                  ]
                    .filter(Boolean)
                    .join(" ")}
            </p>
          </div>
          {ways.length > 0 && (
            <span className="pm-count">
              {outside.length} open to the internet
              {answered.length > 0 &&
                ` · ${answered.length} answered when checked`}
              {refused.length > 0 && ` · ${refused.length} refused`}
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
                // The map is as big as what is on it. Stretching it to the
                // column's full width scaled one port up to fill 520px,
                // which is how two circles and a name came to take up half
                // the page.
                style={{ width: size, maxWidth: "100%" }}
                aria-label="What can reach in"
              >
                <circle
                  className="pm-ring-outer"
                  cx="250"
                  cy="232"
                  r={outerR}
                />
                {within.length > 0 && (
                  <circle
                    className="pm-ring-inner"
                    cx="250"
                    cy="232"
                    r={innerR}
                  />
                )}
                <circle className="pm-core" cx="250" cy="232" r={coreR} />
                <text className="pm-ring-caption" x="250" y={232 - outerR - 34}>
                  {/* The ring holds what arrives from the internet, which
                      includes a port that refused it. Calling the ring
                      itself "open" was true only while the refused ones
                      were drawn somewhere else. */}
                  {refused.length > 0
                    ? "FROM THE INTERNET"
                    : "OPEN TO THE INTERNET"}
                </text>
                <text className="pm-core-label" x="250" y="228">
                  {story.name}
                </text>
                <text className="pm-core-note" x="250" y="245">
                  {inside.length || restricted.length
                    ? "needs to be let in first"
                    : "nothing else on record"}
                </text>
                {ring(arriving, outerR, -90, picked, setPicked)}
                {ring(within, innerR, -50, picked, setPicked)}
              </svg>

              {/* One list, grouped, rather than a legend and three boxes
                  saying the same ports over again. Each chip carries its own
                  state, which is what the key used to be for. */}
              <ol className="pm-list">
                {(
                  [
                    ["Open to the internet", outside, undefined],
                    ["Needs to be let in first", within, undefined],
                    ["Refused when checked", refused, "refused"],
                    ["Nobody has looked at these", unplaced, "unasked"],
                  ] as const
                )
                  .filter(([, list]) => list.length)
                  .map(([heading, list, kind]) => (
                    <li key={heading} data-kind={kind}>
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
                            {one.port && <code>{one.port}</code>}
                            {one.title}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
              </ol>

              <p className="pm-caption">
                A ring is what it takes to reach something, not where the
                software runs.
                {answered.length > 0 &&
                  " A heavier ring is a port something connected to."}
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
          Ask Hallvi to check from outside
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
    place === "outside"
      ? "Anyone on the internet"
      : place === "refused"
        ? "The recorded connection check"
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
      ? "The check did not connect"
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
              ? `did not answer this check on ${story.name}’s server`
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
        {door.detail && <p>{door.detail}</p>}
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
              ? "Something accepted the recorded connection check on this port"
              : "The recorded connection check did not get through to this port"}
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
                      : "Did not answer the recorded check"}
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
