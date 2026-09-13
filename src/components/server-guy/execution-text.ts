// What a recorded execution actually said, for people.
//
// An execution's `input` is a stored tool payload: usually JSON, sometimes a
// bare string, and in the shell case a whole script inside a JSON string. Four
// surfaces used to render it by hand and each got a different wrong answer —
// History titled entries `{"command":"set -euo pipefail\ncode=$(curl …`,
// Deployment described steps with `{"remotePort":3100,"localPort":3100}`, and
// two components carried their own half-unwrappers. This is the one place that
// knows how to read the envelope.
//
// The second, quieter bug lived in `input.split("\n")[0]`. The first line of a
// shell script is almost never what it does — it is `set -euo pipefail`. A
// title built from line one therefore says nothing on exactly the executions a
// reader most wants to scan. `essence` skips the preamble and returns the
// first line that acts.

/** Lines every script opens with, and none of them the point of the script. */
const PREAMBLE =
  /^(#|set\s+[-+][a-zA-Z]|shopt\s|umask\s|export\s+(PATH|LC_|LANG)|cd\s|PS4=|IFS=)/;

/**
 * The command inside the envelope. Handles a bare string, `{command}`, and
 * the general object, where the longest string value is the payload and the
 * small scalars beside it are its settings.
 */
export function commandOf(stored: string): string {
  const trimmed = (stored ?? "").trim();
  if (!trimmed) return "";
  if (trimmed[0] !== "{" && trimmed[0] !== "[") return trimmed;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    // Text cut at a storage limit is no longer valid JSON. Show it as it is.
    return trimmed;
  }
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return trimmed;
  const entries = Object.entries(value as Record<string, unknown>);
  const strings = entries.filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  if (!strings.length) {
    // No prose at all: a settings-only payload like {remotePort, localPort}.
    // "3100 → 3100" beats printing the braces.
    const scalars = entries.filter(
      ([, item]) => typeof item === "number" || typeof item === "boolean",
    );
    return scalars.map(([key, item]) => `${key} ${item}`).join(", ");
  }
  const main = strings.reduce((a, b) => (b[1].length > a[1].length ? b : a));
  return main[1];
}

/**
 * The first line that does something, with the shell preamble skipped. Falls
 * back to the first non-empty line when a script is nothing but preamble.
 */
export function essence(command: string): string {
  const lines = command
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  return lines.find((line) => !PREAMBLE.test(line)) ?? lines[0];
}

/** Cut at a word boundary rather than mid-token, and say that it was cut. */
export function clip(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  const cut = flat.slice(0, limit);
  const space = cut.lastIndexOf(" ");
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Where a tool ran, in the reader's words. Null when we cannot say. */
export function placeOf(tool: string): string | null {
  if (tool === "server_bash") return "On the server";
  if (tool === "bash" || tool === "powershell") return "In the repository copy";
  if (tool === "hetzner_request") return "Asked the provider";
  if (tool === "request_approval") return "Your decision";
  return null;
}

/**
 * One readable line for an execution: where it ran, and the first thing it
 * actually did. Used for list titles and step descriptions, so it stays short
 * and never carries an envelope.
 */
export function executionLine(
  execution: { tool: string; input: string },
  limit = 90,
): string {
  const said = clip(essence(commandOf(execution.input)), limit);
  const place = placeOf(execution.tool);
  if (!said) return place ?? execution.tool.replaceAll("_", " ");
  return place ? `${place} · ${said}` : said;
}

/**
 * The whole payload as text rather than as JSON, for a disclosure that shows
 * what ran. Keeps the settings that travelled with it on one trailing line.
 */
export function plainText(stored: string): string {
  const trimmed = (stored ?? "").trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) return stored;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return stored;
  }
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return stored;
  const entries = Object.entries(value as Record<string, unknown>);
  const strings = entries.filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  if (!strings.length) return commandOf(stored);
  const main = strings.reduce((a, b) => (b[1].length > a[1].length ? b : a));
  const rest = entries
    .filter(([key]) => key !== main[0])
    .map(
      ([key, item]) =>
        `${key}: ${typeof item === "string" ? item : JSON.stringify(item)}`,
    );
  return rest.length ? `${main[1]}\n\n${rest.join("\n")}` : main[1];
}
