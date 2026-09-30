"use client";

// Development tools on the Traffic page: the script offer's treatments for
// the owner to choose between, switchable with `?offer=` on the real page,
// and whatever else is passed in (simulated traffic). The panel exists only
// outside a production build; the product always draws the default.

import { useSyncExternalStore, type ReactNode } from "react";

/** How the page offers Hallvi's script, for the owner to choose between. */
export const OFFERS = [
  {
    id: "compare",
    label: "Two counters",
    note: "What the server's log counted beside an empty counter for what only the browser sees.",
  },
  {
    id: "column",
    label: "In the list",
    note: "No banner: the Pages list shows an empty Time on page column, with the button in its header.",
  },
  {
    id: "server",
    label: "Little Server asks",
    note: "Little Server stands under the map and asks, in one sentence, whether to count what the log misses.",
  },
] as const;
export type Offer = (typeof OFFERS)[number]["id"];
const DEFAULT_OFFER: Offer = "compare";

const CHANGED = "hv-traffic-offer";

function subscribe(changed: () => void) {
  window.addEventListener("popstate", changed);
  window.addEventListener(CHANGED, changed);
  return () => {
    window.removeEventListener("popstate", changed);
    window.removeEventListener(CHANGED, changed);
  };
}

const readOffer = () => {
  const wanted = new URLSearchParams(window.location.search).get("offer");
  return OFFERS.some((offer) => offer.id === wanted)
    ? (wanted as Offer)
    : DEFAULT_OFFER;
};

/** The script offer's treatment in the address, or the default. */
export function useOffer(): Offer {
  const offer = useSyncExternalStore(subscribe, readOffer, () => DEFAULT_OFFER);
  return process.env.NODE_ENV === "production" ? DEFAULT_OFFER : offer;
}

function chooseOffer(offer: Offer) {
  const url = new URL(window.location.href);
  if (offer === DEFAULT_OFFER) url.searchParams.delete("offer");
  else url.searchParams.set("offer", offer);
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(CHANGED));
}

/** The development panel, bottom right. Absent in production. */
export function DevPanel({ children }: { children?: ReactNode }) {
  const value = useOffer();
  if (process.env.NODE_ENV === "production") return null;
  const current = OFFERS.find((offer) => offer.id === value)!;
  return (
    <aside className="tf-variants" aria-label="Development">
      <span>Script offer</span>
      <div role="radiogroup" aria-label="Script offer">
        {OFFERS.map((offer) => (
          <button
            key={offer.id}
            type="button"
            role="radio"
            aria-checked={offer.id === value}
            onClick={() => chooseOffer(offer.id)}
          >
            {offer.label}
          </button>
        ))}
      </div>
      <small>{current.note}</small>
      {children}
    </aside>
  );
}
