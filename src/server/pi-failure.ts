// A reader's diagnostic, derived from Pi's native history, never a second
// lifecycle record. Keep payloads and credentials out before bounding the text.
import { redactSecrets } from "./secrets";

export interface NativeFailure {
  source: "model" | "runtime";
  category: "authentication" | "credit" | "rate-limit" | "network" | "unknown";
  reason: string | null;
}

export function nativeFailure(
  source: NativeFailure["source"],
  message: string | undefined,
  clean: (text: string) => string,
): NativeFailure {
  // Provider errors can append JSON, request/response bodies, headers or a
  // stack. Only the first prose line is eligible; never copy an error object.
  const first = (message ?? "").split(/[\r\n]/, 1)[0];
  const prose = first.split(
    /[{\[]|\b(?:request|response)\s+(?:body|payload|headers)\b/i,
    1,
  )[0];
  const redacted = redactSecrets(clean(prose))
    .text.replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, "[REDACTED]")
    .replace(
      /\b(?:[a-z_]*(?:token|secret|password|api[_-]?key)|authorization|cookie)\s*[:=]\s*[^,;]+/gi,
      "[REDACTED]",
    )
    .replace(/https?:\/\/[^\s]+/gi, "[URL omitted]")
    // An unquoted path with spaces has no reliable end; omit through the
    // next delimiter instead of leaking part of a local account location.
    .replace(/(["'])(?:\/|~\/)[^"'\r\n]*\1/gu, "[path omitted]")
    .replace(/(^|[\s("'=])(?:\/|~\/)[^,;:)\]}"'\r\n]+/gu, "$1[path omitted]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .replace(/[;:,]+$/, "");
  const reason = redacted
    ? redacted.length > 400
      ? redacted.slice(0, 399) + "…"
      : redacted
    : null;
  return {
    source,
    category: /\b(401|403)\b|unauthori|invalid_grant|forbidden/i.test(redacted)
      ? "authentication"
      : // OpenRouter's answer when the balance or the key's limit is spent.
        /\b402\b|payment required|insufficient credits|more credits/i.test(
            redacted,
          )
        ? "credit"
        : /\b429\b|rate.?limit|usage.?limit|quota/i.test(redacted)
          ? "rate-limit"
          : /network|fetch failed|ECONN|ETIMEDOUT|ENOTFOUND/i.test(redacted)
            ? "network"
            : "unknown",
    reason,
  };
}

export function failureText(failure: NativeFailure) {
  const who = failure.source === "model" ? "The model" : "Pi";
  const reason = failure.reason
    ? `${who} stopped: ${failure.reason}${/[.!?]$/.test(failure.reason) ? "" : "."}`
    : `${who} stopped without recording a reason.`;
  const next =
    failure.category === "authentication"
      ? "Open Settings and reconnect."
      : failure.category === "credit"
        ? "Add credit on openrouter.ai, or raise the key’s limit there, then retry."
        : failure.category === "rate-limit"
          ? "Check the account allowance, then retry."
          : failure.category === "network"
            ? "Check your connection and retry."
            : "Try again, or inspect the conversation if this repeats.";
  return `${reason} ${next} Check execution history for any effects.`;
}
