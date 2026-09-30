"use client";

// Where visits came from and what they did: pages, sources, countries and
// devices, each a short ranked list with its share drawn behind it. What
// only Hallvi's script can measure — time on page, goals, page speed — sits
// behind a tab of its own; opening one without the script is exactly the
// moment the page offers it.

import {
  Desktop,
  DeviceMobile,
  DeviceTablet,
  Question,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import {
  STORED_PER_LIST,
  type Ranked,
  type TrafficHistory,
  type VitalName,
} from "@/server/traffic/contract";

import {
  atLeast,
  count,
  countryName,
  keyWords,
  milliseconds,
  onPage,
  type ScriptAsk,
} from "./model";

const SHOWN = 7;

interface Row {
  key: string;
  label: ReactNode;
  value: number;
  /** What the row's value reads as; the count by default. */
  says?: string;
  icon?: ReactNode;
}

function Rows({
  rows,
  empty,
  mono,
  partial,
  sampled,
  ghost,
}: {
  rows: Row[];
  empty: string;
  /** Paths read better in the monospaced face. */
  mono?: boolean;
  /**
   * A day in the range kept only its busiest entries, or was counted in
   * parts: counts are floors.
   */
  partial?: boolean;
  /** Some day's values come from part of its views: a sample. */
  sampled?: boolean;
  /** An empty column for what only the script measures. */
  ghost?: boolean;
}) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <p className="tf-rank-empty">{empty}</p>;
  const top = Math.max(1, ...rows.map((row) => row.value));
  const shown = all ? rows.slice(0, 30) : rows.slice(0, SHOWN);
  return (
    <>
      <ol
        className="tf-rank"
        data-mono={mono || undefined}
        data-ghost={ghost || undefined}
      >
        {ghost && (
          <li className="tf-rank-columns" aria-hidden="true">
            <span />
            <span>Time on page</span>
            <span>Views</span>
          </li>
        )}
        {shown.map((row) => (
          <li key={row.key}>
            <span
              className="tf-rank-share"
              style={{ width: `${Math.max(1.5, (row.value / top) * 100)}%` }}
              aria-hidden="true"
            />
            <span className="tf-rank-key" title={row.key}>
              {row.icon}
              {row.label}
            </span>
            {ghost && <span className="tf-rank-ghost" aria-hidden="true" />}
            <span className="tf-rank-count">
              {row.says ?? atLeast(count(row.value), Boolean(partial))}
            </span>
          </li>
        ))}
      </ol>
      {partial && (
        <p className="tf-card-quiet">
          At least these: some days were counted only in part, or kept only
          their {STORED_PER_LIST} busiest.
        </p>
      )}
      {sampled && (
        <p className="tf-card-quiet">From part of the views on some days.</p>
      )}
      {rows.length > SHOWN && (
        <button
          type="button"
          className="tf-rank-more"
          onClick={() => setAll(!all)}
        >
          {all ? "Show fewer" : `Show all ${Math.min(rows.length, 30)}`}
        </button>
      )}
    </>
  );
}

interface Tab {
  id: string;
  label: string;
  /** What the tab shows; `locked` is what shows instead without the script. */
  body: ReactNode;
}

function Card({
  title,
  tabs,
  aside,
  wide,
  action,
}: {
  title: string;
  tabs: Tab[];
  aside?: ReactNode;
  wide?: boolean;
  /** A button beside the title. */
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(tabs[0].id);
  const tab = tabs.find((one) => one.id === open) ?? tabs[0];
  return (
    <section className="tf-card" data-wide={wide || undefined}>
      <header className="tf-card-head">
        <h3>{title}</h3>
        {action}
        {tabs.length > 1 && (
          <div className="tf-tabs" role="tablist" aria-label={title}>
            {tabs.map((one) => (
              <button
                key={one.id}
                type="button"
                role="tab"
                aria-selected={one.id === tab.id}
                data-on={one.id === tab.id || undefined}
                onClick={() => setOpen(one.id)}
              >
                {one.label}
              </button>
            ))}
          </div>
        )}
      </header>
      {aside}
      {tab.body}
    </section>
  );
}

const ranked = (list: Ranked[], label = keyWords): Row[] =>
  list
    .filter((row) => row.count > 0)
    .map((row) => ({ key: row.key, label: label(row.key), value: row.count }));

const DEVICE_ICON: Record<string, ReactNode> = {
  desktop: <Desktop aria-hidden="true" />,
  mobile: <DeviceMobile aria-hidden="true" />,
  tablet: <DeviceTablet aria-hidden="true" />,
};

const capital = (key: string) =>
  keyWords(key).replace(/^./, (first) => first.toUpperCase());

/** The same thresholds as Chrome's: good, needs improvement, poor. */
const VITAL_LIMITS: Record<VitalName, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [100, 250],
};
const vitalWords = (metric: VitalName, value: number, floor: boolean) =>
  atLeast(
    metric === "CLS" ? (value / 1000).toFixed(2) : milliseconds(value),
    floor,
  );
const rating = (metric: VitalName, value: number) =>
  value <= VITAL_LIMITS[metric][0]
    ? "good"
    : value <= VITAL_LIMITS[metric][1]
      ? "fair"
      : "poor";

function Speed({
  vitals,
  sampled,
}: {
  vitals: TrafficHistory["vitals"];
  /** Some day's figures come from part of its views: a sample. */
  sampled: boolean;
}) {
  const pages = [...new Set(vitals.map((vital) => vital.path))]
    .map((path) => ({
      path,
      samples: Math.max(
        ...vitals.filter((one) => one.path === path).map((one) => one.samples),
      ),
    }))
    .sort((a, b) => b.samples - a.samples)
    .slice(0, 6);
  if (!pages.length)
    return (
      <p className="tf-rank-empty">
        No page has reported its speed in this range yet.
      </p>
    );
  return (
    <table className="tf-speed">
      <caption className="tf-card-quiet">
        Three visits in four were at least this fast
        {sampled ? "; some days measured only part of their visits." : "."}
      </caption>
      <thead>
        <tr>
          <th>Page</th>
          {(["LCP", "INP", "CLS"] as const).map((metric) => (
            <th key={metric} title={VITAL_TITLES[metric]}>
              {metric}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {pages.map(({ path }) => (
          <tr key={path}>
            <td title={path}>{path}</td>
            {(["LCP", "INP", "CLS"] as const).map((metric) => {
              const vital = vitals.find(
                (one) => one.path === path && one.metric === metric,
              );
              return (
                <td key={metric}>
                  {vital ? (
                    <span data-rating={rating(metric, vital.p75)}>
                      <i aria-hidden="true" />
                      {vitalWords(metric, vital.p75, vital.atLeast)}
                    </span>
                  ) : (
                    <span className="tf-none">not measured</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const VITAL_TITLES: Record<VitalName, string> = {
  LCP: "Largest contentful paint: when the main content showed",
  INP: "Interaction to next paint: how quickly a tap or click answered",
  CLS: "Cumulative layout shift: how much the page jumped while loading",
};

export function Breakdowns({
  history,
  script,
  locked,
  ghost,
}: {
  history: TrafficHistory;
  /** Whether Hallvi's script is counting: it alone measures some tabs. */
  script: boolean;
  /** What a script-only tab says without the script: the offer. */
  locked: (asked: ScriptAsk) => ReactNode;
  /** The script offered in the Pages list itself, as an empty column. */
  ghost?: { says: string; onAdd: () => void } | null;
}) {
  const partial = (list: TrafficHistory["partialLists"][number]) =>
    history.partialLists.includes(list);
  const time: Row[] = [...history.engagement]
    .sort((a, b) => b.samples - a.samples)
    .map((row) => ({
      key: row.path,
      label: row.path,
      value: row.averageMs,
      says: onPage(row.averageMs),
    }));
  return (
    <div className="tf-grid">
      <Card
        title="Pages"
        action={
          ghost && !script ? (
            <button
              type="button"
              className="tf-primary tf-card-action"
              onClick={ghost.onAdd}
            >
              Add Hallvi&apos;s script
            </button>
          ) : null
        }
        aside={
          ghost && !script ? (
            <p className="tf-card-quiet tf-ghost-says">
              {ghost.says} The empty column fills once Hallvi&apos;s script
              runs.
            </p>
          ) : null
        }
        tabs={[
          {
            id: "views",
            label: "Views",
            body: (
              <Rows
                mono
                rows={ranked(history.pages)}
                partial={partial("pages")}
                ghost={Boolean(ghost && !script)}
                empty="No page views in this range."
              />
            ),
          },
          {
            id: "time",
            label: "Time on page",
            body: script ? (
              <Rows
                mono
                rows={time}
                sampled={history.partialSamples.includes("engagement")}
                empty="No visit has ended with a measured time yet."
              />
            ) : (
              locked("time")
            ),
          },
        ]}
      />
      <Card
        title="Sources"
        tabs={[
          {
            id: "sources",
            label: "Sources",
            body: (
              <Rows
                rows={ranked(history.sources)}
                partial={partial("sources")}
                empty="No views arrived in this range."
              />
            ),
          },
          ...(history.campaigns.length
            ? [
                {
                  id: "campaigns",
                  label: "Campaigns",
                  body: (
                    <Rows
                      rows={ranked(history.campaigns)}
                      partial={partial("campaigns")}
                      empty="No campaign tags in this range."
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
      <Card
        title="Countries"
        tabs={[
          {
            id: "countries",
            label: "Countries",
            body: (
              <Rows
                rows={ranked(history.countries, countryName)}
                partial={partial("countries")}
                empty="No views to place in this range."
              />
            ),
          },
        ]}
      />
      <Card
        title="Devices"
        tabs={[
          {
            id: "devices",
            label: "Devices",
            body: (
              <Rows
                partial={partial("devices")}
                rows={ranked(history.devices, capital).map((row) => ({
                  ...row,
                  icon: DEVICE_ICON[row.key] ?? <Question aria-hidden="true" />,
                }))}
                empty="No views in this range."
              />
            ),
          },
          {
            id: "browsers",
            label: "Browsers",
            body: (
              <Rows
                rows={ranked(history.browsers)}
                partial={partial("browsers")}
                empty="No views in this range."
              />
            ),
          },
          {
            id: "systems",
            label: "Systems",
            body: (
              <Rows
                rows={ranked(history.systems)}
                partial={partial("systems")}
                empty="No views in this range."
              />
            ),
          },
        ]}
      />
      {/* Only the script measures these, so without it they are not cards
          at all: the page mentions them once, quietly, in its footer. */}
      {script && (
        <>
          <Card
            title="Goals"
            tabs={[
              {
                id: "goals",
                label: "Goals",
                body: (
                  <Rows
                    rows={ranked(history.goals)}
                    partial={partial("goals")}
                    empty="No goal was reached in this range. A goal is hv('signup') in the page, or data-hv-goal on a button."
                  />
                ),
              },
            ]}
          />
          <Card
            title="Page speed"
            tabs={[
              {
                id: "speed",
                label: "Page speed",
                body: (
                  <Speed
                    vitals={history.vitals}
                    sampled={history.partialSamples.includes("vitals")}
                  />
                ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
}
