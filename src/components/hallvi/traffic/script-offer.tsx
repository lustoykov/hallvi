"use client";

// Hallvi's traffic script, offered near the top of the Traffic page while
// the log counts alone: what the server's log sees beside what the script
// would add, as a checklist rather than an explanation, with this
// application's own reason marked. "Not now" folds it to one line in place,
// never away.

import { AppWindow, Check, FileText, Minus } from "@phosphor-icons/react";

import { count } from "./model";

/** Why the page offers it: the evidence, or only what the script adds. */
export type OfferReason =
  "browser-pages" | "cached-pages" | "time" | "speed" | "more";

interface Props {
  reason: OfferReason;
  /** Page loads the log counted in the range, when there are totals. */
  views: number | null;
  range: string;
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
      <div>
        <Checklist {...props} />
        <p className="tf-script-privacy">
          Measures visitors who allow analytics. Hallvi can add consent controls
          and a privacy notice that fit your site.
        </p>
      </div>
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
