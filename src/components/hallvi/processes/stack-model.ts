// The words Monitoring and Cache & queue share.

import { clockTime } from "../format";

const numbers = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
/** "Two", "Seven" → "7". */
export const countWord = (n: number) => numbers[n] ?? String(n);
/** "Sep 9, 20:48". */
export const when = (at: string) =>
  `${new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${clockTime(at)}`;
