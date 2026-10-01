"use client";

// PROTOTYPE · prototype/overview-directions · throwaway.
// E · One line per page. Overview as the first line of every other page, in
// the register the inventory pages already use: a strip of four figures,
// then one table whose rows are the destinations. A row opens in place onto
// the little more it has to say and links to the page that owns the story.

import { CaretDown } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import type { ApplicationSection } from "../application-sections";
import { UnresolvedMarks, type Tone } from "../presentation";
import { countryName, milliseconds } from "../traffic/model";
import { ago, count, plural, span, type Facts } from "./facts";
import {
  DirectionsHead,
  OpenAction,
  PageLink,
  firstSentence,
  openWord,
  type VariantProps,
} from "./head";

type Reading = "good" | "quiet" | "amber" | "bad" | "live" | "none";
const reading = (tone: Tone | undefined): Reading =>
  tone === "verified"
    ? "good"
    : tone === "failed"
      ? "bad"
      : tone === "stale"
        ? "amber"
        : "quiet";

interface Line {
  id: ApplicationSection;
  page: string;
  reads: Reading;
  says: ReactNode;
  read: string;
  more: ReactNode;
}

function Bars({
  values,
  last,
}: {
  values: { key: number; value: number; gap?: boolean }[];
  last?: boolean;
}) {
  const top = Math.max(1, ...values.map((one) => one.value));
  return (
    <div className="ove-bars" aria-hidden="true">
      {values.map((one, index) => (
        <i
          key={one.key}
          data-last={(last && index === values.length - 1) || undefined}
          data-gap={one.gap || undefined}
          style={{
            height: one.gap
              ? "100%"
              : `${Math.max(4, (one.value / top) * 100)}%`,
          }}
        />
      ))}
    </div>
  );
}

function lines(facts: Facts): Line[] {
  const { address, visitors, traffic, server, releases, lanes, now } = facts;
  const lane = (id: string) => lanes.find((one) => one.id === id);
  const live = traffic.state === "live";
  const running = releases.running;
  const backups = lane("backups");
  const access = lane("access");
  const latest = facts.happened[0];
  const rest = backups
    ? backups.plain.slice(firstSentence(backups.plain).length + 1)
    : "";

  return [
    {
      id: "traffic",
      page: "Traffic",
      reads: live ? "live" : "quiet",
      says: !live ? (
        traffic.state === "no-log" ? (
          "There is no access log to follow yet."
        ) : (
          "The log is not open right now."
        )
      ) : (
        <>
          {traffic.openNow !== null
            ? `${plural(traffic.openNow, "page")} open right now.`
            : `About ${plural(traffic.recentVisitors, "visitor")} in the last 5 minutes.`}
          {visitors.today !== null && ` ${count(visitors.today)} today.`}
        </>
      ),
      read: live ? "Live" : "Not open",
      more: visitors.counted ? (
        <div className="ove-traffic">
          <div>
            <Bars
              last
              values={visitors.days.slice(-14).map((day) => ({
                key: day.at,
                value: day.visitors,
                gap: !day.covered,
              }))}
            />
            <small>Visitors on each of the last 14 days, today in blue</small>
          </div>
          <ol>
            {visitors.pages.slice(0, 3).map((row) => (
              <li key={row.key}>
                <code>{row.key}</code>
                <b>{count(row.count)}</b>
              </li>
            ))}
          </ol>
          <ol>
            {visitors.countries.slice(0, 3).map((row) => (
              <li key={row.key}>
                <span>{countryName(row.key)}</span>
                <b>{count(row.count)}</b>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p>
          {visitors.kept
            ? "Nothing is counted yet."
            : `Hallvi is not keeping traffic history for ${facts.name}. You can turn it on from Traffic.`}
        </p>
      ),
    },
    {
      id: "deployment",
      page: "Deployment",
      reads: reading(lane("checks")?.tone),
      says: running ? (
        <>
          <code>{running.short}</code> has been running for{" "}
          {span(now - Date.parse(running.at))}.
        </>
      ) : (
        "No release has been proved to be running."
      ),
      read: running ? ago(Date.parse(running.at), now) : "Not recorded",
      more: (
        <>
          <ol className="ove-releases">
            {releases.all.slice(0, 4).map((release) => (
              <li key={release.id} data-outcome={release.outcome}>
                <code>{release.short}</code>
                <span>
                  {release.outcome === "failed"
                    ? "Did not start"
                    : (release.changes[0] ?? "No change recorded")}
                </span>
                <time>{ago(Date.parse(release.at), now)}</time>
              </li>
            ))}
          </ol>
          <p>{facts.condition.text}</p>
        </>
      ),
    },
    {
      id: "access",
      page: "Access",
      reads:
        address.state === "answering" || address.state === "private-open"
          ? "good"
          : address.state === "silent"
            ? "amber"
            : "quiet",
      says: address.url ? (
        <>
          {address.word}
          {address.state === "answering" && address.host
            ? ` at ${address.host}`
            : ""}
          . {address.reach}.
        </>
      ) : (
        "No address is on record."
      ),
      read:
        address.reachable === "open" || address.reachable === "closed"
          ? "Just now"
          : "Not checked",
      more: (
        <>
          {address.url && (
            <p>
              <code>{address.url}</code>
              {address.secure ? " over HTTPS." : "."}
            </p>
          )}
          {address.state === "private-closed" && (
            <p>
              A closed connection says nothing about the application itself.
            </p>
          )}
          {access && <p>Ports and certificate: {access.text.toLowerCase()}.</p>}
        </>
      ),
    },
    {
      id: "monitoring",
      page: "Monitoring",
      reads: reading(lane("server")?.tone),
      says: server
        ? `CPU ${Math.round(server.cpuAverage)}%, memory ${Math.round(server.memoryAverage)}% over the last day.`
        : "The server's load has not been read yet.",
      read: server?.readAt ? ago(server.readAt, now) : "Not read",
      more: server ? (
        <div className="ove-load">
          <div>
            <Bars
              values={server.cpu.map((value, index) => ({ key: index, value }))}
            />
            <small>CPU by the hour, peak {Math.round(server.cpuPeak)}%</small>
          </div>
          <div>
            <Bars
              values={server.memory.map((value, index) => ({
                key: index,
                value,
              }))}
            />
            <small>
              Memory by the hour
              {server.memoryTotal ? `, of ${server.memoryTotal}` : ""}
            </small>
          </div>
          {server.disk && <p>Disk: {server.disk}.</p>}
        </div>
      ) : (
        <p>
          <button
            type="button"
            className="ovx-link"
            onClick={() =>
              facts.onAsk(
                `Read the last 24 hours of ${facts.name}'s server CPU and memory, and record what you find.`,
              )
            }
          >
            Ask Hallvi to read it
          </button>
        </p>
      ),
    },
    {
      id: "backups",
      page: "Backups",
      reads: reading(backups?.tone),
      says: backups
        ? firstSentence(backups.plain)
        : "Nobody has looked at backups yet.",
      read: backups?.at ? ago(backups.at, now) : "Not checked",
      more: (
        <>
          {rest && <p>{rest}</p>}
          {backups &&
            (backups.tone === "unknown" || backups.tone === "absent") && (
              <p>
                <button
                  type="button"
                  className="ovx-link"
                  onClick={() => facts.onAsk(backups.ask)}
                >
                  Ask Hallvi about it
                </button>
              </p>
            )}
        </>
      ),
    },
    {
      id: "history",
      page: "History",
      // Not a reading: the row says what happened, not how something is.
      reads: "none",
      says: facts.open.length ? (
        <>
          <UnresolvedMarks tones={facts.open.map((need) => need.tone)} />{" "}
          {facts.open
            .slice(0, 2)
            .map((need) => `${need.title}: ${openWord(need).toLowerCase()}.`)
            .join(" ")}
        </>
      ) : latest ? (
        `${latest.title}.`
      ) : (
        "No work is recorded yet."
      ),
      read: latest ? ago(latest.at, now) : "Nothing yet",
      more: (
        <>
          {facts.open.length > 0 && (
            <ul className="ove-open" aria-label="Unresolved">
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
          <ol className="ove-recent">
            {facts.happened.slice(0, 5).map((one) => (
              <li key={one.id}>
                <span>{one.title}</span>
                <time>{ago(one.at, now)}</time>
              </li>
            ))}
          </ol>
        </>
      ),
    },
  ];
}

export function VariantE({ facts, bar }: VariantProps) {
  const { visitors, speed, releases, now } = facts;
  const rows = lines(facts);
  // A row with something open in it opens itself.
  const [open, setOpen] = useState<string | null>(
    facts.open.length ? "history" : "traffic",
  );
  const running = releases.running;
  return (
    <div className="ove">
      <DirectionsHead facts={facts} bar={bar} />

      <dl className="ove-strip">
        <div>
          <dt>Visitors today</dt>
          <dd>
            <b data-unread={visitors.today === null || undefined}>
              {visitors.today !== null ? count(visitors.today) : "Not counted"}
            </b>
            <span>
              {visitors.usual !== null
                ? `A usual day has about ${count(visitors.usual)}.`
                : "An estimate, from the server's log."}
            </span>
          </dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>
            <b data-unread={speed.typicalMs === null || undefined}>
              {speed.typicalMs !== null
                ? milliseconds(speed.typicalMs)
                : "Not read"}
            </b>
            <span>The slowest 1 in 20 requests.</span>
          </dd>
        </div>
        <div>
          <dt>Server errors today</dt>
          <dd>
            <b
              data-unread={!visitors.errors || undefined}
              data-bad={(visitors.errors?.visitorsHit ?? 0) > 0 || undefined}
            >
              {visitors.errors
                ? visitors.errors.today
                  ? count(visitors.errors.today)
                  : "None"
                : "Not counted"}
            </b>
            <span>
              {!visitors.errors
                ? "Counted once traffic history is kept."
                : !visitors.errors.today
                  ? "No request has failed."
                  : visitors.errors.visitorsHit
                    ? `About ${plural(visitors.errors.visitorsHit, "visitor")} saw one.`
                    : "No visitor saw one."}
            </span>
          </dd>
        </div>
        <div>
          <dt>Running</dt>
          <dd>
            <b data-unread={!running || undefined}>
              {running ? <code>{running.short}</code> : "Not established"}
            </b>
            <span>
              {running
                ? `For ${span(now - Date.parse(running.at))}.`
                : "No release has been proved."}
            </span>
          </dd>
        </div>
      </dl>

      <div
        className="ove-table"
        role="table"
        aria-label="Every page, in a line"
      >
        <div className="ove-heads" role="row">
          <span role="columnheader">Page</span>
          <span role="columnheader">What it says</span>
          <span role="columnheader">Read</span>
        </div>
        {rows.map((row) => {
          const shown = open === row.id;
          return (
            <div
              key={row.id}
              className="ove-row"
              data-open={shown || undefined}
              role="row"
            >
              <button
                type="button"
                className="ove-line"
                aria-expanded={shown}
                onClick={() => setOpen(shown ? null : row.id)}
              >
                <b>
                  <i data-reads={row.reads} aria-hidden="true" />
                  {row.page}
                </b>
                <span>{row.says}</span>
                <time>{row.read}</time>
                <CaretDown weight="bold" />
              </button>
              {shown && (
                <div className="ove-more">
                  {row.more}
                  <PageLink facts={facts} to={row.id}>
                    Open {row.page}
                  </PageLink>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!facts.mapped && (
        <p className="ove-foot">
          How {facts.name} is put together has not been mapped yet.{" "}
          <button
            type="button"
            className="ovx-link"
            onClick={() =>
              facts.onAsk(
                "Work out how this application is put together — its pieces, how they connect, and what you can verify about each — and record it.",
              )
            }
          >
            Ask Hallvi to map it
          </button>
        </p>
      )}
    </div>
  );
}
