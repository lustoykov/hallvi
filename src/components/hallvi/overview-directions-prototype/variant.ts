"use client";

// PROTOTYPE · prototype/overview-directions · throwaway.
// Five structures for a deployed application's Overview beside today's page,
// on the real route. Switched with ?variant= (the bottom bar, or ← →) and
// kept for the tab in session storage, so leaving Overview and coming back
// keeps the choice. A production build always draws today's page.

import { useSyncExternalStore } from "react";

export const VARIANTS = [
  {
    key: "now",
    name: "Today's page",
    note: "The tile grid that ships now, for comparison.",
  },
  {
    key: "a",
    name: "A · Visitors first",
    note: "The visitors chart takes the page. Everything else is a line under it.",
  },
  {
    key: "b",
    name: "B · The brief",
    note: "A short written report. One sentence per subject, figures in the margin.",
  },
  {
    key: "c",
    name: "C · One day, one axis",
    note: "Visitors, errors, speed, load, releases and Hallvi's work on a shared 24-hour axis.",
  },
  {
    key: "d",
    name: "D · The path of a visit",
    note: "Visitors, address, application, server, data: one stop each, with how it is doing.",
  },
  {
    key: "e",
    name: "E · One line per page",
    note: "Four figures, then a table with the first line of every other page.",
  },
] as const;

export type OverviewVariant = (typeof VARIANTS)[number]["key"];

const EVENT = "overview-directions-variant";
const KEY = "hallvi.overview-directions-variant";
const known = (value: string | null): value is OverviewVariant =>
  VARIANTS.some((one) => one.key === value);

function read(): OverviewVariant {
  if (process.env.NODE_ENV === "production") return "now";
  const asked = new URLSearchParams(window.location.search).get("variant");
  if (known(asked)) return asked;
  try {
    const kept = window.sessionStorage.getItem(KEY);
    if (known(kept)) return kept;
  } catch {}
  return "now";
}

export function setOverviewVariant(key: OverviewVariant) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  window.history.replaceState(window.history.state, "", url);
  try {
    window.sessionStorage.setItem(KEY, key);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("popstate", callback);
  window.addEventListener("hashchange", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("popstate", callback);
    window.removeEventListener("hashchange", callback);
  };
}

export function useOverviewVariant(): OverviewVariant {
  return useSyncExternalStore(subscribe, read, () => "now");
}
