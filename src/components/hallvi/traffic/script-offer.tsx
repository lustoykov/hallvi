"use client";

// Hallvi's traffic script, offered near the top of the Traffic page while
// the log counts alone. Three treatments for the owner to choose between
// (`?offer=` in development); "Not now" folds the offer to one line in
// place, never away. The "In the list" treatment lives in the Pages card
// instead, and has no fold: it is already quiet.

import { AppWindow, FileText } from "@phosphor-icons/react";

import { WorkingMascot } from "../working-mascot";
import { count } from "./model";
import type { Offer } from "./variants";

export function ScriptOffers({
  variant,
  says,
  views,
  range,
  folded,
  onAdd,
  onFold,
}: {
  variant: Exclude<Offer, "column">;
  says: string;
  /** Page loads the log counted in the range, when there are totals. */
  views: number | null;
  range: string;
  folded: boolean;
  onAdd: () => void;
  onFold: (folded: boolean) => void;
}) {
  const add = (quiet = false) => (
    <button
      type="button"
      className={quiet ? "tf-button" : "tf-primary"}
      onClick={onAdd}
    >
      Add Hallvi&apos;s script
    </button>
  );
  const notNow = (
    <button type="button" className="tf-link" onClick={() => onFold(true)}>
      Not now
    </button>
  );

  if (folded)
    return (
      <section className="tf-offer-folded" aria-label="Hallvi's traffic script">
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
        {add(true)}
      </section>
    );

  if (variant === "server")
    return (
      <section className="tf-offer-server" aria-label="Hallvi's traffic script">
        <span className="tf-offer-mascot">
          <WorkingMascot />
        </span>
        <div className="tf-offer-bubble">
          <p>
            {says} <strong>Want me to count those too?</strong>
          </p>
          <div className="tf-offer-actions">
            {add()}
            {notNow}
          </div>
        </div>
      </section>
    );

  return (
    <section className="tf-offer-compare" aria-label="Hallvi's traffic script">
      <div className="tf-offer-counter">
        <span className="tf-offer-counter-head">
          <FileText aria-hidden="true" /> Server log
        </span>
        <strong>{views === null ? "—" : count(views)}</strong>
        <span>page loads in {range}</span>
      </div>
      <span className="tf-offer-plus" aria-hidden="true">
        +
      </span>
      <div className="tf-offer-counter" data-empty>
        <span className="tf-offer-counter-head">
          <AppWindow aria-hidden="true" /> In the browser
        </span>
        <strong>?</strong>
        <span>in-app pages, time on page, page speed</span>
      </div>
      <div className="tf-offer-side">
        <p>{says}</p>
        <div className="tf-offer-actions">
          {add()}
          {notNow}
        </div>
      </div>
    </section>
  );
}
