import type { GateCheck } from "@/server/types";

export function statusLabel(status: GateCheck["status"]) {
  if (status === "passed") return "Passed";
  if (status === "blocked") return "Blocked";
  return "Not yet";
}

export function formatTimestamp(value: string) {
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}
