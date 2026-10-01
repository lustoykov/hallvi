"use client";

// PROTOTYPE · prototype/overview-directions · throwaway.
// B · The brief. The page is a short written report: one subject a row, said
// in a sentence or two, with a figure in the margin only where a picture is
// faster than the sentence. Nothing is a tile, and nothing is a tag.

import type { ReactNode } from "react";

import { UnresolvedMarks } from "../presentation";
import { countryName, milliseconds } from "../traffic/model";
import { ago, count, plural, span, type Facts } from "./facts";
import {
  DirectionsHead,
  OpenAction,
  PageLink,
  firstSentence,
  type VariantProps,
} from "./head";

const list = (items: string[], last = "and") =>
  items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} ${last} ${items.at(-1)}`;

const ARTICLE = new Set(["United States", "United Kingdom", "Netherlands"]);
const country = (code: string) => {
  const name = countryName(code);
  return ARTICLE.has(name) ? `the ${name}` : name;
};

function Row({
  label,
  aside,
  children,
}: {
  label: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="ovb-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
      {aside && <dd className="ovb-aside">{aside}</dd>}
    </div>
  );
}

function AddressSays({ facts }: { facts: Facts }) {
  const { address, name } = facts;
  switch (address.state) {
    case "answering":
      return (
        <p>
          <b>{name}</b> answers at <b>{address.host}</b>
          {address.secure ? " over HTTPS" : ""}. {address.reach}.
        </p>
      );
    case "private-open":
      return (
        <p>
          <b>{name}</b> runs privately. This computer holds a connection to it
          at <code>{address.host}</code>.
        </p>
      );
    case "private-closed":
      return (
        <>
          <p>
            <b>{name}</b> runs privately, and this computer&apos;s connection to
            it is closed.
          </p>
          <p className="ovb-more">
            That says nothing about the application itself. Hallvi can check it
            once the connection is open again.
          </p>
        </>
      );
    case "silent":
      return (
        <p>
          <b>{address.host}</b>{" "}
          <span className="ovb-amber">did not answer</span> when Hallvi asked
          just now.
        </p>
      );
    case "checking":
      return (
        <p>
          Hallvi is asking <b>{address.host}</b> now.
        </p>
      );
    case "unchecked":
      return (
        <p>
          Nobody has checked yet whether <b>{address.host}</b> answers.
        </p>
      );
    case "no-controller":
      return (
        <p>
          This page cannot reach Hallvi, so it cannot say how the address reads.
        </p>
      );
    default:
      return (
        <p>
          No address is on record for <b>{name}</b>.
        </p>
      );
  }
}

function VisitorsSays({ facts }: { facts: Facts }) {
  const { visitors, traffic, name } = facts;
  const live = traffic.state === "live";
  if (!visitors.kept)
    return (
      <p>
        Hallvi is not keeping traffic history for {name}, so it cannot say how
        many people visited today.
        {live && traffic.recentVisitors > 0
          ? ` About ${count(traffic.recentVisitors)} came in the last 5 minutes.`
          : ""}
      </p>
    );
  if (!visitors.counted)
    return (
      <p>
        {facts.collection?.state === "no-log"
          ? "Hallvi has no access log to count visitors from yet."
          : "Hallvi has not counted any visits yet."}
      </p>
    );
  const here = !live
    ? ""
    : traffic.openNow !== null
      ? traffic.openNow
        ? `, and ${plural(traffic.openNow, "page")} ${traffic.openNow === 1 ? "is" : "are"} open right now`
        : ", and no page is open right now"
      : traffic.recentVisitors
        ? `, about ${count(traffic.recentVisitors)} of them in the last 5 minutes`
        : ", none of them in the last 5 minutes";
  const pages = visitors.pages.slice(0, 2);
  const sources = visitors.sources
    .slice(0, 2)
    .map((row) => (row.key === "Direct" ? "directly" : `from ${row.key}`));
  const places = visitors.countries.slice(0, 2).map((row) => country(row.key));
  return (
    <>
      <p>
        {visitors.today !== null ? (
          <>
            About <b>{plural(visitors.today, "person", "people")}</b>{" "}
            {visitors.today === 1 ? "has" : "have"} visited today{here}.
          </>
        ) : (
          <>Hallvi has not counted today&apos;s visits yet.</>
        )}{" "}
        {visitors.busier
          ? `That is already more than a usual day, which has about ${count(visitors.usual!)}.`
          : visitors.usual !== null
            ? `A usual day has about ${count(visitors.usual)}.`
            : "There are not enough days yet to say what a usual one is."}
      </p>
      {pages.length > 0 && (
        <p className="ovb-more">
          They mostly opened{" "}
          {pages.map((row, index) => (
            <span key={row.key}>
              {index > 0 && " and "}
              <code>{row.key}</code>
            </span>
          ))}
          .
          {sources.length > 0 &&
            ` Most arrived ${list(sources, "or")}${places.length ? `, and most were in ${list(places)}` : ""}.`}
        </p>
      )}
    </>
  );
}

/** The last eight days, as the tile the owner liked draws them. */
function EightDays({ facts }: { facts: Facts }) {
  const days = facts.visitors.days.slice(-8);
  if (days.length < 2) return null;
  const top = Math.max(1, ...days.map((day) => day.visitors));
  return (
    <>
      <div className="ovb-days" aria-hidden="true">
        {days.map((day, index) => (
          <i
            key={day.at}
            data-today={index === days.length - 1 || undefined}
            data-gap={!day.covered || undefined}
            style={{
              height: day.covered
                ? `${Math.max(5, (day.visitors / top) * 100)}%`
                : "100%",
            }}
          />
        ))}
      </div>
      <small>The last 8 days, today in blue</small>
    </>
  );
}

function Load({ facts }: { facts: Facts }) {
  const { server } = facts;
  if (!server || server.cpu.length < 2) return null;
  const step = 200 / (server.cpu.length - 1);
  const top = Math.max(20, server.cpuPeak);
  const line = server.cpu
    .map((value, index) => `${index * step},${44 - (value / top) * 40}`)
    .join(" ");
  return (
    <>
      <svg
        className="ovb-load"
        viewBox="0 0 200 46"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline points={line} />
      </svg>
      <small>CPU over the last day, peak {Math.round(server.cpuPeak)}%</small>
    </>
  );
}

export function VariantB({ facts, bar }: VariantProps) {
  const { visitors, speed, server, releases, lanes, now } = facts;
  const running = releases.running;
  const earlier = running
    ? releases.all.filter(
        (release) => Date.parse(release.at) < Date.parse(running.at),
      )
    : [];
  const failedNewest =
    releases.latest &&
    releases.latest !== running &&
    releases.latest.outcome === "failed";
  const backups = lanes.find((lane) => lane.id === "backups");
  const idea = facts.built.ideas[0];
  return (
    <div className="ovb">
      <DirectionsHead facts={facts} bar={bar} state={false} />
      <dl className="ovb-brief">
        {facts.open.length > 0 && (
          <Row
            label={
              <UnresolvedMarks tones={facts.open.map((need) => need.tone)} />
            }
          >
            {facts.open.slice(0, 3).map((need) => (
              <div key={need.id} className="ovb-open">
                <p>
                  <b>{need.title}</b>{" "}
                  {need.tone === "waiting" ? (
                    "is awaiting approval."
                  ) : (
                    <>
                      <span className="ovb-red">failed</span>.{" "}
                      <span className="ovb-detail">{need.detail}</span>
                    </>
                  )}
                </p>
                <OpenAction need={need} facts={facts} />
              </div>
            ))}
          </Row>
        )}

        <Row
          label="Address"
          aside={
            <PageLink facts={facts} to="access">
              Access
            </PageLink>
          }
        >
          <AddressSays facts={facts} />
        </Row>

        <Row
          label="Visitors"
          aside={
            <>
              {visitors.counted && <EightDays facts={facts} />}
              <PageLink facts={facts} to="traffic">
                Traffic
              </PageLink>
            </>
          }
        >
          <VisitorsSays facts={facts} />
        </Row>

        <Row
          label="Speed and errors"
          aside={
            <PageLink facts={facts} to="monitoring">
              Monitoring
            </PageLink>
          }
        >
          <p>
            {speed.typicalMs !== null ? (
              <>
                The slowest 1 in 20 requests take about{" "}
                <b>{milliseconds(speed.typicalMs)}</b>.
              </>
            ) : (
              <>Hallvi has not read response times yet.</>
            )}{" "}
            {!visitors.errors ? (
              ""
            ) : !visitors.errors.today ? (
              "No request has failed on the server today."
            ) : (
              <>
                The server failed{" "}
                <b>{plural(visitors.errors.today, "request")}</b> today
                {visitors.errors.visitorsHit ? (
                  <>
                    , and about{" "}
                    <span className="ovb-red">
                      {plural(visitors.errors.visitorsHit, "visitor")}
                    </span>{" "}
                    saw one.
                  </>
                ) : (
                  ". No visitor saw one."
                )}
              </>
            )}
          </p>
        </Row>

        <Row
          label="Release"
          aside={
            <>
              {earlier.length > 0 && (
                <ol className="ovb-releases">
                  {earlier.slice(0, 3).map((release) => (
                    <li key={release.id}>
                      <code>{release.short}</code>
                      {ago(Date.parse(release.at), now)}
                    </li>
                  ))}
                </ol>
              )}
              <PageLink facts={facts} to="deployment">
                Deployment
              </PageLink>
            </>
          }
        >
          {running ? (
            <>
              <p>
                Release <code>{running.short}</code> has been running for{" "}
                <b>{span(now - Date.parse(running.at))}</b>.
                {running.changes.length === 1 &&
                  ` It changed one thing: ${running.changes[0]}.`}
                {running.changes.length > 1 &&
                  ` It changed ${running.changes.length} things: ${list(running.changes)}.`}
              </p>
              {failedNewest && (
                <p className="ovb-more">
                  The newest release, <code>{releases.latest!.short}</code>,{" "}
                  <span className="ovb-red">did not start</span>, so this one
                  still serves.
                </p>
              )}
              {!failedNewest && earlier.length > 0 && (
                <p className="ovb-more">
                  {plural(earlier.length, "release")} came before it.
                </p>
              )}
            </>
          ) : (
            <p>No release has been proved to be running.</p>
          )}
        </Row>

        <Row
          label="Server"
          aside={
            <>
              <Load facts={facts} />
              <PageLink facts={facts} to="monitoring">
                Monitoring
              </PageLink>
            </>
          }
        >
          {server ? (
            <p>
              Over the last day the server used about{" "}
              <b>{Math.round(server.cpuAverage)}%</b> of its CPU and{" "}
              <b>{Math.round(server.memoryAverage)}%</b> of its{" "}
              {server.memoryTotal ? `${server.memoryTotal} of ` : ""}memory.
              {server.disk && ` The disk has ${server.disk}.`}
            </p>
          ) : (
            <p>Hallvi has not read the server&apos;s load yet.</p>
          )}
        </Row>

        {backups && (
          <Row
            label="Backups"
            aside={
              backups.tone === "unknown" || backups.tone === "absent" ? (
                <button
                  type="button"
                  className="ovx-link"
                  onClick={() => facts.onAsk(backups.ask)}
                >
                  Ask Hallvi about it
                </button>
              ) : (
                <PageLink facts={facts} to="backups">
                  Backups
                </PageLink>
              )
            }
          >
            <p>{firstSentence(backups.plain)}</p>
            {backups.plain.length > firstSentence(backups.plain).length + 1 && (
              <p className="ovb-more">
                {backups.plain.slice(firstSentence(backups.plain).length + 1)}
              </p>
            )}
          </Row>
        )}

        <Row label="Checks">
          <p>{facts.condition.text}</p>
        </Row>

        {facts.happened.length > 0 && (
          <Row
            label="Lately"
            aside={
              <PageLink facts={facts} to="history">
                History
              </PageLink>
            }
          >
            <ol className="ovb-lately">
              {facts.happened.slice(0, 4).map((one) => (
                <li key={one.id}>
                  <time>{ago(one.at, now)}</time>
                  {one.title}
                </li>
              ))}
            </ol>
          </Row>
        )}

        {idea && (
          <Row
            label="Hallvi suggests"
            aside={
              <button
                type="button"
                className="ovx-link"
                onClick={() => facts.onAsk(idea.draft)}
              >
                Ask Hallvi to do it
              </button>
            }
          >
            <p>{idea.title}</p>
          </Row>
        )}
      </dl>
    </div>
  );
}
