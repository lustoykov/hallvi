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

import { Eye, Key, Trash } from "@phosphor-icons/react";
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
  if (!waiting.length) return null;
  return (
    <div className="sg-secrets" aria-label="Values Server Guy has asked for">
      {waiting.map((secret) => (
        <SecretField
          key={secret.name}
          applicationId={applicationId}
          secret={secret}
          onChanged={onChanged}
        />
      ))}
      {/* Said once for however many values are being asked for, rather than
          five lines of the same security explanation under each field. */}
      <details className="sg-secret-how">
        <summary>How Server Guy handles these</summary>
        <p>
          The value posts straight to the controller, so it never becomes a
          message and is never part of the model&rsquo;s context. It is stored
          encrypted, and nothing reads it back for display — there is no reveal
          control because there is nothing to reveal it from.
        </p>
        <p>
          When a command needs it, the privileged layer exports it into that
          command&rsquo;s environment as it runs. The name appears in the saved
          command; the value does not, in the record, the activity or the log.
          Exact matches are removed from captured output.
        </p>
        <p>
          What that does not cover: a command Pi writes can read the value from
          its own environment and transform or send it somewhere, and redaction
          cannot recognise it once it has been changed. Encryption keeps
          plaintext out of casual file inspection; it does not protect a copy of
          the whole Server Guy configuration, or anyone who can read this
          computer.
        </p>
      </details>
    </div>
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

  const send = async (method: "POST" | "DELETE") => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/applications/${applicationId}/secrets`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            method === "POST"
              ? { name: secret.name, value }
              : { name: secret.name },
          ),
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
        if (value.length >= MINIMUM_LENGTH) void send("POST");
      }}
    >
      <h3>
        <Key weight="bold" aria-hidden="true" />
        Server Guy needs a value that should stay out of chat
      </h3>
      <p className="sg-secret-why">{secret.why}</p>
      <label htmlFor={`secret-${secret.name}`}>
        <code>{secret.name}</code>
        {secret.process && <small>for {secret.process}</small>}
      </label>
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
        <button type="submit" disabled={busy || value.length < MINIMUM_LENGTH}>
          Give it
        </button>
        <button
          type="button"
          className="sg-secret-drop"
          disabled={busy}
          title="Forget the value I gave you"
          aria-label="Forget the value I gave you"
          onClick={() => void send("DELETE")}
        >
          <Trash weight="bold" aria-hidden="true" />
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
      {/* This used to describe a `{{secret:NAME}}` handle substituted into
          the command text. That mechanism was replaced — the privileged layer
          exports the value into the command's environment instead, and the
          server now refuses a command containing that pattern — so the
          sentence described something the product does not do. The limit
          stays on the face: it is the part that decides whether supplying a
          value here is safe enough for the reader's purpose. */}
      <p className="sg-secret-note">
        <Eye weight="bold" aria-hidden="true" />
        Never a message, and never in a saved command — but a command Pi writes
        can still use it.
      </p>
    </form>
  );
}
