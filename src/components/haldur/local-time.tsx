"use client";

import { useSyncExternalStore } from "react";

import {
  formatLocalTimestamp,
  formatTimestamp,
  type LocalTimeVariant,
} from "./format";

const subscribe = () => () => {};
const hydrated = () => true;
const notHydrated = () => false;

/**
 * Renders a timestamp in the reader's time zone. The server (and the hydrating
 * client) print the same UTC string, then the browser swaps in local time, so
 * the two never disagree during hydration.
 */
export function LocalTime({
  value,
  variant = "full",
}: {
  value: string;
  variant?: Exclude<LocalTimeVariant, "title">;
}) {
  const isHydrated = useSyncExternalStore(subscribe, hydrated, notHydrated);
  return (
    <time
      dateTime={value}
      title={isHydrated ? formatLocalTimestamp(value, "title") : undefined}
    >
      {isHydrated
        ? formatLocalTimestamp(value, variant)
        : formatTimestamp(value)}
    </time>
  );
}
