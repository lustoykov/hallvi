"use client";

// The one place a secret is typed.
//
// Pi asked for a value that should stay out of chat, and this is where the
// owner supplies it. It is deliberately not the message box: anything typed
// there becomes a message, and a message is in the model's context, in the
// transcript, and in every artifact made from either. This posts straight to
// the controller instead, and what Pi is given is a handle.
//
// There is no reveal control, because there is nothing to reveal it from —
// the value is written once and never read back by anything that could
// display it.
//
// It asks for one value at a time. Four requests drawn as four cards came to
// roughly 500px of stacked forms above the composer, which is both more than
// the conversation they interrupt and more than anyone can act on: a person
// types one value, then the next. The queue keeps every name visible so
// nothing is hidden by being folded — only the form for the one being
// answered is drawn.

import { CaretRight, Eye, Key } from "@phosphor-icons/react";
import { useState } from "react";

/** The floor the controller enforces; see MINIMUM_LENGTH on the server. */
const MINIMUM_LENGTH = 8;

import "./secret-request.css";

export interface SecretRequest {
  name: string;
  why: string;
  process: string | null;
  requestedAt: string;
  establishedAt: string | null;
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
  const waiting = secrets.filter((secret) => !secret.establishedAt);
  const [asked, setAsked] = useState<string | null>(null);
  // Whatever was chosen, as long as it is still waiting: answering one
  // removes it from the queue, and the next takes its place without a click.
  const current = waiting.find((item) => item.name === asked) ?? waiting[0];
  if (!current) return null;

  return (
    <section
      className="sg-secrets"
      aria-label="Values Server Guy has asked for"
    >
      <h3 className="sg-secrets-head">
        <Key weight="bold" aria-hidden="true" />
        {waiting.length === 1
          ? "Server Guy needs a value that stays out of chat"
          : `Server Guy needs ${waiting.length} values that stay out of chat`}
      </h3>

      {waiting.length > 1 && (
        <nav className="sg-secrets-queue" aria-label="Values waiting">
          {waiting.map((item) => (
            <button
              key={item.name}
              type="button"
              className="sg-secrets-tab"
              aria-current={item.name === current.name}
              onClick={() => setAsked(item.name)}
            >
              {item.name}
            </button>
          ))}
        </nav>
      )}

      <SecretField
        key={current.name}
        applicationId={applicationId}
        secret={current}
        onChanged={(next) => {
          setAsked(null);
          onChanged(next);
        }}
      />

      {/* The limit stays on the face — it is the part that decides whether
          supplying a value here is safe enough for the reader's purpose — and
          the full account is one disclosure for the group rather than five
          lines of security prose repeated under every field. */}
      <div className="sg-secrets-foot">
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
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="sg-secret"
      onSubmit={(event) => {
        event.preventDefault();
        if (value.length >= MINIMUM_LENGTH) void send();
      }}
    >
      <label htmlFor={`secret-${secret.name}`}>
        <code>{secret.name}</code>
        {secret.process && <small>for {secret.process}</small>}
      </label>
      <p className="sg-secret-why">{secret.why}</p>
      <div className="sg-secret-row">
        <input
          id={`secret-${secret.name}`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={busy}
          placeholder="Type or paste it here"
          onChange={(event) => setValue(event.target.value)}
        />
        {/* There was a third control here, a trash button wired to DELETE.
            It cleared a stored value — and this panel only ever draws
            requests that have none, so on every row it was ever rendered
            beside, it did nothing. */}
        <button type="submit" disabled={busy || value.length < MINIMUM_LENGTH}>
          Give it
        </button>
      </div>
      {error && <p className="sg-secret-error">{error}</p>}
      {value.length > 0 && value.length < MINIMUM_LENGTH && (
        <p className="sg-secret-error">
          At least {MINIMUM_LENGTH} characters. Anything shorter turns up in
          ordinary command output too often for exact-value redaction to be
          useful, so Server Guy will not accept it.
        </p>
      )}
    </form>
  );
}
