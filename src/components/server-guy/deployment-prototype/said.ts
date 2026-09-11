// PROTOTYPE · claude/deployment-history · throwaway.
// Each phase of the deployment as Server Guy would say it, in the first
// person, built from the same recorded words the phase shows. Nothing here
// adds a cause or a claim the record doesn't make.

import type { Phase } from "./deployment-model";

const lower = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);

/** "a", "a and b", "a, b and c". */
export function listOf(items: string[]) {
  return items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export function saidOf(phase: Phase) {
  const detail = phase.detail.replace(/\.$/, "");
  switch (phase.id.replace(/-\d+$/, "")) {
    case "inspect":
      return `I read ${detail.replace(/^Its files/, "the repository's files")}.`;
    case "plan":
      return detail.startsWith("A ")
        ? `I planned ${lower(detail).replace("; nothing bought yet", ", and bought nothing yet")}.`
        : "I prepared the deployment configuration.";
    case "approval": {
      const match = /^In (.+), (.+) later$/.exec(detail);
      return match
        ? `You approved it ${match[2]} later, in ${match[1]}.`
        : "You approved it.";
    }
    case "provision": {
      const parts = detail.split(", ");
      const server = parts[0]?.startsWith("Hetzner")
        ? `the ${parts.shift()}`
        : "the server";
      return `I created ${server} and locked it down: ${listOf(parts)}.`;
    }
    case "deliver": {
      const match = /^Revision (\S+): (.+)$/.exec(detail);
      return match
        ? `I delivered revision ${match[1]} and started ${match[2]}.`
        : "I delivered it and started it.";
    }
    case "verify": {
      if (phase.tone === "pass")
        return `I checked it from your network, and ${lower(detail)}.`;
      if (phase.tone === "work") return "I'm checking it now.";
      const name = /check failed: (.+?)(?: \(|$)/.exec(detail)?.[1];
      return phase.title === "The first check failed"
        ? `The first check${name ? `, ${name},` : ""} failed.`
        : "It didn't pass its checks, so I claimed nothing.";
    }
    case "retry":
      return phase.tone === "pass"
        ? detail.startsWith("Reconnected, ")
          ? `I retried, ${detail.replace(/^Reconnected, /, "")}.`
          : "I retried, and every check passed."
        : phase.tone === "work"
          ? "I'm retrying now."
          : "I retried, and it still didn't pass.";
    case "recreate":
      return phase.tone === "pass"
        ? "Then I recreated the containers and checked the application again."
        : phase.tone === "work"
          ? "I'm recreating the containers now."
          : "I recreated the containers, and the checks didn't pass.";
    default:
      return `${phase.title}.`;
  }
}
