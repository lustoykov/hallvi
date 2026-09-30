"use client";

// Traffic: who uses the application, and how it is doing.
//
// Everything here reads stored totals the moment the page opens; none of it
// waits for Pi. The live area follows the same access log Overview does,
// while the page is open. The page is a few calm things in a column: who is
// here now, the trend over the range with the releases on it, what visitors
// hit, where they came from, and — at the foot — how far the counting
// reaches and the one standing choice behind it. docs/design/traffic.md owns
// the design.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { SavedInformation } from "@/server/operator-data";
import {
  TRAFFIC_RANGES,
  type Collection,
  type TrafficHistory,
  type TrafficRange,
} from "@/server/traffic/contract";

import { ConfirmActionDialog } from "../confirm-action-dialog";
import type { PageChrome } from "../deployment-prototype/page-head";
import { PageHead, type Reachability } from "../deployment-prototype/page-head";
import { EmptySketch } from "../empty-sketch";
import { useTraffic, type Traffic } from "../overview-live/use-traffic";
import { ago } from "../register";
import { releasesFromRecords } from "../release-records";
import { Breakdowns } from "./breakdowns";
import { Errors, Responses } from "./health";
import { LiveArea } from "./live";
import {
  atLeast,
  count,
  countryName,
  errorsAcrossMidnight,
  errorsHitVisitors,
  gapWords,
  hasTotals,
  isQuiet,
  momentsOf,
  onPage,
  plural,
  quietLine,
  quietWhere,
  scriptDraft,
  serverLogWords,
  scriptOffer,
  storedFrom,
  todayCovered,
  trafficListed,
  type Moment,
  type ScriptAsk,
} from "./model";
import { useMoment } from "./moment";
import { useCollection, useHistory } from "./source";
import { SimulateTraffic } from "./simulate";
import { TrafficChart } from "./traffic-chart";
import { useVariant, VariantSwitch, type Variant } from "./variants";
import { WorldMap } from "./world-map";
import "./traffic.css";

const RANGE_LABEL: Record<TrafficRange, string> = {
  "24h": "24 h",
  "7d": "7 d",
  "30d": "30 d",
};

const day = (at: string | null) =>
  at
    ? new Date(at).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })
    : null;

/** "+12%" against the range before, where there was one to compare. */
function change(now: number, before: number | undefined) {
  if (before === undefined || before <= 0) return null;
  const ratio = (now - before) / before;
  if (Math.abs(ratio) < 0.01) return "same as before";
  return `${ratio > 0 ? "↑" : "↓"} ${Math.round(Math.abs(ratio) * 100)}%`;
}

function Figure({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "bad";
}) {
  return (
    <div className="tf-strip-figure" data-tone={tone}>
      <dt>{label}</dt>
      <dd>
        {value}
        {note ? <small>{note}</small> : null}
      </dd>
    </div>
  );
}

/** "18 today, about 14 visitors": today's share, when yesterday had some. */
function errorsNote(
  split: ReturnType<typeof errorsAcrossMidnight>,
  visitors: number,
) {
  const reached = visitors ? `about ${plural(visitors, "visitor")}` : null;
  if (!split.earlier) return reached && `${reached} today`;
  return [`${count(split.today)} today`, reached].filter(Boolean).join(", ");
}

/** The range's headline figures. */
export function Strip({ history }: { history: TrafficHistory }) {
  const { totals, previous } = history;
  const oneDay = history.range === "24h";
  // The visitor estimate is today's; the range began yesterday.
  const split = oneDay ? errorsAcrossMidnight(history) : null;
  const engaged = history.engagement.reduce(
    (sum, row) => ({
      ms: sum.ms + row.averageMs * row.samples,
      samples: sum.samples + row.samples,
    }),
    { ms: 0, samples: 0 },
  );
  return (
    <dl className="tf-strip">
      {oneDay && !todayCovered(history) ? (
        <Figure label="Visitors today" value="–" note="not counted yet" />
      ) : (
        <Figure
          label={oneDay ? "Visitors today" : "Visitors a day"}
          value={atLeast(
            oneDay ? count(totals.visitors) : `~${count(totals.visitors)}`,
            totals.visitorsAtLeast,
          )}
          note={
            totals.visitorsAtLeast
              ? "some days counted only in part"
              : (change(totals.visitors, previous?.visitors) ??
                (oneDay ? "estimated" : "estimated, on average"))
          }
        />
      )}
      <Figure
        label="Page views"
        value={count(totals.views)}
        note={change(totals.views, previous?.views)}
      />
      {engaged.samples > 0 && (
        <Figure
          label="Time on page"
          value={onPage(engaged.ms / engaged.samples)}
          note={
            history.partialSamples.includes("engagement")
              ? "on average, from part of some days"
              : "on average"
          }
        />
      )}
      {errorsHitVisitors(history) && (
        <Figure
          label="Server errors"
          value={count(totals.errors)}
          tone="bad"
          note={split && errorsNote(split, totals.errorVisitors)}
        />
      )}
    </dl>
  );
}

const offerKey = (applicationId: string) =>
  `hallvi.traffic.script-offer.${applicationId}`;

/**
 * The script, offered near the top while the log counts alone: what it
 * would see, and one button. "Not now" folds it to one line that stays in
 * place, until the reason changes.
 */
function ScriptCard({
  says,
  name,
  folded,
  onAsk,
  onFold,
}: {
  says: string;
  name: string;
  folded: boolean;
  onAsk: (draft: string) => void;
  onFold: (folded: boolean) => void;
}) {
  const add = (
    <button
      type="button"
      className={folded ? "tf-button" : "tf-primary"}
      onClick={() => onAsk(scriptDraft(name))}
    >
      Add Hallvi&apos;s script
    </button>
  );
  if (folded)
    return (
      <section
        className="tf-script-card"
        data-folded
        aria-label="Hallvi's traffic script"
      >
        <p>
          Hallvi&apos;s traffic script is not added yet.{" "}
          <button
            type="button"
            className="tf-link"
            onClick={() => onFold(false)}
          >
            What it adds
          </button>
        </p>
        {add}
      </section>
    );
  return (
    <section className="tf-script-card" aria-label="Hallvi's traffic script">
      <div>
        <h3>Hallvi&apos;s traffic script</h3>
        <p>
          {says} Hallvi&apos;s script sees them there: one line in your layout,
          no cookies, nothing kept in the browser.
        </p>
        <ul>
          <li>Time on page</li>
          <li>Pages changed in the browser</li>
          <li>Pages a CDN served</li>
          <li>Goals and page speed</li>
        </ul>
      </div>
      <div className="tf-script-actions">
        {add}
        <button type="button" className="tf-link" onClick={() => onFold(true)}>
          Not now
        </button>
      </div>
    </section>
  );
}

/** One sentence and one button, where a list only the script fills. */
function ScriptOffer({
  says,
  name,
  onAsk,
}: {
  says: string;
  name: string;
  onAsk: (draft: string) => void;
}) {
  return (
    <div className="tf-offer-line">
      <p>
        {says} Hallvi&apos;s script counts them in the browser — no cookies,
        nothing kept there.
      </p>
      <button
        type="button"
        className="tf-button"
        onClick={() => onAsk(scriptDraft(name))}
      >
        Add Hallvi&apos;s script
      </button>
    </div>
  );
}

/** What the collector is doing, when it is not simply counting. */
function CollectionLine({
  collection,
  name,
  now,
  busy,
  onKeep,
  onAsk,
}: {
  collection: Collection;
  name: string;
  now: number;
  busy: boolean;
  onKeep: () => void;
  onAsk: (draft: string) => void;
}) {
  if (!collection.enabledAt)
    return (
      <p className="tf-state" data-tone="plain">
        <span>
          History is off
          {collection.disabledAt ? ` since ${day(collection.disabledAt)}` : ""}.
          What was counted stays until you forget it.
        </span>
        <button
          type="button"
          className="tf-link"
          disabled={busy}
          onClick={onKeep}
        >
          Keep traffic history again
        </button>
      </p>
    );
  if (collection.state === "catching-up")
    return (
      <p className="tf-state" data-tone="plain">
        <span className="hv-sheen">
          Counting what the server&apos;s log still holds…
        </span>
        {collection.detail && <small> {collection.detail}</small>}
      </p>
    );
  if (collection.state === "lost")
    return (
      <p className="tf-state" data-tone="warn">
        <span>
          The log stopped answering
          {collection.lastLineAt ? ` ${ago(collection.lastLineAt, now)}` : ""}
          {collection.detail ? `: ${collection.detail}` : ""}. Hallvi keeps
          trying.
        </span>
      </p>
    );
  if (collection.state === "no-log")
    return (
      <p className="tf-state" data-tone="plain">
        <span>History is kept, and there is no access log to read yet.</span>
        <button
          type="button"
          className="tf-link"
          onClick={() =>
            onAsk(
              `Set up the access log Traffic reads for ${name}: JSON logging on the proxy, rotated, with the query string removed before it is written, and record where it is.`,
            )
          }
        >
          Ask Hallvi to set it up
        </button>
      </p>
    );
  if (collection.state === "unsupported")
    return (
      <p className="tf-state" data-tone="plain">
        <span>
          {collection.detail ??
            "The proxy here writes a log Hallvi cannot read."}
        </span>
        <button
          type="button"
          className="tf-link"
          onClick={() =>
            onAsk(
              `Traffic cannot read ${name}'s access log (${collection.detail ?? "unsupported format"}). Add a log Hallvi can read beside the one the proxy already writes, and record where it is.`,
            )
          }
        >
          Ask Hallvi to add one it can read
        </button>
      </p>
    );
  return null;
}

/** Where the counting reaches, and the one standing choice behind it. */
function Foot({
  collection,
  history,
  script,
  busy,
  error,
  asked,
  onToggle,
  onForget,
  onAsked,
}: {
  collection: Collection;
  history: TrafficHistory | null;
  script: boolean;
  busy: boolean;
  error: string | null;
  /** The offer, once the owner has asked what the quiet link is about. */
  asked: ReactNode;
  onToggle: () => void;
  onForget: () => void;
  onAsked: () => void;
}) {
  const kept = Boolean(collection.enabledAt);
  const from = storedFrom(collection);
  const reach = [
    kept
      ? `Collecting since ${day(collection.enabledAt)}`
      : from
        ? `Counted from ${day(from)}${collection.disabledAt ? ` to ${day(collection.disabledAt)}` : ""}`
        : null,
    collection.oldestRetainedAt
      ? `the server's log reaches back to ${day(collection.oldestRetainedAt)}`
      : null,
    collection.source
      ? `read from the ${collection.source.proxy} access log`
      : null,
  ].filter(Boolean);
  const gaps = (history?.coverage.gaps ?? []).slice(0, 2);
  return (
    <footer className="tf-foot">
      {reach.length > 0 && (
        <p>
          {reach.join(", ").replace(/^./, (first) => first.toUpperCase())}.
          {gaps.map((gap) => (
            <span key={gap.from}>
              {" "}
              Not counted {day(gap.from)}
              {day(gap.to) !== day(gap.from) ? `–${day(gap.to)}` : ""}:{" "}
              {gapWords(gap)}.
            </span>
          ))}
        </p>
      )}
      <div className="tf-foot-row">
        <label className="tf-switch">
          <input
            type="checkbox"
            role="switch"
            checked={kept}
            disabled={busy}
            onChange={onToggle}
          />
          <span aria-hidden="true" />
          Keep traffic history
        </label>
        {(from || kept) && (
          <button
            type="button"
            className="tf-link"
            disabled={busy}
            onClick={onForget}
          >
            Forget stored totals
          </button>
        )}
        {!script && kept && !asked && (
          <button type="button" className="tf-link" onClick={onAsked}>
            Goals and page speed
          </button>
        )}
        {error && <span className="tf-error">{error}</span>}
      </div>
      {asked}
      <p className="tf-foot-quiet">
        Hallvi keeps totals on this computer, never an address.{" "}
        {serverLogWords(collection.source)}{" "}
        <a href="https://db-ip.com" target="_blank" rel="noreferrer">
          Country data by DB-IP
        </a>
        .
      </p>
    </footer>
  );
}

/** Before history is kept: what keeping it means, and the one button. */
function Offer({
  busy,
  error,
  traffic,
  onKeep,
}: {
  busy: boolean;
  error: string | null;
  traffic: Traffic;
  onKeep: () => void;
}) {
  return (
    <section className="tf-offer" aria-labelledby="tf-offer-title">
      <div>
        <h2 id="tf-offer-title">Keep traffic history</h2>
        <p>
          Hallvi counts visitors, pages, sources and errors from the access log
          your server already writes, and keeps only the totals, on this
          computer. No account, no cookies, nothing sent anywhere.
        </p>
        <button
          type="button"
          className="hv-primary-button"
          disabled={busy}
          onClick={onKeep}
        >
          Keep traffic history
        </button>
        {error && <p className="tf-error">{error}</p>}
        {traffic.state === "live" && traffic.recentVisitors > 0 && (
          <p className="tf-offer-now">
            Right now: {plural(traffic.recentVisitors, "estimated visitor")} in
            the last few minutes.
          </p>
        )}
      </div>
      <EmptySketch kind="bars" />
    </section>
  );
}

export function TrafficPage({
  applicationId,
  applicationName,
  records,
  now,
  chrome,
  reachable = "checking",
  onReopen,
  onAsk,
}: {
  applicationId: string;
  applicationName: string;
  records: SavedInformation[];
  now: number;
  chrome: PageChrome;
  reachable?: Reachability;
  onReopen?: () => void;
  onAsk: (draft: string) => void;
}) {
  const variant = useVariant();
  const { collection, act } = useCollection(applicationId);
  const listed = trafficListed(collection);
  const [range, setRange] = useState<TrafficRange>("7d");
  const today = useHistory(applicationId, "24h", listed);
  const month = useHistory(applicationId, "30d", listed);
  const week = useHistory(applicationId, "7d", listed && range === "7d");
  const picked = range === "24h" ? today : range === "30d" ? month : week;
  const history = picked.history;
  const traffic = useTraffic(applicationId);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState(false);
  const [asked, setAsked] = useState<ScriptAsk | null>(null);
  // "Not now" is remembered in this browser, for the reason it was given.
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem(offerKey(applicationId));
    } catch {
      return null;
    }
  });
  const [lists, setLists] = useState(false);

  const script = Boolean(collection?.scriptSince);
  const marks = useMemo(
    () =>
      releasesFromRecords(records, applicationId).all.map((release) => ({
        at: release.at,
        short: release.short,
      })),
    [records, applicationId],
  );

  // Little Server's moments: from stored totals, and from a visit that
  // arrives from a country the month has not seen.
  const stored = useMemo(
    () =>
      collection && month.history && hasTotals(month.history)
        ? momentsOf({
            month: month.history,
            day: today.history,
            collection,
          })
        : [],
    [collection, month.history, today.history],
  );
  const [arrived, setArrived] = useState<Moment[]>([]);
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    known.current =
      month.history && hasTotals(month.history)
        ? new Set(month.history.countries.map((country) => country.key))
        : null;
  }, [month.history]);
  const { onArrival } = traffic;
  useEffect(
    () =>
      onArrival((line) => {
        const country = line.country;
        if (line.kind !== "view" || !country || !known.current) return;
        if (known.current.has(country)) return;
        const first = known.current.size === 0;
        known.current.add(country);
        setArrived((current) => [
          ...current,
          first
            ? { id: "first-visitor", words: "Your first visitor." }
            : {
                id: `country:${country}`,
                words: `A first visit from ${countryName(country)}.`,
              },
        ]);
      }),
    [onArrival],
  );
  const moment = useMoment(applicationId, [...stored, ...arrived]);

  const perform = async (action: "keep" | "stop" | "forget") => {
    setBusy(true);
    setProblem(null);
    try {
      await act(action);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
      setForgetting(false);
    }
  };

  const offer = scriptOffer(collection, null);
  const lockedOffer = (wanted: ScriptAsk) => {
    const said = scriptOffer(collection, wanted);
    return said ? (
      <ScriptOffer says={said.says} name={applicationName} onAsk={onAsk} />
    ) : (
      <p className="tf-rank-empty">
        Only Hallvi&apos;s script measures this, once history is kept.
      </p>
    );
  };
  const quiet = history ? isQuiet(history) : false;
  const where = history && quiet ? quietWhere(history) : null;

  const head = (
    <PageHead
      bar={chrome.bar}
      title="Traffic"
      name={applicationName}
      openUrl={null}
      restricted={false}
      reachable={reachable}
      onReopen={onReopen}
    />
  );

  if (!collection)
    return (
      <div className="ax-root tf" data-variant={variant}>
        {head}
        <p className="tf-reading">Reading what Hallvi has counted…</p>
      </div>
    );

  if (!listed)
    return (
      <div className="ax-root tf" data-variant={variant}>
        {head}
        <Offer
          busy={busy}
          error={problem}
          traffic={traffic}
          onKeep={() => perform("keep")}
        />
        <VariantSwitch value={variant}>
          <SimulateTraffic applicationId={applicationId} />
        </VariantSwitch>
      </div>
    );

  const countriesToday = today.history?.countries ?? [];
  const smallMap: ReactNode =
    variant === "calm" ? (
      <div className="tf-card-map">
        <WorldMap
          countries={history?.countries ?? []}
          label="Where this range's visits came from"
        />
      </div>
    ) : null;

  return (
    <div className="ax-root tf" data-variant={variant as Variant}>
      {head}
      <CollectionLine
        collection={collection}
        name={applicationName}
        now={now}
        busy={busy}
        onKeep={() => perform("keep")}
        onAsk={onAsk}
      />
      <LiveArea
        traffic={traffic}
        countries={countriesToday}
        variant={variant}
        moment={moment}
        onAsk={onAsk}
      />
      {offer && (
        <ScriptCard
          says={offer.says}
          name={applicationName}
          folded={dismissed === offer.reason}
          onAsk={onAsk}
          onFold={(folded) => {
            setDismissed(folded ? offer.reason : null);
            try {
              if (folded)
                window.localStorage.setItem(
                  offerKey(applicationId),
                  offer.reason,
                );
              else window.localStorage.removeItem(offerKey(applicationId));
            } catch {
              // It comes back next time; that is all.
            }
          }}
        />
      )}
      {collection.scriptSilentSince && (
        <p className="tf-state" data-tone="warn">
          <span>
            Hallvi&apos;s script has been silent for{" "}
            {ago(collection.scriptSilentSince, now).replace(/ ago$/, "")}, while
            the server still serves pages.
          </span>
          <button
            type="button"
            className="tf-link"
            onClick={() =>
              onAsk(
                `Hallvi's traffic script has sent nothing since ${new Date(collection.scriptSilentSince!).toLocaleString("en-GB")}, while ${applicationName} still serves pages. Check that the latest release still loads /_hv/s.js and that the proxy still serves /_hv/.`,
              )
            }
          >
            Ask Hallvi to check it
          </button>
        </p>
      )}

      <section className="tf-card tf-trend" data-wide aria-label="Over time">
        <header className="tf-card-head">
          <h3>{quiet && history ? quietLine(history) : "Over time"}</h3>
          <div className="tf-tabs" role="tablist" aria-label="Range">
            {TRAFFIC_RANGES.map((one) => (
              <button
                key={one}
                type="button"
                role="tab"
                aria-selected={one === range}
                data-on={one === range || undefined}
                onClick={() => setRange(one)}
              >
                {RANGE_LABEL[one]}
              </button>
            ))}
          </div>
        </header>
        {history && hasTotals(history) ? (
          <div
            className="tf-trend-body"
            data-reading={!picked.current || undefined}
          >
            {!quiet && <Strip history={history} />}
            <TrafficChart
              history={history}
              releases={marks}
              scriptSince={collection.scriptSince}
              now={now}
            />
          </div>
        ) : picked.error ? (
          <p className="tf-rank-empty">
            Hallvi could not read the stored totals: {picked.error}
          </p>
        ) : history ? (
          <p className="tf-rank-empty">
            Nothing is counted for this range yet. That is not a claim that
            nobody came: the log has not been read for it.
          </p>
        ) : (
          <p className="tf-reading">Reading the totals…</p>
        )}
      </section>

      {history && hasTotals(history) && (
        <>
          <Errors history={history} name={applicationName} onAsk={onAsk} />
          {quiet && !lists ? (
            <section className="tf-card tf-quiet" data-wide>
              <p>
                {where ?? "Nobody opened a page in this range."}{" "}
                <button
                  type="button"
                  className="tf-link"
                  onClick={() => setLists(true)}
                >
                  Show the lists
                </button>
              </p>
            </section>
          ) : (
            <Breakdowns
              history={history}
              script={script}
              locked={lockedOffer}
              countriesAside={smallMap}
            />
          )}
          <Responses history={history} />
        </>
      )}

      <Foot
        collection={collection}
        history={history}
        script={script}
        busy={busy}
        error={problem}
        asked={asked ? lockedOffer(asked) : null}
        onToggle={() => perform(collection.enabledAt ? "stop" : "keep")}
        onForget={() => setForgetting(true)}
        onAsked={() => setAsked("goals")}
      />
      {forgetting && (
        <ConfirmActionDialog
          title="Forget the stored traffic totals?"
          description={`Hallvi deletes every day it counted for ${applicationName} from this computer${collection.enabledAt ? " and stops keeping history, which would otherwise count the server's log straight back. You can keep it again afterwards" : ", and history stays off"}. The server's own access log is not touched.`}
          action="Forget totals"
          busy={busy}
          error={problem}
          onCancel={() => setForgetting(false)}
          onConfirm={() => perform("forget")}
        />
      )}
      <VariantSwitch value={variant}>
        <SimulateTraffic applicationId={applicationId} />
      </VariantSwitch>
    </div>
  );
}
