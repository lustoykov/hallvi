"use client";

// Hallvi's traffic script, offered near the top of the Traffic page while
// the log counts alone: what the server's log sees beside what the script
// would add, drawn rather than explained. Three treatments for the owner to
// choose between (`?offer=` in development). "Not now" folds the offer to
// one line in place, never away.

import { AppWindow, Check, FileText, Minus } from "@phosphor-icons/react";

import type { Ranked } from "@/server/traffic/contract";

import { count } from "./model";
import type { Offer } from "./variants";

/** Why the page offers it: the evidence, or only what the script adds. */
export type OfferReason =
  "browser-pages" | "cached-pages" | "time" | "goals" | "speed" | "more";

interface Props {
  variant: Offer;
  reason: OfferReason;
  /** Page loads the log counted in the range, when there are totals. */
  views: number | null;
  range: string;
  /** The range's busiest pages, to draw with the application's own paths. */
  pages: Ranked[];
  folded: boolean;
  onAdd: () => void;
  onFold: (folded: boolean) => void;
}

export function ScriptOffers(props: Props) {
  const { folded, onAdd, onFold } = props;
  if (folded)
    return (
      <section
        className="tf-script-folded"
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
        <button type="button" className="tf-button" onClick={onAdd}>
          Add Hallvi&apos;s script
        </button>
      </section>
    );
  return (
    <section className="tf-script" aria-label="Hallvi's traffic script">
      {props.variant === "visit" ? (
        <OneVisit {...props} />
      ) : props.variant === "lists" ? (
        <BeforeAfter {...props} />
      ) : (
        <Checklist {...props} />
      )}
      <div className="tf-script-actions">
        <button type="button" className="tf-primary" onClick={onAdd}>
          Add Hallvi&apos;s script
        </button>
        <button type="button" className="tf-link" onClick={() => onFold(true)}>
          Not now
        </button>
      </div>
    </section>
  );
}

const Yes = () => <Check className="tf-script-yes" aria-label="Yes" />;
const No = () => <Minus className="tf-script-no" aria-label="No" />;

/** Which row the application's own evidence points at. */
const HERE: Partial<Record<OfferReason, string>> = {
  "browser-pages": "spa",
  "cached-pages": "cdn",
  time: "time",
  more: "time",
  goals: "goals",
  speed: "speed",
};

/** The two counters as column heads, and what each sees. */
function Checklist({ reason, views, range }: Props) {
  const rows: { id: string; label: string; log: boolean }[] = [
    { id: "loads", label: "Page loads", log: true },
    { id: "spa", label: "Pages changed in the app", log: false },
    { id: "cdn", label: "Pages a CDN served", log: false },
    { id: "time", label: "Time on page", log: false },
    { id: "speed", label: "Page speed", log: false },
    { id: "goals", label: "Goals", log: false },
  ];
  const here = HERE[reason];
  return (
    <table className="tf-script-checks">
      <thead>
        <tr>
          <th />
          <th>
            <span className="tf-script-head">
              <FileText aria-hidden="true" /> Server log
            </span>
            <strong>{views === null ? "—" : count(views)}</strong>
            <small>page loads · {range}</small>
          </th>
          <th data-script>
            <span className="tf-script-head">
              <AppWindow aria-hidden="true" /> + Script
            </span>
            <strong>?</strong>
            <small>runs in the browser</small>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} data-here={row.id === here || undefined}>
            <th scope="row">
              {row.label}
              {row.id === here && <em>this app</em>}
            </th>
            <td>{row.log ? <Yes /> : <No />}</td>
            <td data-script>
              <Yes />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Three of the application's pages, for drawing one visit. */
function stepsOf(pages: Ranked[]) {
  const paths = pages.map((page) => page.key).filter(Boolean);
  const fallback = ["/", "/pricing", "/docs"];
  return [0, 1, 2].map((index) => paths[index] ?? fallback[index]);
}

/** One visit, as the log records it and as the script does. */
function OneVisit({ reason, pages }: Props) {
  const steps = stepsOf(pages);
  const times = ["40 s", "1 min 30 s", "2 min"];
  // What the log sees of the three: the first load only for an app that
  // changes pages in the browser, nothing when a CDN answered, all three
  // loads otherwise — never how long anyone stayed.
  const logged =
    reason === "browser-pages"
      ? [true, false, false]
      : reason === "cached-pages"
        ? [false, false, false]
        : [true, true, true];
  const seen = logged.filter(Boolean).length;
  const why =
    reason === "browser-pages"
      ? "the app changed the other pages in the browser"
      : reason === "cached-pages"
        ? "the CDN answered from its cache"
        : "a log line has no time on page";
  return (
    <div className="tf-script-visit">
      <p className="tf-script-caption">One visit, for example</p>
      <div className="tf-script-track">
        <span className="tf-script-row-head">
          <FileText aria-hidden="true" /> Server log
        </span>
        {steps.map((path, index) => (
          <span
            key={path + index}
            className="tf-script-step"
            data-off={!logged[index] || undefined}
          >
            <i aria-hidden="true" />
            <code>{path}</code>
          </span>
        ))}
        <span className="tf-script-sum">
          {seen === 1 ? "1 view" : `${seen} views`}
          <small>{why}</small>
        </span>

        <span className="tf-script-row-head" data-script>
          <AppWindow aria-hidden="true" /> + Script
        </span>
        {steps.map((path, index) => (
          <span key={path + index} className="tf-script-step" data-script>
            <i aria-hidden="true" />
            <code>{path}</code>
            <small>{times[index]}</small>
          </span>
        ))}
        <span className="tf-script-sum" data-script>
          3 views · 4 min
          <small>and how fast each page was</small>
        </span>
      </div>
    </div>
  );
}

/** The Pages list now, and as it would read with the script. */
function BeforeAfter({ reason, pages, range }: Props) {
  const top = pages.slice(0, 3);
  const added =
    reason === "browser-pages"
      ? "Pages changed in the app"
      : reason === "cached-pages"
        ? "Views the CDN served"
        : null;
  return (
    <div className="tf-script-lists">
      <div>
        <p className="tf-script-caption">
          <FileText aria-hidden="true" /> Pages now · {range}
        </p>
        <ol>
          <li className="tf-script-cols">
            <span />
            <span>Views</span>
            <span>Time</span>
          </li>
          {top.map((page) => (
            <li key={page.key}>
              <code>{page.key}</code>
              <span>{count(page.count)}</span>
              <span className="tf-script-no">—</span>
            </li>
          ))}
          {added && (
            <li data-missing>
              <span>{added}</span>
              <span className="tf-script-no">—</span>
              <span className="tf-script-no">—</span>
            </li>
          )}
        </ol>
      </div>
      <span className="tf-script-arrow" aria-hidden="true">
        →
      </span>
      <div data-script>
        <p className="tf-script-caption">
          <AppWindow aria-hidden="true" /> With the script
        </p>
        <ol>
          <li className="tf-script-cols">
            <span />
            <span>Views</span>
            <span>Time</span>
          </li>
          {top.map((page) => (
            <li key={page.key}>
              <code>{page.key}</code>
              <span>{count(page.count)}</span>
              <span className="tf-script-yes">
                <Check aria-label="measured" />
              </span>
            </li>
          ))}
          {added && (
            <li data-new>
              <span>{added}</span>
              <span className="tf-script-yes">
                <Check aria-label="counted" />
              </span>
              <span className="tf-script-yes">
                <Check aria-label="measured" />
              </span>
            </li>
          )}
        </ol>
        <p className="tf-script-caption tf-script-sources">
          Sources and countries stay as they are.
        </p>
      </div>
    </div>
  );
}
