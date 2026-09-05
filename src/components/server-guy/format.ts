import type { GateCheck } from "@/server/types";

export function statusLabel(status: GateCheck["status"]) {
  if (status === "passed") return "Passed";
  if (status === "blocked") return "Blocked";
  return "Not yet";
}

/**
 * Server-safe timestamp: identical on the server and in the browser, so it can
 * be rendered before hydration. The browser then switches to local time via
 * <LocalTime>.
 */
export function formatTimestamp(value: string) {
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}

export type LocalTimeVariant = "full" | "compact" | "title";

/** Local-time formats; only call after hydration or in event handlers. */
export function formatLocalTimestamp(
  value: string,
  variant: LocalTimeVariant,
  now = new Date(),
) {
  const date = new Date(value);
  if (variant === "title")
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "full",
      timeStyle: "long",
    }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", { timeStyle: "short" }).format(
    date,
  );
  const sameDay =
    variant === "compact" &&
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) return time;
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(variant === "full" || date.getFullYear() !== now.getFullYear()
      ? { year: "numeric" }
      : {}),
  }).format(date);
  return `${day}, ${time}`;
}
