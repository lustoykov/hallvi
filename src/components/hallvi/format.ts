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
