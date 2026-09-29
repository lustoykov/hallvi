"use client";

// Who is here now: the live area at the top of Traffic.
//
// It follows the same access log Overview does, while the page is open. With
// Hallvi's script it can say how many pages are open right now; from the log
// alone it says how many browsers opened a page in the last few minutes, and
// calls that an estimate. Arrivals are listed as country · page · source,
// newest first, and land on the map as they happen.

import { useEffect, useState, type ReactNode } from "react";

import type { Ranked } from "@/server/traffic/contract";

import {
  WINDOW_MINUTES,
  type SeenLine,
  type Traffic,
} from "../overview-live/use-traffic";
import { DIRECT, countryName, plural } from "./model";
import { Visit } from "./moment";
import type { Moment } from "./model";
import type { Variant } from "./variants";
import { WorldMap } from "./world-map";

const since = (at: number, clock: number) => {
  const seconds = Math.max(0, Math.round((clock - at) / 1000));
  if (seconds < 10) return "now";
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
};

/** A soft dot that breathes once for every visit. */
export function Pulse({ traffic }: { traffic: Traffic }) {
  const [beats, setBeats] = useState(0);
  const { onArrival } = traffic;
  useEffect(
    () =>
      onArrival((line) => {
        if (line.kind === "view") setBeats((count) => count + 1);
      }),
    [onArrival],
  );
  return (
    <span
      className="tf-pulse"
      data-live={traffic.state === "live" || undefined}
      aria-hidden="true"
    >
      <i key={beats} />
    </span>
  );
}

/** How many are here: open pages with the script, an estimate without. */
export function NowWords({ traffic }: { traffic: Traffic }) {
  if (traffic.state === "connecting")
    return <span className="hv-sheen">Opening the access log…</span>;
  if (traffic.state === "lost")
    return <span>The log stopped. Trying again…</span>;
  if (traffic.state === "no-server")
    return <span>No server is connected.</span>;
  if (traffic.state === "no-log")
    return <span>No access log to follow yet.</span>;
  if (traffic.openNow !== null)
    return traffic.openNow ? (
      <span>
        <b>{traffic.openNow.toLocaleString("en-US")}</b>{" "}
        {traffic.openNow === 1 ? "page" : "pages"} open right now
      </span>
    ) : (
      <span>No page is open right now.</span>
    );
  return traffic.recentVisitors ? (
    <span>
      About <b>{traffic.recentVisitors.toLocaleString("en-US")}</b> estimated{" "}
      {traffic.recentVisitors === 1 ? "visitor" : "visitors"} in the last{" "}
      {WINDOW_MINUTES} minutes
    </span>
  ) : (
    <span>No visitors in the last {WINDOW_MINUTES} minutes.</span>
  );
}

const sourceWords = (source: string) =>
  source === DIRECT ? "direct" : `from ${source}`;

function Arrival({ line, clock }: { line: SeenLine; clock: number }) {
  return (
    <li>
      {line.country && (
        <span className="tf-arrival-where">{countryName(line.country)}</span>
      )}
      <code title={line.path}>{line.path}</code>
      {line.source && (
        <span className="tf-arrival-from">{sourceWords(line.source)}</span>
      )}
      <time>{since(line.at, clock)}</time>
    </li>
  );
}

function Arrivals({
  traffic,
  shown,
  visit,
}: {
  traffic: Traffic;
  shown: number;
  /** Little Server, when he visits as a row of the list. */
  visit?: ReactNode;
}) {
  const lines = traffic.arrivals.slice(0, shown);
  return (
    <div className="tf-arrivals">
      <h3>Arriving</h3>
      {visit}
      {lines.length ? (
        <ol>
          {lines.map((line) => (
            <Arrival key={line.id} line={line} clock={traffic.clock} />
          ))}
        </ol>
      ) : (
        <p className="tf-arrivals-none">
          {traffic.state === "live"
            ? `Nobody has opened a page in the last ${WINDOW_MINUTES} minutes.`
            : "Arrivals show here while the log is open."}
        </p>
      )}
    </div>
  );
}

export function LiveArea({
  traffic,
  countries,
  variant,
  moment,
  onAsk,
}: {
  traffic: Traffic;
  /** The last day's countries, which the map rests on. */
  countries: Ranked[];
  variant: Variant;
  moment: Moment | null;
  onAsk: (draft: string) => void;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const live = traffic.state === "live";
  const map = (small: boolean) => (
    <div
      className="tf-live-map"
      data-small={small || undefined}
      data-live={live || undefined}
    >
      <WorldMap
        countries={countries}
        look={variant === "tint" ? "tint" : "dots"}
        onArrival={traffic.onArrival}
        focus={focus}
        label={
          countries.length
            ? `A world map. In the last day, visits came from ${countries
                .slice(0, 5)
                .map((country) => countryName(country.key))
                .join(", ")}.`
            : "A world map. No visits are placed on it yet."
        }
      />
      {moment && variant === "map" && <Visit moment={moment} place="corner" />}
    </div>
  );
  const ask =
    traffic.state === "no-log" ? (
      <button
        type="button"
        className="tf-link"
        onClick={() =>
          onAsk(
            "Turn on JSON access logging on the proxy in front of this application, confirm a request shows up in it, and record where the log is so Hallvi can follow it.",
          )
        }
      >
        Ask Hallvi to set it up
      </button>
    ) : null;

  if (variant === "calm")
    return (
      <section className="tf-live" data-variant="calm" aria-label="Right now">
        <p className="tf-now">
          <Pulse traffic={traffic} />
          <NowWords traffic={traffic} />
          {traffic.arrivals[0] && (
            <span className="tf-now-last">
              Last:{" "}
              {traffic.arrivals[0].country &&
                `${countryName(traffic.arrivals[0].country)} · `}
              <code>{traffic.arrivals[0].path}</code>
              {traffic.arrivals[0].source &&
                ` · ${sourceWords(traffic.arrivals[0].source)}`}
            </span>
          )}
          {ask}
          {moment && <Visit moment={moment} place="line" />}
        </p>
      </section>
    );

  return (
    <section
      className="tf-live"
      data-variant={variant}
      aria-label="Right now"
      onPointerLeave={() => setFocus(null)}
    >
      <p className="tf-now">
        <Pulse traffic={traffic} />
        <NowWords traffic={traffic} />
        {ask}
        {moment && variant === "tint" && (
          <Visit moment={moment} place="beside" />
        )}
      </p>
      {variant === "list" ? (
        <div className="tf-live-body">
          <Arrivals
            traffic={traffic}
            shown={8}
            visit={moment ? <Visit moment={moment} place="row" /> : undefined}
          />
          {map(true)}
        </div>
      ) : (
        <div className="tf-live-body">
          {map(false)}
          <Arrivals traffic={traffic} shown={variant === "tint" ? 4 : 6} />
        </div>
      )}
      {countries.length > 0 && variant !== "list" && (
        <ul className="tf-live-countries" aria-label="Countries today">
          {countries.slice(0, 6).map((country) => (
            <li key={country.key} onPointerEnter={() => setFocus(country.key)}>
              {countryName(country.key)}
              <span>{plural(country.count, "view")}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
