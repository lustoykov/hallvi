"use client";

// The one place a secret is typed.
//
// Pi asked for a value it must never hold, and this is where the owner
// supplies it. It is deliberately not the message box: anything typed there
// becomes a message, and a message is in the model's context, in the
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
        Server Guy needs a value it should not see
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
          title="Server Guy should not have asked for this"
          onClick={() => void send("DELETE")}
        >
          <Trash weight="bold" aria-hidden="true" />
        </button>
      </div>
      {error && <p className="sg-secret-error">{error}</p>}
      {value.length > 0 && value.length < MINIMUM_LENGTH && (
        <p className="sg-secret-error">
          At least {MINIMUM_LENGTH} characters. Anything shorter turns up in
          ordinary command output too often to be kept out of it, and Server Guy
          will not accept a value it cannot promise to hide.
        </p>
      )}
      <p className="sg-secret-note">
        <Eye weight="bold" aria-hidden="true" />
        This does not become a message. Server Guy is given a handle,{" "}
        <code>{`{{secret:${secret.name}}}`}</code>, and the value is put in only
        as a command is run — so it stays out of the conversation, the saved
        records and the logs. It is kept encrypted on this computer, which
        protects it from being copied by accident, not from anyone who already
        has this computer.
      </p>
    </form>
  );
}
