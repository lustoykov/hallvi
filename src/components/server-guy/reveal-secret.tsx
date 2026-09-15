"use client";

// Reading back a credential the controller generated.
//
// Everything else about secrets in this product is built so that a value
// cannot be read: not by the model, not by a page, not by a log. This is the
// one deliberate exception, and it exists because the alternative is worse. A
// generated database password that the owner cannot see is a password they do
// not have — it is inside their database and nowhere they can reach — so
// withholding it is not protecting them, it is losing their credential on
// their behalf.
//
// So the exception is made as narrow as it can be:
//
// - Only a value the controller generated. Anything the owner typed, they
//   already know, and reading it back would make the store an oracle for
//   secrets given in confidence. The server refuses those.
// - Only when asked for, by a click, on a panel the reader opened.
// - Fetched at that moment and never before, so an unopened page holds no
//   plaintext and a screenshot of the list cannot contain one.
// - Held in component state only while shown, dropped on hide, on copy and on
//   unmount, and hidden again on a timer so it does not sit on a screen
//   somebody walks away from.
// - Never rendered into anything that persists: no record, no message, no
//   URL.

import { Check, Copy, Eye, EyeSlash } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

import "./reveal-secret.css";

/** How long a revealed value stays on screen before hiding itself. */
const VISIBLE_MS = 30_000;

export function RevealSecret({
  applicationId,
  name,
  revealable = true,
  changing = false,
}: {
  applicationId: string;
  name: string;
  /** Only a generated value can be read back; see revealSecret. */
  revealable?: boolean;
  /** A replacement is part-way through and not yet proven. */
  changing?: boolean;
}) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  const hide = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    setValue(null);
    setCopied(false);
  }, []);

  // A revealed value must not outlive the panel that showed it.
  useEffect(() => hide, [hide]);

  const reveal = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/secrets/reveal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // The controller is asked for exactly one name. There is no shape
          // of this request that returns a list with values in it.
          body: JSON.stringify({ name }),
          cache: "no-store",
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body?.error ?? "It could not be read back.");
      setValue(body.value);
      timer.current = window.setTimeout(hide, VISIBLE_MS);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Copy without showing.
   *
   * The common case is wanting the value in a password manager, not on a
   * screen, so this fetches and writes to the clipboard without the value
   * ever being rendered. It is dropped immediately afterwards.
   */
  const copy = async () => {
    setBusy(true);
    setError(null);
    try {
      let held = value;
      if (!held) {
        const response = await fetch(
          `/api/applications/${applicationId}/secrets/reveal`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
            cache: "no-store",
          },
        );
        const body = await response.json();
        if (!response.ok)
          throw new Error(body?.error ?? "It could not be read back.");
        held = body.value as string;
      }
      await navigator.clipboard.writeText(held!);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "The clipboard refused it. Reveal it and copy by hand.",
      );
    } finally {
      setBusy(false);
    }
  };

  // An owner-supplied value with nothing in flight has nothing to offer here:
  // it cannot be read back and there is no change to report. Rendering an
  // empty container would leave its spacing behind in the panel.
  if (!revealable && !changing) return null;

  return (
    <div className="sg-reveal">
      {revealable && (
        <div className="sg-reveal-row">
          {/* Masked by default, and the mask is not the value: there is no
            plaintext in the DOM until the reader asks for it. */}
          <code className="sg-reveal-value" data-shown={value ? "" : undefined}>
            {/* The mask says "hidden"; it deliberately does not match the
              value's length, which is not the reader's business and wrapped
              onto two lines in a narrow column. */}
            {value ?? "••••••••••••"}
          </code>
          <button
            type="button"
            className="sg-reveal-button"
            onClick={value ? hide : reveal}
            disabled={busy}
            aria-label={value ? `Hide ${name}` : `Reveal ${name}`}
          >
            {value ? (
              <EyeSlash weight="bold" aria-hidden="true" />
            ) : (
              <Eye weight="bold" aria-hidden="true" />
            )}
            {value ? "Hide" : busy ? "Reading…" : "Reveal"}
          </button>
          <button
            type="button"
            className="sg-reveal-button"
            onClick={copy}
            disabled={busy}
            aria-label={`Copy ${name}`}
          >
            {copied ? (
              <Check weight="bold" aria-hidden="true" />
            ) : (
              <Copy weight="bold" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}
      {changing && (
        <p className="sg-reveal-note" data-held="">
          A replacement is part-way through and not in use yet. The value that
          still works is being kept until the new one is proved.
        </p>
      )}
      {value && (
        <p className="sg-reveal-note">
          On screen for {VISIBLE_MS / 1000} seconds, then hidden again. Server
          Guy generated this and keeps it sealed; it is not in the conversation,
          the records or any log.
        </p>
      )}
      {error && (
        <p className="sg-reveal-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
