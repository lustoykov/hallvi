"use client";

// Security, as a cross-section from the internet inwards.
//
// This replaces the perimeter's concentric rings. The idea the rings were
// after is kept — distance means how far in something gets — and the circle
// is dropped, because that was the part that did not work. Its radii were
// sized for a crowd the records never have: an application names one to four
// ports, and a ring drawn for a dozen spent half a page saying so, with an
// empty "open to the internet" circle around applications that have nothing
// open to the internet.
//
// Bands stack from outside in and a way in is drawn in the band where it
// stops. That has three consequences the rings could not manage:
//
//   - A port whose check did not get through is on the map, in its own band.
//     The check alone cannot say where the connection stopped.
//   - The provider's firewall policy is in the picture as separate evidence;
//     a failed connection does not prove that policy caused it.
//   - An empty band costs one line. Saying "nothing answers from the
//     internet" no longer requires drawing a circle around nothing.
//
// Where a way in stops and how sure we are it stops there are two different
// questions, and the ring had one circle for both — certainty survived only
// as the weight of a stroke. Here the band answers the first and the chip
// answers the second.

import { useState } from "react";

import { ago } from "../architecture-prototype/model";
import {
  Ask,
  Board,
  Clip,
  Figure,
  Foot,
  Lede,
  Name,
  None,
  Num,
  Opened,
  Register,
  Strip,
  Tag,
  type Tone,
} from "../register";
import type { Door, ReachProps } from "./reach-story";

import "./layers.css";

/**
 * Where a way in stops, which is the band it is drawn in.
 *
 * `refused` is its own outcome rather than a kind of `outside`: its recorded
 * check did not get through. The check does not locate what stopped it.
 */
type Place = "outside" | "refused" | "restricted" | "inside" | "unasked";

function placeOf(door: Door): Place {
  if (door.reach === "closed") return "refused";
  if (door.unasked) return "unasked";
  if (door.reach === "internet") return "outside";
  if (door.reach === "restricted") return "restricted";
  return "inside";
}

/**
 * What established this one door.
 *
 * Only the first two are readings: the port probe opened a TCP connection
 * from outside and wrote down what happened. `looked` is a check that ran and
 * did not settle it, which is neither a reading nor nobody having looked —
 * and it is the one most easily lost, because rounding it down to "nothing
 * has connected to it" is the softer sentence. `configured` is the deployment
 * having asked for the port, which is not evidence about it at all.
 *
 * The application-wide firewall read is deliberately not one of these. It
 * establishes what the provider allows and is never a reading of any single
 * port.
 */
type Basis = NonNullable<Door["established"]>;

const BASIS_WORD: Record<Basis, string> = {
  answered: "A connection check answered",
  // "Refused" in the record covers a refusal and a dropped connection alike,
  // and the detail underneath often says which. Do not narrow it here: a line
  // that says "refused" over a detail that says "timed out" contradicts
  // itself.
  refused: "A connection check did not get through",
  looked: "A check ran without settling it",
  configured: "From the deployment's own configuration",
  unasked: "Nobody has connected to it",
};

/** The short form, for the chip. */
const BASIS_SHORT: Record<Basis, string> = {
  answered: "answered",
  refused: "refused",
  looked: "unsettled",
  configured: "not checked",
  unasked: "not checked",
};

function basisOf(door: Door): Basis {
  return door.established ?? (door.unasked ? "unasked" : "configured");
}

/** Certainty, as a colour. Only a reading is ever green or red. */
const BASIS_TONE: Record<Basis, Tone> = {
  answered: "good",
  refused: "good",
  looked: "warn",
  configured: "idle",
  unasked: "idle",
};

const PLACE_WORD: Record<Place, string> = {
  outside: "the internet",
  refused: "did not get through",
  restricted: "named networks",
  inside: "the server itself",
  unasked: "not established",
};

/** Pi's phrases are not always punctuated; these are run together. */
const stop = (text: string) => (/[.!?]$/.test(text.trim()) ? text : `${text}.`);

/** Whether a check was run at all, settled or not. */
function probed(door: Door) {
  const basis = basisOf(door);
  return basis === "answered" || basis === "refused" || basis === "looked";
}

/**
 * The bands, outermost first.
 *
 * Every one of them is drawn even when nothing is in it, because an empty
 * band is an answer: "nothing on record answers from the internet" is what a
 * reader came for, and it costs a line here rather than a ring.
 */
const BANDS: {
  id: string;
  title: string;
  holds: Place;
  empty: string;
}[] = [
  {
    id: "internet",
    title: "The internet",
    holds: "outside",
    empty: "Nothing on record answers from out here.",
  },
  {
    id: "unreached",
    title: "Did not get through",
    holds: "refused",
    empty: "No recorded connection check failed to get through.",
  },
  {
    id: "named",
    title: "Named networks only",
    holds: "restricted",
    empty: "No port is held to a named network.",
  },
  {
    id: "inside",
    title: "The server itself",
    holds: "inside",
    empty: "Nothing on record listens only on the server.",
  },
];

export function LayersDirection({
  story,
  now,
  head,
  panel,
  onAsk,
}: ReachProps) {
  // "Everything else" is the projection's way of saying what the firewall
  // refuses by default. It is a property of the wall, not a way in, so it is
  // said in the firewall band rather than drawn as a port.
  const ways = story.doors.filter((door) => door.id !== "rest");
  const rest = story.doors.find((door) => door.id === "rest") ?? null;
  const unasked = ways.filter((door) => placeOf(door) === "unasked");
  const [picked, setPicked] = useState<string | null>(null);
  const door = ways.find((one) => one.id === picked) ?? null;

  const outside = ways.filter((one) => placeOf(one) === "outside");
  const refusedWays = ways.filter((one) => placeOf(one) === "refused");
  const checked = ways.filter(probed);
  // The projection files three kinds under holes. A port being open to
  // everyone is established, not unestablished, and the band above says it
  // better than a list — so listing it under "what nobody has established"
  // contradicts the drawing directly above it.
  const unknowns = story.holes.filter((hole) => !hole.id.startsWith("open:"));

  function chip(one: Door) {
    const basis = basisOf(one);
    return (
      <button
        key={one.id}
        type="button"
        className="ly-chip"
        data-basis={basis}
        data-picked={one.id === picked || undefined}
        aria-pressed={one.id === picked}
        title={one.title}
        onClick={() => setPicked(one.id === picked ? null : one.id)}
      >
        <code>{one.port || "no port on record"}</code>
        <span className="ly-chip-what">{one.serves ?? one.title}</span>
        <em>{BASIS_SHORT[basis]}</em>
      </button>
    );
  }

  return (
    <div className="ly">
      {head}
      {/* The answer first, as four figures, then the picture of how far in
          each way gets, then the inventory for whoever wants it row by row.
          One hierarchy, rather than three tables of equal weight. */}
      <div className="hv-rg-sheet ly-summary">
        <Lede
          holds={`${ways.length} ${ways.length === 1 ? "way in" : "ways in"} on record · ${checked.length} of ${ways.length} connection checked`}
        >
          What can reach this server, how far in each way gets, and what that
          rests on.
        </Lede>
        <Strip>
          <Figure
            label="Answers the internet"
            value={outside.length}
            note={
              outside.length
                ? outside.map((one) => one.port || one.title).join(", ")
                : "Nothing on record answers from outside"
            }
          />
          <Figure
            label="Did not get through"
            // A count, not a verdict: exposure is stated, never graded. A
            // public site may deliberately face the internet.
            value={refusedWays.length}
            note={
              refusedWays.length
                ? refusedWays.map((one) => one.port || one.title).join(", ")
                : "No connection check was refused"
            }
          />
          <Figure
            label="SSH"
            value={story.ssh.word}
            tone={
              story.ssh.tone === "verified"
                ? "good"
                : story.ssh.tone === "failed"
                  ? "bad"
                  : "warn"
            }
            note={story.ssh.detail}
          />
          <Figure
            label="Firewall"
            value={
              story.firewall.state === "read"
                ? "Read back"
                : story.firewall.state === "none"
                  ? "None"
                  : "Not read"
            }
            tone={story.firewall.state === "read" ? "good" : "warn"}
            note={
              story.firewall.state === "read"
                ? `${story.firewall.provider} · ${ago(story.firewall.at, now)}`
                : story.firewall.detail
            }
          />
        </Strip>
      </div>
      <div className="hv-section-content">
        <header className="ly-head">
          <div>
            <h2>What is let in, and from where.</h2>
            <p>
              {ways.length === 0
                ? "No record names a port on this server. What has been established about the way in is below."
                : "Each band is one step further in, and a way in sits in the band where it stops. Select one to see what it rests on."}
            </p>
          </div>
        </header>

        {ways.length > 0 && (
          <div className="ly-stack">
            {BANDS.map((band) => {
              const list = ways.filter((one) => placeOf(one) === band.holds);
              return (
                <section key={band.id} className="ly-band" data-band={band.id}>
                  <header>
                    <h3>{band.title}</h3>
                    {band.id === "unreached" && (
                      <small>
                        A connection check does not identify what stopped it.{" "}
                        {story.firewall.state === "read"
                          ? [
                              stop(story.firewall.detail),
                              rest
                                ? "Anything no rule names is refused before it reaches the host."
                                : null,
                              `Read from ${story.firewall.provider} ${ago(story.firewall.at, now)}.`,
                            ]
                              .filter(Boolean)
                              .join(" ")
                          : story.firewall.state === "none"
                            ? `A record says there is no firewall in front of this server. Established as absent ${ago(story.firewall.at, now)}.`
                            : "Nobody has read the policy back, so nothing here can say what it lets through."}
                      </small>
                    )}
                  </header>
                  <div className="ly-chips">
                    {list.length ? (
                      list.map(chip)
                    ) : (
                      <p className="ly-empty">{band.empty}</p>
                    )}
                  </div>
                </section>
              );
            })}

            <section className="ly-band ly-core">
              <h3>{story.name}</h3>
              <small>{story.ssh.detail}</small>
            </section>
          </div>
        )}

        {/* Outside the stack on purpose. A port nobody has looked at has no
            band, because which one it belongs in is exactly what is not
            known, and putting it in one would be the page answering its own
            open question. */}
        {unasked.length > 0 && (
          <section className="ly-unasked">
            <h3>
              Nobody has looked at {unasked.length === 1 ? "this one" : "these"}
            </h3>
            <p>
              Which band {unasked.length === 1 ? "it belongs" : "they belong"}{" "}
              in is what has not been established.
            </p>
            <div className="ly-chips">{unasked.map(chip)}</div>
          </section>
        )}

        {door && <Rests door={door} story={story} now={now} />}

        {panel}

        {ways.length > 0 && (
          <Board
            title="Ways in"
            note="Every port on record. A row opens what it rests on."
          >
            <Register
              rows={ways}
              columns={[
                {
                  key: "port",
                  head: "Port",
                  width: 120,
                  sort: (row) => Number.parseInt(row.port, 10) || 0,
                  cell: (row) =>
                    row.port ? <Name mono title={row.port} /> : <None />,
                },
                {
                  key: "what",
                  head: "What answers there",
                  cell: (row) => <Clip text={row.serves ?? row.title} />,
                },
                {
                  key: "stops",
                  head: "Gets as far as",
                  width: 170,
                  sort: (row) => placeOf(row),
                  cell: (row) => PLACE_WORD[placeOf(row)],
                },
                {
                  key: "sources",
                  head: "Open to",
                  width: 190,
                  cell: (row) =>
                    row.sources.length ? (
                      <Clip text={row.sources.join(", ")} mono />
                    ) : (
                      <None>not stated</None>
                    ),
                },
                {
                  key: "basis",
                  head: "Rests on",
                  width: 116,
                  cell: (row) => (
                    <Tag tone={BASIS_TONE[basisOf(row)]}>
                      {BASIS_SHORT[basisOf(row)]}
                    </Tag>
                  ),
                },
                {
                  key: "at",
                  head: "Checked",
                  width: 100,
                  align: "end",
                  cell: (row) =>
                    row.at ? <Num>{ago(row.at, now)}</Num> : <None>—</None>,
                },
              ]}
              tone={(row) => (probed(row) ? "plain" : "idle")}
              detail={(row) => (
                <Opened
                  asks={
                    <Ask
                      onAsk={onAsk}
                      prompt={`Connect to port ${row.port || row.title} on ${story.name}'s server from outside and record what happens.`}
                    >
                      Check this port from outside
                    </Ask>
                  }
                >
                  <Rests door={row} story={story} now={now} />
                </Opened>
              )}
            />
            <Foot>
              <span>
                {rest
                  ? stop(rest.detail)
                  : "A connection check does not identify what stopped it; only the firewall policy, read back, can."}
              </span>
            </Foot>
          </Board>
        )}

        {/* With no port on record the bands have nothing to hold, so the two
            facts that do exist are said plainly instead. */}
        {ways.length === 0 && (
          <section className="ly-guards">
            <h3>Around the way in</h3>
            <dl>
              <div>
                <dt>The provider&rsquo;s firewall</dt>
                <dd>
                  {story.firewall.detail}
                  <small>
                    {story.firewall.state === "read"
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
            </dl>
          </section>
        )}

        {unknowns.length > 0 && (
          <section className="ly-holes">
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
          className="hv-primary-button"
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

/**
 * What the selected way in rests on.
 *
 * Below the stack rather than beside it: a permanent side panel is the one
 * layout this product does not use, and the band above already said where
 * this port stops, so what is left to say is the evidence.
 */
function Rests({
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

  return (
    <section className="ly-rests" aria-label={`${door.title}, in detail`}>
      <header>
        <span className="ly-eyebrow">{BASIS_WORD[basis]}</span>
        {door.port && <code>{door.port}</code>}
      </header>
      <h3>{door.title}</h3>
      {door.serves && <p className="ly-serves">{door.serves}</p>}

      {/* `door.concern` is not rendered. The projection writes one sentence,
          "Anyone on the internet can reach this port", on every internet door
          and nothing else ever. The band above already says that, and saying
          it again in a coloured panel turns a public website into an
          incident. */}
      {door.detail && <p className="ly-detail">{door.detail}</p>}
      {door.sources.length > 0 && (
        <p className="ly-sources">
          Allowed to <code>{door.sources.join(", ")}</code>
        </p>
      )}
      <p className="ly-when">
        {basis === "answered"
          ? `Something accepted the recorded connection check on this port, ${ago(door.at ?? null, now)}.`
          : basis === "refused"
            ? `The recorded connection check did not get through to this port, ${ago(door.at ?? null, now)}.`
            : basis === "looked"
              ? `A check ran on this port ${ago(door.at ?? null, now)} and did not settle whether it answers.`
              : "The port and who it is open to are on record because the deployment set them; nothing has connected to it to find out what happens. That is not a claim either way."}
      </p>

      <button
        type="button"
        className="ly-more"
        aria-expanded={more}
        onClick={() => setMore(!more)}
      >
        {more ? "Hide what is recorded" : "What is recorded"}
      </button>
      {more && (
        <dl className="ly-more-facts">
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
                      ? `Inside ${story.name}'s server only`
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

export { placeOf, basisOf, probed, BANDS };
