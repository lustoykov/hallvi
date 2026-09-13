"use client";

/* PROTOTYPE — THROWAWAY. Delete this file, its stylesheet, and the four
 * lines that mount it in chat-pane.tsx once one of these wins.
 *
 * The question: how should Server Guy ask for a value that must stay out of
 * chat, when four of them are waiting at once? The shipped answer put a form
 * between the transcript and the composer, which at 1440×900 is the worst
 * place in the pane — it displaces the conversation and crowds the one
 * control that is always needed.
 *
 * Three answers that disagree about structure, not colour:
 *
 *   A  In the conversation.  The request is a message, because that is what
 *      it is. It scrolls with history; a thin chip above the composer carries
 *      you back to it. Nothing sits between transcript and composer.
 *
 *   B  The composer's mode.  No panel at all. The box you always type in
 *      grows a mode strip; picking a value re-points the same box at the
 *      controller instead of the conversation. "Out of chat" becomes a
 *      property of the input rather than a paragraph about one.
 *
 *   C  A sheet.  One line above the composer says what is wanted. Supplying
 *      is a separate, focused surface that opens over the pane and closes
 *      again. The conversation is never displaced.
 *
 * Switch with ?secrets=A|B|C. No persistence beyond the real POST each
 * variant already makes — these write to the same controller endpoint the
 * shipped panel does, so a value supplied here is really supplied.
 */

import { CaretRight, Eye, Key, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import type { SecretRequest } from "./secret-request";
import "./secret-request-prototype.css";

const MINIMUM_LENGTH = 8;
export const VARIANTS = ["A", "B", "C"] as const;
export type Variant = (typeof VARIANTS)[number];
export const VARIANT_NAMES: Record<Variant, string> = {
  A: "In the conversation",
  B: "The composer's mode",
  C: "A sheet",
};

export function useSecretsVariant(): Variant | null {
  const params = useSearchParams();
  // Null outside a router — server-rendered tests mount the pane directly.
  const asked = (params?.get("secrets") ?? "").toUpperCase();
  return (VARIANTS as readonly string[]).includes(asked)
    ? (asked as Variant)
    : null;
}

/** Posting a value. Shared, because it is not the thing being compared. */
function useGive(
  applicationId: string,
  onChanged: (s: SecretRequest[]) => void,
) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const give = async (name: string, value: string) => {
    setBusy(name);
    setError(null);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/secrets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, value }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "It was not accepted.");
      onChanged(body.secrets ?? []);
      return true;
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { give, busy, error };
}

const NOTE =
  "Never a message, and never in a saved command — but a command Pi writes can still use it.";

function Handling() {
  return (
    <details className="pr-how">
      <summary>
        How Server Guy handles these
        <CaretRight weight="bold" aria-hidden="true" />
      </summary>
      <p>
        The value posts straight to the controller, so it never becomes a
        message and is never part of the model&rsquo;s context. It is stored
        encrypted, and nothing reads it back for display.
      </p>
      <p>
        When a command needs it, the privileged layer exports it into that
        command&rsquo;s environment as it runs. The name appears in the saved
        command; the value does not. Exact matches are removed from captured
        output — but a command Pi writes can transform the value first, and
        redaction cannot recognise it once it has been changed.
      </p>
    </details>
  );
}

/* ───────────────────────── A — In the conversation ───────────────────────── */

export function VariantATranscript({
  applicationId,
  waiting,
  onChanged,
}: {
  applicationId: string;
  waiting: SecretRequest[];
  onChanged: (s: SecretRequest[]) => void;
}) {
  const { give, busy, error } = useGive(applicationId, onChanged);
  const [values, setValues] = useState<Record<string, string>>({});
  if (!waiting.length) return null;
  return (
    <div className="pr-a" id="pr-secret-message">
      <div className="pr-a-who">
        <span className="pr-a-avatar" aria-hidden="true">
          SG
        </span>
        <strong>Server Guy</strong>
        <span className="pr-a-asks">asks for</span>
      </div>
      <div className="pr-a-body">
        <p className="pr-a-say">
          Before I go on I need {waiting.length}{" "}
          {waiting.length === 1 ? "value" : "values"} that should stay out of
          this conversation.
        </p>
        <ul className="pr-a-list">
          {waiting.map((secret) => (
            <li key={secret.name}>
              <div className="pr-a-name">
                <code>{secret.name}</code>
                {secret.process && <small>for {secret.process}</small>}
              </div>
              <p className="pr-a-why">{secret.why}</p>
              <form
                className="pr-a-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = values[secret.name] ?? "";
                  if (value.length >= MINIMUM_LENGTH)
                    void give(secret.name, value).then((ok) => {
                      if (ok)
                        setValues((held) => ({ ...held, [secret.name]: "" }));
                    });
                }}
              >
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Type or paste it here"
                  value={values[secret.name] ?? ""}
                  disabled={busy === secret.name}
                  onChange={(event) =>
                    setValues((held) => ({
                      ...held,
                      [secret.name]: event.target.value,
                    }))
                  }
                />
                <button
                  type="submit"
                  disabled={(values[secret.name] ?? "").length < MINIMUM_LENGTH}
                >
                  Give it
                </button>
              </form>
            </li>
          ))}
        </ul>
        {error && <p className="pr-error">{error}</p>}
        <p className="pr-note">
          <Eye weight="bold" aria-hidden="true" />
          {NOTE}
        </p>
        <Handling />
      </div>
    </div>
  );
}

/** The thin chip that carries you back, when the message has scrolled away. */
export function VariantAChip({ waiting }: { waiting: SecretRequest[] }) {
  const [away, setAway] = useState(false);
  useEffect(() => {
    const block = document.getElementById("pr-secret-message");
    if (!block) return;
    const watch = new IntersectionObserver(
      ([entry]) => setAway(!entry.isIntersecting),
      { threshold: 0.15 },
    );
    watch.observe(block);
    return () => watch.disconnect();
  }, [waiting.length]);
  if (!waiting.length || !away) return null;
  return (
    <button
      type="button"
      className="pr-a-chip"
      onClick={() =>
        document
          .getElementById("pr-secret-message")
          ?.scrollIntoView({ behavior: "smooth", block: "center" })
      }
    >
      <Key weight="bold" aria-hidden="true" />
      {waiting.length} {waiting.length === 1 ? "value" : "values"} waiting
      <span className="pr-a-chip-go">go to it ↑</span>
    </button>
  );
}

/* ─────────────────────── B — The composer's mode ─────────────────────── */

export function VariantBStrip({
  waiting,
  mode,
  onMode,
}: {
  waiting: SecretRequest[];
  mode: string | null;
  onMode: (name: string | null) => void;
}) {
  if (!waiting.length) return null;
  return (
    <div className="pr-b-strip" role="tablist" aria-label="What the box sends">
      <button
        type="button"
        role="tab"
        aria-selected={mode === null}
        className="pr-b-tab"
        onClick={() => onMode(null)}
      >
        Message
      </button>
      <span className="pr-b-split" aria-hidden="true" />
      {waiting.map((secret) => (
        <button
          key={secret.name}
          type="button"
          role="tab"
          aria-selected={mode === secret.name}
          className="pr-b-tab pr-b-value"
          onClick={() => onMode(secret.name)}
        >
          <Key weight="bold" aria-hidden="true" />
          {secret.name}
        </button>
      ))}
    </div>
  );
}

export function VariantBComposer({
  applicationId,
  secret,
  onChanged,
  onDone,
}: {
  applicationId: string;
  secret: SecretRequest;
  onChanged: (s: SecretRequest[]) => void;
  onDone: () => void;
}) {
  const { give, busy, error } = useGive(applicationId, onChanged);
  const [value, setValue] = useState("");
  return (
    <form
      className="pr-b-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.length >= MINIMUM_LENGTH)
          void give(secret.name, value).then((ok) => ok && onDone());
      }}
    >
      <p className="pr-b-why">
        <strong>{secret.name}</strong>
        {secret.process && <span> for {secret.process}</span>} — {secret.why}
      </p>
      <div className="pr-b-box">
        <input
          type="password"
          autoComplete="off"
          autoFocus
          placeholder={`Paste ${secret.name} — it goes to the controller, not the conversation`}
          value={value}
          disabled={busy !== null}
          onChange={(event) => setValue(event.target.value)}
        />
        <div className="pr-b-bar">
          <span className="pr-b-hint">
            <Eye weight="bold" aria-hidden="true" />
            {NOTE}
          </span>
          <button type="submit" disabled={value.length < MINIMUM_LENGTH}>
            <Key weight="fill" aria-hidden="true" />
            Give it
          </button>
        </div>
      </div>
      {error && <p className="pr-error">{error}</p>}
    </form>
  );
}

/* ───────────────────────────── C — A sheet ───────────────────────────── */

export function VariantCLine({
  waiting,
  onOpen,
}: {
  waiting: SecretRequest[];
  onOpen: () => void;
}) {
  if (!waiting.length) return null;
  return (
    <div className="pr-c-line">
      <Key weight="bold" aria-hidden="true" />
      <span>
        Server Guy needs {waiting.length}{" "}
        {waiting.length === 1 ? "value" : "values"} before it can go on
      </span>
      <span className="pr-c-names">
        {waiting.map((s) => s.name).join(" · ")}
      </span>
      <button type="button" onClick={onOpen}>
        Supply {waiting.length === 1 ? "it" : "them"}
      </button>
    </div>
  );
}

export function VariantCSheet({
  applicationId,
  waiting,
  onChanged,
  onClose,
}: {
  applicationId: string;
  waiting: SecretRequest[];
  onChanged: (s: SecretRequest[]) => void;
  onClose: () => void;
}) {
  const { give, busy, error } = useGive(applicationId, onChanged);
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    const escape = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose]);
  return (
    <div className="pr-c-scrim" onClick={onClose}>
      <aside
        className="pr-c-sheet"
        role="dialog"
        aria-label="Values Server Guy has asked for"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>
            <Key weight="bold" aria-hidden="true" />
            {waiting.length} {waiting.length === 1 ? "value" : "values"} that
            stay out of chat
          </h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X weight="bold" aria-hidden="true" />
          </button>
        </header>
        <div className="pr-c-scroll">
          {waiting.map((secret) => (
            <form
              key={secret.name}
              className="pr-c-item"
              onSubmit={(event) => {
                event.preventDefault();
                const value = values[secret.name] ?? "";
                if (value.length >= MINIMUM_LENGTH)
                  void give(secret.name, value).then((ok) => {
                    if (ok)
                      setValues((held) => ({ ...held, [secret.name]: "" }));
                  });
              }}
            >
              <div className="pr-c-name">
                <code>{secret.name}</code>
                {secret.process && <small>for {secret.process}</small>}
              </div>
              <p className="pr-c-why">{secret.why}</p>
              <div className="pr-c-row">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Type or paste it here"
                  value={values[secret.name] ?? ""}
                  disabled={busy === secret.name}
                  onChange={(event) =>
                    setValues((held) => ({
                      ...held,
                      [secret.name]: event.target.value,
                    }))
                  }
                />
                <button
                  type="submit"
                  disabled={(values[secret.name] ?? "").length < MINIMUM_LENGTH}
                >
                  Give it
                </button>
              </div>
            </form>
          ))}
          {error && <p className="pr-error">{error}</p>}
        </div>
        <footer>
          <p className="pr-note">
            <Eye weight="bold" aria-hidden="true" />
            {NOTE}
          </p>
          <Handling />
        </footer>
      </aside>
    </div>
  );
}

/* ───────────────────────────── the switcher ───────────────────────────── */

export function SecretsSwitcher({ current }: { current: Variant }) {
  const router = useRouter();
  const params = useSearchParams();
  const go = (step: number) => {
    const index =
      (VARIANTS.indexOf(current) + step + VARIANTS.length) % VARIANTS.length;
    const next = new URLSearchParams(params?.toString() ?? "");
    next.set("secrets", VARIANTS[index]);
    router.replace(`?${next.toString()}`, { scroll: false });
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="pr-switch">
      <button
        type="button"
        onClick={() => go(-1)}
        aria-label="Previous variant"
      >
        ‹
      </button>
      <span>
        <b>{current}</b> — {VARIANT_NAMES[current]}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant">
        ›
      </button>
    </div>
  );
}
