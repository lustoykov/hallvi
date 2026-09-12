"use client";

// PROTOTYPE · opus-ui-improvements · Security, direction C.
// Statement: no picture at all. The exposure is said out loud, at the size
// it deserves, one clause per way in — and every marked phrase carries its
// evidence, which opens underneath it. Then the fine print: the rules as a
// short ledger, and what none of this proves. A page you could read aloud
// to someone who asked "so who can get in?".

import { ArrowsClockwise, ChatCircleText } from "@phosphor-icons/react";
import { useState } from "react";

import { LittleServer } from "../deployment-prototype/little-server";
import type { ReachDirectionProps } from "./index";
import { ago, when, type Door } from "./reach-model";
import "./statement.css";

interface Claim {
  id: string;
  lead: string;
  mark: string;
  tail: string;
  tone: "warn" | "plain" | "good" | "unknown";
  /** What makes the clause true, in the record. */
  source: string;
  at: string | null;
  facts: [string, string][];
}

const listSources = (door: Door) =>
  door.sources.length ? door.sources.join(", ") : "none";

export function StatementDirection({
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
  const [open, setOpen] = useState<string | null>(null);
  const doors = story.doors.filter((door) => door.id !== "rest");
  const read = story.firewall.state === "read";
  const privates = doors.filter((door) => door.reach === "private");
  const walled =
    story.doors.find((door) => door.id === "rest")?.reach === "closed";
  // A rule that opens a private service undoes what makes it private.
  const pierced = privates.filter((door) =>
    doors.some(
      (other) => other.reach === "internet" && other.port === door.port,
    ),
  );
  const claims: Claim[] = [
    ...doors
      .filter((door) => door.reach === "internet")
      .map((door, index) => ({
        id: door.id,
        lead: index
          ? "The same goes for "
          : "Anyone on the internet can reach ",
        mark: door.port ? `port ${door.port} · ${door.title}` : door.title,
        tail: door.unasked ? ", which this deployment never asked for." : ".",
        tone: "warn" as const,
        source: door.toldWords,
        at: door.at,
        facts: [
          ["Behind it", door.serves ?? "Nothing recorded listens"],
          ["Allowed sources", listSources(door)],
          [
            "Ever answered",
            door.proof
              ? `${door.proof.words} · ${when(door.proof.at)}`
              : "Nothing has tested it",
          ],
          ...(door.concern ? ([["Worth knowing", door.concern]] as const) : []),
        ] as [string, string][],
      })),
    ...doors
      .filter((door) => door.reach === "restricted")
      .map((door) => ({
        id: door.id,
        lead: "",
        mark: door.reachWords,
        tail: ` opens ${door.title}.`,
        tone: "good" as const,
        source: door.toldWords,
        at: door.at,
        facts: [
          ["Behind it", door.serves ?? "Nothing recorded listens"],
          ["Allowed sources", listSources(door)],
          [
            "Ever answered",
            door.proof
              ? `${door.proof.words} · ${when(door.proof.at)}`
              : "Nothing has tested it",
          ],
        ] as [string, string][],
      })),
    ...(privates.length
      ? [
          {
            id: "private",
            lead: "",
            mark: privates.map((door) => door.title).join(" and "),
            tail: pierced.length
              ? " publishes no port of its own, so that rule is the only reason anything outside can reach it."
              : " answers only inside the server, with no port published at all.",
            tone: pierced.length ? ("warn" as const) : ("good" as const),
            source: "From the release the deployment ran",
            at: privates[0]?.proof?.at ?? null,
            facts: privates.map(
              (door) =>
                [
                  door.title,
                  `${door.port ? `port ${door.port} · ` : ""}${door.proof ? `${door.proof.words} · ${when(door.proof.at)}` : "no check on record"}`,
                ] as [string, string],
            ),
          },
        ]
      : []),
    {
      id: "rest",
      lead: walled ? "Everything else is " : "Nothing else is stopped: ",
      mark: walled
        ? "refused at the provider"
        : "No attached firewall restricts incoming traffic",
      tail: walled
        ? ", before the server ever sees it."
        : ", so whether a port answers is left to the host.",
      tone: walled ? "plain" : "warn",
      source: read
        ? "No other inbound rule is reported"
        : "The deployment asked for no other port",
      at: story.firewall.at,
      facts: [
        [
          "Firewall",
          `${story.firewall.provider}${story.firewall.name ? ` · ${story.firewall.name}` : ""}`,
        ],
        ["State", story.firewall.detail],
      ],
    },
    {
      id: "how",
      lead: read ? "The provider " : "Nothing has ",
      mark: read ? "confirmed these rules" : "read the firewall back",
      tail: read
        ? ` ${ago(story.firewall.at, now)}.`
        : " since the deployment set it.",
      tone: read ? "good" : "unknown",
      source: read
        ? `Read from ${story.firewall.provider}`
        : "The rules above are what was asked for, not what was seen",
      at: story.firewall.at,
      facts: [
        ["SSH", `${story.ssh.word} · ${story.ssh.detail}`],
        ...story.guards.map(
          (guard) => [guard.title, guard.detail] as [string, string],
        ),
      ],
    },
  ];
  const shown = claims.find((claim) => claim.id === open) ?? null;

  return (
    <section className="axno" aria-label="Security">
      {head}
      {activity}
      {panel}
      <div className="axno-top">
        <span className="axno-kicker">Who can reach {story.name}, in full</span>
        <div className="axno-acts">
          {onCheck && (
            <button
              type="button"
              className="ax-button axno-check"
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
            className="ax-button axno-ask"
            onClick={() =>
              onAsk(
                `Read ${story.name}'s firewall from the provider and tell me whether it still matches what the deployment asked for.`,
              )
            }
          >
            <ChatCircleText weight="bold" />
            Ask about the rules
          </button>
        </div>
      </div>

      <h2 className="axno-say">
        {claims.map((claim) => (
          <span key={claim.id} className="axno-clause">
            {claim.lead}
            <button
              type="button"
              className="axno-mark"
              data-tone={claim.tone}
              data-on={open === claim.id || undefined}
              aria-expanded={open === claim.id}
              onClick={() => setOpen(open === claim.id ? null : claim.id)}
            >
              {claim.mark}
            </button>
            {claim.tail}{" "}
          </span>
        ))}
      </h2>

      {shown && (
        <div className="axno-evidence" role="region" aria-label="Evidence">
          <div className="axno-evidence-head">
            <b>{shown.source}</b>
            {shown.at && <span>{when(shown.at)}</span>}
          </div>
          <dl className="ax-facts">
            {shown.facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="axno-scroll">
        <table className="axno-ledger">
          <caption>Every inbound rule the record can account for</caption>
          <thead>
            <tr>
              <th scope="col">Port</th>
              <th scope="col">What is behind it</th>
              <th scope="col">Who may</th>
              <th scope="col">How this is known</th>
            </tr>
          </thead>
          <tbody>
            {story.doors.map((door) => (
              <tr key={door.id} data-reach={door.reach}>
                <th scope="row">
                  <code>{door.port || "—"}</code>
                  {door.protocol && <small>{door.protocol}</small>}
                </th>
                <td>
                  {door.title}
                  {door.serves && <small>{door.serves}</small>}
                </td>
                <td>
                  {door.reachWords}
                  {door.sources.length > 0 && (
                    <small>{listSources(door)}</small>
                  )}
                </td>
                <td>
                  {door.toldWords}
                  {door.at && <small>{when(door.at)}</small>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="axno-fine">
        <h3>What none of this proves</h3>
        <ul>
          {story.holes.map((hole) => (
            <li key={hole.id}>
              <b>{hole.title}.</b> {hole.detail}
            </li>
          ))}
        </ul>
      </div>

      <footer className="axno-sign">
        <LittleServer mood={read ? "ready" : "resting"} className="axno-guy" />
        <p>
          {read
            ? `Read from ${story.firewall.provider}${story.firewall.name ? ` · ${story.firewall.name}` : ""} ${ago(story.firewall.at, now)}.`
            : `Asked of ${story.firewall.provider}${story.firewall.at ? ` on ${when(story.firewall.at)}` : ""}, and not read back since.`}{" "}
          These are the instance&rsquo;s own rules, shared by every application
          on it.
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
