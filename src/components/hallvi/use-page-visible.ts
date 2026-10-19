"use client";

import { useSyncExternalStore } from "react";

const subscribe = (changed: () => void) => {
  document.addEventListener("visibilitychange", changed);
  return () => document.removeEventListener("visibilitychange", changed);
};
const visible = () => document.visibilityState !== "hidden";
const serverVisible = () => true;

/** Pause page-bound observations while hidden; observe afresh on return. */
export function usePageVisible() {
  return useSyncExternalStore(subscribe, visible, serverVisible);
}
