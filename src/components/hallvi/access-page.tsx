"use client";

// Access, on real records. One destination for "who can reach it".
//
// It opens on what a visitor meets, because that is the question an owner
// arrives with, and it answers it in the words of the checks that looked. Then
// every port, most public first, with the firewall as its footer. Then the
// path a visitor takes, lit only where a check saw it work.
//
// There is no title and no verdict line on top: the first board is the answer,
// and a page that grades itself above it says the same thing twice.

import { useMemo } from "react";
import { CheckCircle, LockSimple } from "@phosphor-icons/react";

import type { SavedInformation } from "@/server/operator-data";

import type { PageChrome } from "./deployment-prototype/page-head";
import {
  AccessLink,
  type Reachability,
} from "./deployment-prototype/page-head";
import { EmptySketch } from "./empty-sketch";
import {
  basisOf,
  byExposure,
  exposure,
  frontDoor,
  hostOf,
  probed,
  publishOffer,
  reachFromRecords,
  visitorsOf,
  type Caller,
  type Door,
} from "./reach-records";
import {
  Ask,
  Board,
  Clip,
  Foot,
  Name,
  None,
  Num,
  Opened,
  Register,
  Tag,
  ago,
  type Tone,
} from "./register";
import "./access-page.css";

/** Pi's phrases are not always punctuated; these are run together. */
const stop = (text: string) => (/[.!?]$/.test(text.trim()) ? text : `${text}.`);

const portLabel = (port: string, title: string) =>
  port === "not recorded" ? title : port.replace("/tcp", "");

/** Bars in the meter, by exposure: four for the internet, one for loopback. */
const METER = [4, 4, 3, 2, 0, 1];

/** A small signal meter: how far a port is open, most public fullest. */
function Meter({ door }: { door: Door }) {
  const level = METER[exposure(door)];
  return (
    <span
      className="hv-ac-meter"
      data-level={level}
      aria-label={`Exposure ${level} of 4`}
    >
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/** What the outside test found, as a short tag. */
const TESTED: Record<string, string> = {
  answered: "answered",
  refused: "refused",
  looked: "inconclusive",
  configured: "not tested",
  unasked: "not tested",
};

/** Certainty, as a colour. Only a reading is ever green or amber. */
const TESTED_TONE: Record<string, Tone> = {
  answered: "good",
  refused: "good",
  looked: "warn",
  configured: "idle",
  unasked: "idle",
};

/** The same finding as a sentence, for an opened row. */
function tested(door: Door, now: number) {
  const when = door.at ? ` ${ago(door.at, now)}` : "";
  switch (basisOf(door)) {
    case "answered":
      return `A test connection from outside got an answer${when}.`;
    case "refused":
      return `A test connection from outside did not get through${when}.`;
    case "looked":
      return `A check ran${when}, but it didn't show whether the port answers.`;
    default:
      return "The deployment opened this port. Nothing has tested it yet.";
  }
}

function Ports({
  doors,
  name,
  now,
  onAsk,
}: {
  doors: Door[];
  name: string;
  now: number;
  onAsk: (draft: string) => void;
}) {
  return (
    <Register
      rows={doors}
      columns={[
        {
          key: "port",
          head: "Port",
          width: 110,
          cell: (row) =>
            row.port && row.port !== "not recorded" ? (
              <Name mono title={row.port} />
            ) : (
              <None />
            ),
        },
        {
          key: "service",
          head: "Description",
          cell: (row) => <Clip text={row.serves ?? row.title} />,
        },
        {
          key: "open",
          head: "Open to",
          width: 260,
          cell: (row) => (
            <span className="hv-ac-open">
              <Meter door={row} />
              {row.sources.length ? (
                <Clip text={row.sources.join(", ")} />
              ) : (
                <None>not stated</None>
              )}
            </span>
          ),
        },
        {
          key: "test",
          head: "Outside test",
          width: 130,
          cell: (row) => (
            <Tag tone={TESTED_TONE[basisOf(row)]}>{TESTED[basisOf(row)]}</Tag>
          ),
        },
        {
          key: "at",
          head: "Tested",
          width: 100,
          align: "end",
          cell: (row) =>
            row.at ? <Num>{ago(row.at, now)}</Num> : <None>never</None>,
        },
      ]}
      label={(row) => row.port || row.title}
      tone={(row) => (probed(row) ? "plain" : "idle")}
      detail={(row) => (
        <Opened
          asks={
            <Ask
              onAsk={onAsk}
              prompt={`Connect to port ${row.port || row.title} on ${name}'s server from outside and record what happens.`}
            >
              Test this port from outside
            </Ask>
          }
        >
          <p className="hv-rg-note">
            {tested(row, now)}
            {row.detail ? ` ${stop(row.detail)}` : ""}
          </p>
        </Opened>
      )}
    />
  );
}

function Node({
  title,
  caption,
  live,
}: {
  title: string;
  caption: string;
  live?: boolean;
}) {
  return (
    <div className="hv-ac-node" data-live={live || undefined}>
      <b>{title}</b>
      <small>{caption}</small>
    </div>
  );
}

/**
 * One address as a browser shows it: the bar, then what came back, in the
 * words of the checks that looked. The page sketch on the right is only a
 * picture of "a page"; everything written is from a record.
 */
function Visit({ caller, now }: { caller: Caller; now: number }) {
  const saw = caller.saw.length ? caller.saw : [caller.headline];
  return (
    <div className="hv-ac-visit">
      <div className="hv-ac-visit-bar">
        <span className="hv-ac-visit-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="hv-ac-visit-url">
          {caller.secure && <LockSimple weight="bold" aria-label="HTTPS" />}
          {caller.typed}
        </span>
      </div>
      <div className="hv-ac-visit-body">
        <ul className="hv-ac-visit-saw">
          {saw.map((line) => (
            <li key={line}>
              <CheckCircle weight="fill" aria-hidden="true" />
              {line.replace(/\.$/, "")}
            </li>
          ))}
        </ul>
        <span className="hv-ac-visit-page" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="hv-ac-visit-foot">
        {caller.secure
          ? "Encrypted"
          : caller.secure === null
            ? "Encryption not checked"
            : "Not encrypted"}
        {caller.at && <> · tested {ago(caller.at, now)}</>}
      </div>
    </div>
  );
}

export function AccessPage({
  records,
  applicationId,
  applicationName,
  now,
  reachable = "checking",
  onReopen,
  chrome,
  onAsk,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
  /** Whether a private way in still answers; see PageHead. */
  reachable?: Reachability;
  /** Asks Pi to reopen private access when it is closed. */
  onReopen?: () => void;
  chrome: PageChrome;
  onAsk: (draft: string) => void;
}) {
  const story = useMemo(
    () => reachFromRecords({ records, applicationId, applicationName, now }),
    [records, applicationId, applicationName, now],
  );

  // No title. The way back, and nothing else, above the first board.
  const head = (
    <header className="axj3-head">
      {chrome.bar && <div className="axj3-bar">{chrome.bar}</div>}
    </header>
  );
  const open = (
    <AccessLink
      openUrl={story.address}
      name={applicationName}
      restricted={story.audience === "controller"}
      reachable={reachable}
      onReopen={onReopen}
    />
  );

  // "Everything the rules do not name" is the firewall's own footer, not a
  // port anybody opened.
  const ways = story.doors.filter((door) => door.id !== "rest");
  const answering = story.callers.filter(
    (caller) => caller.outcome === "loads",
  );
  const published = story.audience === "public";

  if (
    !story.address &&
    !story.domain &&
    !story.callers.length &&
    !ways.length &&
    story.firewall.state === "asked" &&
    story.ssh.tone === "planned"
  )
    return (
      <div className="ax-root" data-variant="access">
        {head}
        <div className="hv-deploy-none">
          <h2>Nothing here has been looked at yet.</h2>
          <p>
            No name, no port and no firewall reading are on record for{" "}
            {applicationName}. That is not the same as nothing being able to
            reach it. It means nobody has found out.
          </p>
          <button
            type="button"
            className="hv-primary-button"
            onClick={() =>
              onAsk(
                `What address does ${applicationName} answer on, and what else can reach its server, over which ports?`,
              )
            }
          >
            Ask Hallvi what can reach it
          </button>
          <EmptySketch kind="flow" />
        </div>
      </div>
    );

  const visitors = visitorsOf(story.callers);
  const doors = [...ways].sort(byExposure);
  const front = frontDoor(ways, story.address);
  const address =
    story.domain?.name ?? (answering[0] ? hostOf(answering[0].typed) : null);

  // Publishing is the one thing this board can offer to change, and it drafts
  // the request rather than starting a form: there are decisions in it, and
  // the decisions belong in the conversation. It sits quietly beside the Open
  // link, except on an application no name reaches, where it is what the
  // board is for.
  const offer = publishOffer(story);
  const unpublished = !published && !story.domain;

  return (
    <div className="ax-root" data-variant="access">
      {head}
      <div className="hv-rg-sheet hv-ac">
        <Board
          title="What a visitor sees"
          tools={
            <>
              {!unpublished && (
                <Ask onAsk={onAsk} prompt={offer.draft}>
                  {offer.label}
                </Ask>
              )}
              {open}
            </>
          }
        >
          {visitors.length ? (
            <div className="hv-ac-visits">
              {visitors.map((caller) => (
                <Visit key={caller.id} caller={caller} now={now} />
              ))}
            </div>
          ) : (
            <p className="hv-ac-nothing">
              {story.callers.length
                ? "Hallvi tested every address on record, and none answered."
                : "Hallvi hasn't tested any address yet."}
            </p>
          )}
          {unpublished && (
            <div className="hv-ac-offer">
              <p>
                Only this computer reaches {applicationName}. Hallvi can publish
                it at a name you own.
              </p>
              <button
                type="button"
                className="hv-primary-button"
                onClick={() => onAsk(offer.draft)}
              >
                {offer.label}
              </button>
            </div>
          )}
        </Board>

        <Board title="Ports" note="Open a row to see how Hallvi tested it.">
          {doors.length > 0 ? (
            <Ports doors={doors} name={story.name} now={now} onAsk={onAsk} />
          ) : (
            <p className="hv-ac-nothing">
              No port is on record for this server. {stop(story.ssh.detail)}
            </p>
          )}
          <Foot>
            <span>
              {story.firewall.state === "read"
                ? `Hallvi read the firewall rules ${ago(story.firewall.at, now)}.`
                : story.firewall.state === "none"
                  ? "This server has no firewall."
                  : "Nobody has checked the firewall rules. The closed ports above come from test connections, not from the rules."}
            </span>
            {story.firewall.state === "asked" && (
              <Ask
                onAsk={onAsk}
                prompt={`Read ${story.name}'s server firewall rules back from the provider and record what they let through.`}
              >
                Check the rules
              </Ask>
            )}
          </Foot>
        </Board>

        <Board title="How a visitor gets there">
          <div className="hv-ac-path">
            <Node
              title={published ? "The internet" : "This computer"}
              caption={published ? "anyone" : "through a private tunnel"}
              live={published}
            />
            <i className="hv-ac-link" data-live={published || undefined} />
            <Node
              title={address ?? "No name"}
              caption={
                story.domain
                  ? {
                      serving: "points to this server",
                      resolving: "points to this server",
                      unreachable: "doesn't answer",
                      "pending-dns": "doesn't point here yet",
                      failed: "failed its last check",
                    }[story.domain.state]
                  : address
                    ? "the address"
                    : "no name on record"
              }
              live={answering.length > 0}
            />
            <i className="hv-ac-link" data-live={Boolean(front) || undefined} />
            <Node
              title={
                front ? `Port ${portLabel(front.port, front.title)}` : "No port"
              }
              caption={
                front
                  ? front.established === "answered"
                    ? `answered ${front.at ? ago(front.at, now) : ""}`
                    : "not tested yet"
                  : "none on record"
              }
              live={front?.established === "answered"}
            />
            <i
              className="hv-ac-link"
              data-live={answering.length > 0 || undefined}
            />
            <Node
              title={story.name}
              caption="your application"
              live={answering.length > 0}
            />
          </div>
        </Board>
      </div>
    </div>
  );
}
