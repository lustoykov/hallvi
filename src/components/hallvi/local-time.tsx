"use client";

import { useSyncExternalStore } from "react";

import {
  formatLocalTimestamp,
  formatTimestamp,
  type LocalTimeVariant,
} from "./format";

const dayListeners = new Set<() => void>();
let dayTimer: number;
const localDay = () => new Date().toDateString();
const serverDay = () => null;

// One clock for all timestamps, including those inside memoized messages.
// Construct the next local midnight so short and long DST days work too.
function scheduleDayChange() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  dayTimer = window.setTimeout(refreshDay, midnight.getTime() - now.getTime());
}

// A sleeping computer can cross midnight before its timer gets to run.
function refreshDay() {
  window.clearTimeout(dayTimer);
  scheduleDayChange();
  dayListeners.forEach((notify) => notify());
}

function subscribe(notify: () => void) {
  dayListeners.add(notify);
  if (dayListeners.size === 1) {
    scheduleDayChange();
    document.addEventListener("visibilitychange", refreshDay);
    window.addEventListener("focus", refreshDay);
  }
  return () => {
    dayListeners.delete(notify);
    if (dayListeners.size === 0) {
      window.clearTimeout(dayTimer);
      document.removeEventListener("visibilitychange", refreshDay);
      window.removeEventListener("focus", refreshDay);
    }
  };
}

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
  const isHydrated =
    useSyncExternalStore(subscribe, localDay, serverDay) !== null;
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
