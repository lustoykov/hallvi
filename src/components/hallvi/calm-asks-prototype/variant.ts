"use client";

// PROTOTYPE · prototype/calm-asks-visuals · throwaway.
// "Unresolved" as a word (Now) beside three ways to say it with no word at
// all, on the real History and Overview. Switched with ?variant= (bottom bar,
// or ← →); kept for the tab in session storage so moving between History and
// Overview keeps it. A production build always draws the word.

import { useSyncExternalStore } from "react";

export const VARIANTS = [
  { key: "now", name: "Now · the word “Unresolved”" },
  { key: "marks", name: "A · Marks: one dot per open thing" },
  { key: "log", name: "B · In the log: no list of its own" },
  { key: "hallvi", name: "C · Little Server holds a note" },
] as const;

export type CalmVariant = (typeof VARIANTS)[number]["key"];

const EVENT = "calm-asks-variant";
const KEY = "hallvi.calm-asks-variant";
const known = (value: string | null): value is CalmVariant =>
  VARIANTS.some((one) => one.key === value);

function read(): CalmVariant {
  if (process.env.NODE_ENV === "production") return "now";
  const asked = new URLSearchParams(window.location.search).get("variant");
  if (known(asked)) return asked;
  try {
    const kept = window.sessionStorage.getItem(KEY);
    if (known(kept)) return kept;
  } catch {}
  return "now";
}

export function setCalmVariant(key: CalmVariant) {
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

export function useCalmVariant(): CalmVariant {
  return useSyncExternalStore(subscribe, read, () => "now");
}
