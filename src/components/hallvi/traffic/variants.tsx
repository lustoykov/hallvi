"use client";

// The treatments of the Traffic page the owner chooses between, switchable
// with `?variant=` on the real page. The switcher itself exists only outside
// a production build; the product always draws the default.

import { useSyncExternalStore } from "react";

export const VARIANTS = [
  {
    id: "map",
    label: "Dot map",
    note: "Visits land on a dotted world map; arrivals listed beside it. Little Server rises from the map's corner.",
  },
  {
    id: "tint",
    label: "Country tint",
    note: "Countries glow by their share of the day; a visit brightens its country. Little Server stands beside the number.",
  },
  {
    id: "list",
    label: "List first",
    note: "The arrivals lead, with a small map beside them. Little Server visits as a row in the list.",
  },
  {
    id: "calm",
    label: "One line",
    note: "The live area is one line and the map moves to Countries. Little Server peeks at the end of the line.",
  },
] as const;
export type Variant = (typeof VARIANTS)[number]["id"];

const CHANGED = "hv-traffic-variant";

function subscribe(changed: () => void) {
  window.addEventListener("popstate", changed);
  window.addEventListener(CHANGED, changed);
  return () => {
    window.removeEventListener("popstate", changed);
    window.removeEventListener(CHANGED, changed);
  };
}

const read = () => {
  const wanted = new URLSearchParams(window.location.search).get("variant");
  return VARIANTS.some((variant) => variant.id === wanted)
    ? (wanted as Variant)
    : "map";
};

/** The treatment in the address, or the default. */
export function useVariant(): Variant {
  const variant = useSyncExternalStore(subscribe, read, () => "map" as const);
  return process.env.NODE_ENV === "production" ? "map" : variant;
}

function choose(variant: Variant) {
  const url = new URL(window.location.href);
  if (variant === "map") url.searchParams.delete("variant");
  else url.searchParams.set("variant", variant);
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(CHANGED));
}

/** A small switcher for the owner's review. Absent in production. */
export function VariantSwitch({ value }: { value: Variant }) {
  if (process.env.NODE_ENV === "production") return null;
  const current = VARIANTS.find((variant) => variant.id === value)!;
  return (
    <aside className="tf-variants" aria-label="Traffic treatments">
      <span>Preview</span>
      <div role="radiogroup" aria-label="Treatment">
        {VARIANTS.map((variant) => (
          <button
            key={variant.id}
            type="button"
            role="radio"
            aria-checked={variant.id === value}
            onClick={() => choose(variant.id)}
          >
            {variant.label}
          </button>
        ))}
      </div>
      <small>{current.note}</small>
    </aside>
  );
}
