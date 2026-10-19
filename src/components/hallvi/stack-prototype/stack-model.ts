// The clock words Monitoring and Cache & queue share.

const numbers = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
/** "Two", "Seven" → "7". */
export const countWord = (n: number) => numbers[n] ?? String(n);
export const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
/** "Sep 9, 20:48". */
export const when = (at: string) =>
  `${new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${clock(at)}`;
