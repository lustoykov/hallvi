/**
 * Server-safe timestamp: identical on the server and in the browser, so it can
 * be rendered before hydration. The browser then switches to local time via
 * <LocalTime>.
 */
export function formatTimestamp(value: string) {
  // Intl punctuation and month abbreviations differ between Node and Safari.
  return `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export type LocalTimeVariant = "full" | "compact" | "date" | "title";

/** Local-time formats; only call after hydration or in event handlers. */
export function formatLocalTimestamp(
  value: string,
  variant: LocalTimeVariant,
  now = new Date(),
) {
  const date = new Date(value);
  // A day heading: the weekday and date, never "today", because the
  // reader's clock and the record's clock are not always the same one.
  if (variant === "date")
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "short",
      ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
    }).format(date);
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

const MINUTE = 60_000;

/**
 * How long ago, by the Relative Time Rule: "just now", "3 min ago", "5 h ago",
 * "1 day ago", "2 days ago", and "not recorded" when there is no reading.
 *
 * Pure, so a server render and the hydrating browser given the same clock
 * agree. A no-break space holds each number to its unit: "7 h ago" is one
 * fact, and a line that breaks between the 7 and the h makes the reader
 * reassemble it.
 */
export function ago(at: string | null | undefined, now: number) {
  const ms = at ? now - Date.parse(at) : NaN;
  if (!Number.isFinite(ms)) return "not recorded";
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** "20:48": the reader's clock, 24-hour as the logs beside it are. */
export function clockTime(at: string | number) {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
