"use client";

// The one place a secret is typed — inside the conversation that asked for it.
//
// Pi asked for a value that should stay out of chat, and this is where the
// owner supplies it. It is deliberately not the message box: anything typed
// there becomes a message, and a message is in the model's context, in the
// transcript, and in every artifact made from either. This posts straight to
// the controller instead, and what Pi is given is a handle.
//
// There is no reveal control, because there is nothing to reveal it from —
// the value is written once and never read back by anything that could
// display it. Nothing on this surface, at any stage, renders a supplied
// value: pending rows show a name and a purpose, and a supplied row shows a
// name and a time.
//
// It is drawn as what it is: a turn in the conversation, at the point Pi
// asked, scrolling with everything else. Earlier arrangements pinned it
// between the transcript and the composer, where it displaced the
// conversation it interrupted and crowded the one control always needed.
// Nothing is pinned there now except, once the request has scrolled out of
// sight, a single chip that carries you back to it.

import { CaretRight, Check, Eye, Key } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

/** The floor the controller enforces; see MINIMUM_LENGTH on the server. */
const MINIMUM_LENGTH = 8;

/** The request block's anchor, shared with the chip that returns to it. */
export const SECRET_REQUEST_ANCHOR = "sg-secret-request";

import "./secret-request.css";

export interface SecretRequest {
  name: string;
  why: string;
  process: string | null;
  requestedAt: string;
  establishedAt: string | null;
}

/**
 * Where in the transcript the request belongs: after the message that was
 * the latest one when Pi first asked. Answering a field must not move it,
 * so the point is taken from the earliest request in the group regardless of
 * which are still outstanding — and it survives a refresh, because it is
 * derived from timestamps rather than from where the reader happens to be.
 */
export function secretRequestPoint(
  secrets: SecretRequest[],
  messages: { id: string; createdAt: string }[],
): string | null {
  if (!secrets.length || !messages.length) return null;
  const asked = secrets
    .map((secret) => secret.requestedAt)
    .sort()
    .at(0);
  if (!asked) return null;
  let point: string | null = null;
  for (const message of messages)
    if (message.createdAt <= asked) point = message.id;
  return point;
}

/**
 * The purpose, without the security sentence repeated under every field.
 *
 * Pi writes a `why` that states what the value is for and then, on every
 * single request, that it will be stored in the server environment and not
 * the repository or logs. Four of those is four copies of one paragraph the
 * group already carries once. The first sentence is the purpose; the rest is
 * available on the element's title.
 */
export function purposeOf(why: string): string {
  const first = why.trim().match(/^.*?[.!?](?=\s|$)/);
  return (first ? first[0] : why.trim()).trim();
}

export function SecretRequests({
  applicationId,
  secrets,
  onChanged,
}: {
  applicationId: string;
  secrets: SecretRequest[];
  onChanged: (secrets: SecretRequest[]) => void;
}) {
  if (!secrets.length) return null;
  const waiting = secrets.filter((secret) => !secret.establishedAt);
  const supplied = secrets.filter((secret) => secret.establishedAt);

  // Everything asked for has been given. The request stops being a form and
  // becomes a receipt: what was supplied, never a value, and how many.
  if (!waiting.length)
    return (
      <section
        className="sg-secrets"
        id={SECRET_REQUEST_ANCHOR}
        data-done=""
        aria-label="Values supplied to Server Guy"
      >
        <Who />
        <div className="sg-secrets-body">
          <details className="sg-secrets-receipt">
            <summary>
              <Check weight="bold" aria-hidden="true" />
              {supplied.length} configuration{" "}
              {supplied.length === 1 ? "value" : "values"} supplied
              <CaretRight
                className="sg-secrets-caret"
                weight="bold"
                aria-hidden="true"
              />
            </summary>
            <ul className="sg-secrets-given">
              {supplied.map((secret) => (
                <li key={secret.name}>
                  <code>{secret.name}</code>
                  {secret.process && <small>for {secret.process}</small>}
                  <span className="sg-secrets-when">
                    supplied {when(secret.establishedAt!)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="sg-secret-note">
              <Eye weight="bold" aria-hidden="true" />
              The values themselves are not shown here or anywhere else — they
              are written once and never read back for display.
            </p>
          </details>
        </div>
      </section>
    );

  return (
    <section
      className="sg-secrets"
      id={SECRET_REQUEST_ANCHOR}
      aria-labelledby={`${SECRET_REQUEST_ANCHOR}-said`}
    >
      <Who />
      <div className="sg-secrets-body">
        {/* One title and one explanation, for however many fields follow. */}
        <p className="sg-secrets-said" id={`${SECRET_REQUEST_ANCHOR}-said`}>
          <Key weight="bold" aria-hidden="true" />
          <span>
            Before I go on I need {waiting.length}{" "}
            {waiting.length === 1 ? "value" : "values"} that should stay out of
            this conversation.
            {supplied.length > 0 && (
              <em className="sg-secrets-progress">
                {" "}
                {supplied.length} of {secrets.length} already supplied.
              </em>
            )}
          </span>
        </p>
        <ul className="sg-secrets-list">
          {waiting.map((secret) => (
            <li key={secret.name}>
              <SecretField
                applicationId={applicationId}
                secret={secret}
                onChanged={onChanged}
              />
            </li>
          ))}
          {/* What is already done, stated as a name and nothing more. */}
          {supplied.map((secret) => (
            <li key={secret.name} className="sg-secrets-done">
              <Check weight="bold" aria-hidden="true" />
              <code>{secret.name}</code>
              <span className="sg-secrets-when">
                supplied {when(secret.establishedAt!)}
              </span>
            </li>
          ))}
        </ul>
        {/* The limit stays on the face — it is the part that decides whether
            supplying a value here is safe enough for the reader's purpose —
            and the full account is one disclosure for the whole group rather
            than the same security prose repeated under every field. */}
        <p className="sg-secret-note">
          <Eye weight="bold" aria-hidden="true" />
          Never a message, and never in a saved command — but a command Pi
          writes can still use it.
        </p>
        <details className="sg-secret-how">
          <summary>
            How Server Guy handles these
            <CaretRight weight="bold" aria-hidden="true" />
          </summary>
          <p>
            The value posts straight to the controller, so it never becomes a
            message and is never part of the model&rsquo;s context. It is stored
            encrypted, and nothing reads it back for display — there is no
            reveal control because there is nothing to reveal it from.
          </p>
          <p>
            When a command needs it, the privileged layer exports it into that
            command&rsquo;s environment as it runs. The name appears in the
            saved command; the value does not, in the record, the activity or
            the log. Exact matches are removed from captured output.
          </p>
          <p>
            What that does not cover: a command Pi writes can read the value
            from its own environment and transform or send it somewhere, and
            redaction cannot recognise it once it has been changed. Encryption
            keeps plaintext out of casual file inspection; it does not protect a
            copy of the whole Server Guy configuration, or anyone who can read
            this computer.
          </p>
        </details>
      </div>
    </section>
  );
}

function Who() {
  return (
    <div className="sg-secrets-who">
      <span className="sg-secrets-avatar" aria-hidden="true">
        SG
      </span>
      <strong>Server Guy</strong>
      <span className="sg-secrets-asks">asked for</span>
    </div>
  );
}

function when(at: string) {
  const time = new Date(at);
  return Number.isNaN(time.valueOf())
    ? "earlier"
    : time.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
}

/**
 * The way back to an ask that has scrolled away.
 *
 * A request in the flow scrolls like the flow, which is the point — and also
 * the one thing that could lose it. This sits above the composer, appears
 * only while the request is off screen and something is still outstanding,
 * and takes you to it.
 */
export function SecretRequestsChip({ secrets }: { secrets: SecretRequest[] }) {
  const waiting = secrets.filter((secret) => !secret.establishedAt).length;
  const [away, setAway] = useState(false);

  useEffect(() => {
    if (!waiting) return;
    let watch: IntersectionObserver | null = null;
    let frame = 0;
    let tries = 0;
    const attach = () => {
      const block = document.getElementById(SECRET_REQUEST_ANCHOR);
      if (block) {
        watch = new IntersectionObserver(
          ([entry]) => setAway(!entry.isIntersecting),
          { threshold: 0.12 },
        );
        watch.observe(block);
        return;
      }
      // The request is a sibling in the transcript, so on a cold load this
      // can run a frame or two before there is anything to watch. Giving up
      // on the first miss is how the chip goes missing exactly when the
      // transcript is long enough to need it.
      if (tries++ < 60) frame = requestAnimationFrame(attach);
    };
    attach();
    return () => {
      cancelAnimationFrame(frame);
      watch?.disconnect();
    };
  }, [waiting]);

  if (!waiting || !away) return null;
  return (
    <button
      type="button"
      className="sg-secrets-chip"
      onClick={() => {
        const block = document.getElementById(SECRET_REQUEST_ANCHOR);
        if (!block) return;
        block.scrollIntoView({ behavior: "smooth", block: "center" });
        // The same brief highlight a repeated record gets, so the thing you
        // asked to be taken to identifies itself on arrival.
        block.classList.add("sg-message-highlight");
        window.setTimeout(
          () => block.classList.remove("sg-message-highlight"),
          2600,
        );
        block
          .querySelector<HTMLInputElement>("input")
          ?.focus({ preventScroll: true });
      }}
    >
      <Key weight="bold" aria-hidden="true" />
      {waiting} {waiting === 1 ? "value" : "values"} still needed
      <span className="sg-secrets-chip-go">go to the request ↑</span>
    </button>
  );
}

function SecretField({
  applicationId,
  secret,
  onChanged,
}: {
  applicationId: string;
  secret: SecretRequest;
  onChanged: (secrets: SecretRequest[]) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = `secret-${secret.name}`;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/secrets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: secret.name, value }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "It was not accepted.");
      setValue("");
      onChanged(body.secrets ?? []);
    } catch (problem) {
      // Stated inside the request that failed, beside the field it belongs
      // to, rather than anywhere the reader would have to go looking.
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  const short = value.length > 0 && value.length < MINIMUM_LENGTH;

  return (
    <form
      className="sg-secret"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.length >= MINIMUM_LENGTH) void send();
      }}
    >
      <label htmlFor={field}>
        <code>{secret.name}</code>
        {secret.process && <small>for {secret.process}</small>}
        <span className="sg-secret-why" title={secret.why}>
          {purposeOf(secret.why)}
        </span>
      </label>
      <div className="sg-secret-row">
        <input
          id={field}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={busy}
          placeholder="Type or paste it here"
          aria-describedby={short ? `${field}-short` : undefined}
          aria-invalid={short || Boolean(error) ? true : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        <button type="submit" disabled={busy || value.length < MINIMUM_LENGTH}>
          {busy ? "Sending…" : "Give it"}
        </button>
      </div>
      {error && (
        <p className="sg-secret-error" role="alert">
          {error}
        </p>
      )}
      {short && (
        <p className="sg-secret-error" id={`${field}-short`}>
          At least {MINIMUM_LENGTH} characters — shorter values turn up in
          ordinary output too often for exact-value redaction to help.
        </p>
      )}
    </form>
  );
}
