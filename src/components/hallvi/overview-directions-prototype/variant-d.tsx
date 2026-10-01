"use client";

// PROTOTYPE · prototype/overview-directions · throwaway.
// D · The path of a visit. The overview is the route a request takes, left
// to right: visitors, the address, the application, its server, its data.
// Each stop says how it is doing in two or three lines and links to the page
// that owns it. A dot travels the first stretch whenever a real page view
// arrives, and nothing else moves. Under the path sit the visitors tile as
// it is today and what was recorded.

import { useEffect, useState, type ReactNode } from "react";

import type { ApplicationSection } from "../application-sections";
import type { Traffic } from "../overview-live/use-traffic";
import { UnresolvedMarks, type Tone } from "../presentation";
import { NowWords } from "../traffic/live";
import { milliseconds } from "../traffic/model";
import { VisitorsToday } from "../traffic/overview-tile";
import { ago, count, plural, span, type Facts } from "./facts";
import {
  DirectionsHead,
  OpenAction,
  PageLink,
  firstSentence,
  openWord,
  type VariantProps,
} from "./head";

type Reading = "good" | "quiet" | "amber" | "bad" | "live";

const reading = (tone: Tone | undefined): Reading =>
  tone === "verified"
    ? "good"
    : tone === "failed"
      ? "bad"
      : tone === "stale"
        ? "amber"
        : "quiet";

/** A dot per page view that has only just arrived, and nothing otherwise. */
function Travellers({ traffic }: { traffic: Traffic }) {
  const [dots, setDots] = useState<{ id: number; failed: boolean }[]>([]);
  const { onArrival } = traffic;
  useEffect(
    () =>
      onArrival((line) => {
        if (line.kind !== "view") return;
        setDots((current) =>
          current.length > 10
            ? current
            : [...current, { id: line.id, failed: line.status >= 500 }],
        );
      }),
    [onArrival],
  );
  return (
    <>
      {dots.map((dot) => (
        <i
          key={dot.id}
          className="ovd-traveller"
          data-failed={dot.failed || undefined}
          onAnimationEnd={() =>
            setDots((current) => current.filter((one) => one.id !== dot.id))
          }
        />
      ))}
    </>
  );
}

function Stop({
  facts,
  name,
  reads,
  value,
  to,
  link,
  children,
}: {
  facts: Facts;
  name: string;
  reads: Reading;
  value: ReactNode;
  to: ApplicationSection;
  link: string;
  children: ReactNode;
}) {
  return (
    <li className="ovd-stop" data-reads={reads}>
      <i className="ovd-node" aria-hidden="true" />
      <h2>{name}</h2>
      <p className="ovd-value">{value}</p>
      <div className="ovd-lines">{children}</div>
      <PageLink facts={facts} to={to}>
        {link}
      </PageLink>
    </li>
  );
}

export function VariantD({ facts, bar }: VariantProps) {
  const { address, visitors, traffic, speed, server, releases, lanes, now } =
    facts;
  const lane = (id: string) => lanes.find((one) => one.id === id);
  const live = traffic.state === "live";
  const source = visitors.sources[0]?.key;
  const running = releases.running;
  const backups = lane("backups");
  const checks = lane("checks");
  const serverLane = lane("server");

  return (
    <div className="ovd">
      <DirectionsHead facts={facts} bar={bar} state={false} />

      <ol className="ovd-path" aria-label="The path of a visit">
        <li className="ovd-rail" aria-hidden="true">
          <Travellers traffic={traffic} />
        </li>

        <Stop
          facts={facts}
          name="Visitors"
          reads={live ? "live" : "quiet"}
          value={
            !live
              ? "No live count"
              : traffic.openNow !== null
                ? plural(traffic.openNow, "page")
                : `About ${count(traffic.recentVisitors)}`
          }
          to="traffic"
          link="Traffic"
        >
          <p>
            {!live ? (
              <NowWords traffic={traffic} />
            ) : traffic.openNow !== null ? (
              "open right now"
            ) : (
              "in the last 5 minutes"
            )}
          </p>
          {visitors.today !== null && (
            <p>
              {count(visitors.today)} today
              {visitors.usual !== null &&
                `, ${count(visitors.usual)} on a usual day`}
            </p>
          )}
          {source && (
            <p>
              {source === "Direct"
                ? "Most arrive directly"
                : `Most arrive from ${source}`}
            </p>
          )}
        </Stop>

        <Stop
          facts={facts}
          name="Address"
          reads={
            address.state === "answering" || address.state === "private-open"
              ? "good"
              : address.state === "silent"
                ? "amber"
                : "quiet"
          }
          value={address.host ?? "None on record"}
          to="access"
          link="Access"
        >
          <p data-strong>{address.word}</p>
          {address.url && (
            <p>
              {address.secure ? "HTTPS. " : ""}
              {address.reach}.
            </p>
          )}
          {address.state === "private-closed" && (
            <p>This says nothing about the application itself.</p>
          )}
        </Stop>

        <Stop
          facts={facts}
          name={facts.name}
          reads={reading(checks?.tone)}
          value={running ? <code>{running.short}</code> : "Not established"}
          to="deployment"
          link="Deployment"
        >
          {running && <p>Running for {span(now - Date.parse(running.at))}</p>}
          {speed.typicalMs !== null && (
            <p>{milliseconds(speed.typicalMs)} for the slowest 1 in 20</p>
          )}
          {visitors.errors && (
            <p data-bad={visitors.errors.visitorsHit > 0 || undefined}>
              {visitors.errors.today
                ? `${plural(visitors.errors.today, "server error")} today`
                : "No server errors today"}
            </p>
          )}
          {checks && <p>{checks.text}</p>}
        </Stop>

        <Stop
          facts={facts}
          name="Server"
          reads={reading(serverLane?.tone)}
          value={server?.name ?? "The server"}
          to="monitoring"
          link="Monitoring"
        >
          {server ? (
            <p>
              CPU {Math.round(server.cpuAverage)}%, memory{" "}
              {Math.round(server.memoryAverage)}% over the last day
            </p>
          ) : (
            <p>Load not read yet</p>
          )}
          {server?.disk && <p>Disk: {server.disk}</p>}
          {serverLane && <p>{serverLane.text}</p>}
        </Stop>

        <Stop
          facts={facts}
          name="Data"
          reads={reading(backups?.tone)}
          value={backups?.text ?? "Not checked yet"}
          to="backups"
          link="Backups"
        >
          {backups && <p>{firstSentence(backups.plain)}</p>}
        </Stop>
      </ol>

      {facts.open.length > 0 && (
        <ul className="ovd-open" aria-label="Unresolved">
          {facts.open.slice(0, 3).map((need) => (
            <li key={need.id}>
              <UnresolvedMarks tones={[need.tone]} />
              <b>{need.title}</b>
              <span>{openWord(need)}</span>
              <OpenAction need={need} facts={facts} />
            </li>
          ))}
        </ul>
      )}

      <div className="ovd-lower">
        <section aria-labelledby="ovd-visitors">
          <header>
            <h2 id="ovd-visitors">Visitors</h2>
            <PageLink facts={facts} to="traffic">
              Traffic
            </PageLink>
          </header>
          {visitors.kept ? (
            <VisitorsToday month={facts.month} traffic={traffic} />
          ) : (
            <p className="ovd-quiet">
              Hallvi is not keeping traffic history for {facts.name}. You can
              turn it on from Traffic.
            </p>
          )}
        </section>
        <section aria-labelledby="ovd-recent">
          <header>
            <h2 id="ovd-recent">Recent</h2>
            <PageLink facts={facts} to="history">
              History
            </PageLink>
          </header>
          {facts.happened.length ? (
            <ol className="ovd-recent">
              {facts.happened.slice(0, 5).map((one) => (
                <li key={one.id}>
                  {one.open ? (
                    <button type="button" onClick={one.open}>
                      {one.title}
                    </button>
                  ) : (
                    <span>{one.title}</span>
                  )}
                  <time>{ago(one.at, now)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ovd-quiet">No work is recorded yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
