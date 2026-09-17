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

/**
 * Which machine a tool actually runs on.
 *
 * Four different places, and the console called three of them nothing and one
 * of them "your server". They are not alike: a command on the application's
 * host can break the application, one in the workspace container touches a
 * copy of the repository on this PC, one against a provider's API spends
 * money, and opening a tunnel changes only what this PC can reach. A reader
 * deciding whether to approve something needs to know which of those it is.
 *
 * `request_approval` is absent on purpose. It runs nowhere; it is a question.
 */
const WORKSPACE = {
  said: "In the repository copy",
  detail: "an isolated container on this PC",
};
const PLACES: Record<string, { said: string; detail?: string }> = {
  server_bash: { said: "On the server" },
  bash: WORKSPACE,
  powershell: WORKSPACE,
  write: WORKSPACE,
  edit: WORKSPACE,
  // Reading a file in the repository copy is the same place as running a
  // command in it. The activity transcript kept its own list of these and its
  // own word for each place, so the same call read "on your server" there and
  // "On the server" one card away.
  read: WORKSPACE,
  read_file: WORKSPACE,
  cat: WORKSPACE,
  ls: WORKSPACE,
  list_directory: WORKSPACE,
  grep: WORKSPACE,
  find: WORKSPACE,
  glob: WORKSPACE,
  write_file: WORKSPACE,
  edit_file: WORKSPACE,
  multi_edit: WORKSPACE,
  // Not a machine, but the same question: what did this touch?
  save_information: { said: "In Haldur's records" },
  retire_information: { said: "In Haldur's records" },
  search_information: { said: "In Haldur's records" },
  get_application_status: { said: "In Haldur's records" },
  hetzner_request: { said: "At Hetzner" },
  set_domain_record: { said: "At the DNS provider" },
  // Each of these runs here and reaches outward: a tunnel this PC holds
  // open, a key this PC keeps, an SSH check this PC makes, a request this
  // Mac sends. None of them changes anything on the application's server.
  open_server_port: { said: "On this PC" },
  server_public_key: { said: "On this PC" },
  connect_server: { said: "On this PC" },
  check_public_access: { said: "On this PC" },
};

/** Where a tool ran, in the reader's words. Null when we cannot say. */
export function placeOf(tool: string): string | null {
  if (tool === "request_approval") return "Your decision";
  return PLACES[tool]?.said ?? null;
}

/**
 * The host inside a login string. `root@203.0.113.1:22` is how the executor
 * addresses a machine and not how anyone refers to one; the address is the
 * half a reader recognises, and the whole string stays on hover.
 */
export function hostOf(target: string) {
  if (!target.includes("@")) return null;
  const after = target.split("@").at(-1) ?? "";
  const host = after.split(":")[0].trim();
  return host || null;
}

/**
 * Where an execution ran and, where one exists, which machine or endpoint.
 * `said` is never guessed: a tool this does not know about returns null
 * rather than a plausible sentence.
 */
export function whereItRan(execution: { tool: string; target: string }) {
  if (execution.tool === "request_approval") return null;
  const place = PLACES[execution.tool];
  if (!place) return null;
  return {
    said: place.said,
    // The recorded target, preferring the address a person would recognise.
    detail: hostOf(execution.target) ?? place.detail ?? null,
  };
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
