"use client";

import Link from "next/link";
import { useState } from "react";

import "./reference.css";

const variants = [
  {
    id: "navigation",
    title: "Identity in the sidebar head",
    verdict: "Recommended",
    detail:
      "The application sits where the product mark was, directly above the destinations it scopes. The top bar is freed for where you are and what is running, so nothing in the header is decorative.",
    trade: "The product mark shrinks to a small link back to all applications.",
  },
  {
    id: "topbar",
    title: "Identity in the top bar",
    verdict: "Today’s placement",
    detail:
      "The application name and repository sit above the workspace with a menu. It reads first, but it competes with the work strip and leaves the header carrying no context about the open view.",
    trade: "Two headers state identity; neither states where you are.",
  },
  {
    id: "breadcrumb",
    title: "Path, no menu",
    verdict: "Simplest",
    detail:
      "Applications / Document archive, stated as a path. Switching happens on the Applications screen, so there is exactly one place to choose an application.",
    trade: "Changing application costs one extra screen.",
  },
] as const;

const screens = [
  { id: "overview", label: "Overview" },
  { id: "domains", label: "Domains" },
  { id: "backups", label: "Backups" },
  { id: "", label: "Conversation" },
] as const;

/** Three placements of the same component, side by side and live. */
export function ShellVariants() {
  const [screen, setScreen] = useState<string>("overview");
  const query = (variant: string) =>
    `/prototype/app?scenario=rich&step=13&identity=${variant}${screen ? `&section=${screen}` : ""}`;
  return (
    <main className="sg-reference-index sg-variant-page">
      <h1>Where the application identity belongs</h1>
      <p>
        The dropdown above the workspace is the thing under review. All three
        options below are the same <code>ApplicationIdentity</code> component
        with a different <code>variant</code>; whichever you pick is a one-word
        change in both shells. Every value shown is invented.
      </p>
      <div className="sg-variant-screens" role="group" aria-label="Screen">
        {screens.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={screen === item.id}
            className="sg-op-ref"
            onClick={() => setScreen(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {variants.map((variant) => (
        <section className="sg-variant" key={variant.id}>
          <div className="sg-variant-head">
            <h2>
              {variant.title} <span>{variant.verdict}</span>
            </h2>
            <Link href={query(variant.id)}>Open full size →</Link>
          </div>
          <p>{variant.detail}</p>
          <p className="sg-variant-trade">Trade-off: {variant.trade}</p>
          <div className="sg-variant-frame">
            <iframe
              title={variant.title}
              src={query(variant.id)}
              width={1440}
              height={900}
              loading="lazy"
            />
          </div>
        </section>
      ))}
      <p>
        <Link href="/prototype">← All reference screens</Link>
      </p>
    </main>
  );
}
