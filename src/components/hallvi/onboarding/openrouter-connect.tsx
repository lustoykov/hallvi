"use client";

// Connecting OpenRouter: pay per use for Claude, Gemini and a few others.
//
// The sign-in is OpenRouter's own page for apps: the owner approves Hallvi
// there, and OpenRouter hands this controller a key of its own, labelled
// "Hallvi", that the owner can limit or revoke on openrouter.ai. A key they
// already have can be pasted instead. Either way the key goes to Hallvi on
// this computer and never into a conversation.

import { SpinnerGap } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

import type { OpenRouterLogin } from "@/server/openrouter-login";
import type { PiSetupStatus } from "@/server/pi-setup";

import { Away, Problem, SecretPaste } from "./pieces";

class RequestFailed extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new RequestFailed(
      data?.error ?? "Could not reach Hallvi. Try again.",
      response.status,
    );
  return data;
}

const recognise = (value: string) =>
  value.startsWith("sk-or-")
    ? { ok: true, hint: "Looks like an OpenRouter key." }
    : { ok: false, hint: "OpenRouter keys start with sk-or-." };

/** The body of the request, below whatever introduces it. */
export function OpenRouterConnect({
  onSaved,
  actions,
  quiet = false,
  onWaiting,
}: {
  /** Told while an approval on OpenRouter is outstanding. */
  onWaiting?: (waiting: boolean) => void;
  /** An offer beside another account's blue button, not the request. */
  quiet?: boolean;
  /** The key is saved; the caller rereads the setup. */
  onSaved: (status?: PiSetupStatus) => void | Promise<void>;
  /** Buttons that sit beside Connect, such as going back to ChatGPT. */
  actions?: React.ReactNode;
}) {
  const [login, setLogin] = useState<OpenRouterLogin | null>(null);
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const saved = useRef(onSaved);
  useEffect(() => {
    saved.current = onSaved;
  }, [onSaved]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const outstanding =
    login?.state === "awaiting-user" || login?.state === "exchanging";
  const waitingRef = useRef(onWaiting);
  useEffect(() => {
    waitingRef.current = onWaiting;
  }, [onWaiting]);
  useEffect(() => {
    waitingRef.current?.(outstanding);
    return () => waitingRef.current?.(false);
  }, [outstanding]);

  // Waiting on the other tab: OpenRouter sends it back to Hallvi, which
  // settles this attempt.
  useEffect(() => {
    if (
      busy ||
      (login?.state !== "awaiting-user" && login?.state !== "exchanging")
    )
      return;
    const current = login;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const next = await request<OpenRouterLogin>(
          `/api/pi/setup/openrouter/${current.id}`,
        );
        if (!active || !alive.current) return;
        if (next.state === "complete") await saved.current();
        if (active && alive.current) setLogin(next);
      } catch (caught) {
        if (!active || !alive.current) return;
        const lost = caught instanceof RequestFailed && caught.status === 404;
        setLogin((latest) =>
          latest?.id !== current.id
            ? latest
            : lost
              ? {
                  ...latest,
                  state: "failed",
                  message:
                    "This sign-in is no longer open. Nothing was saved; start again.",
                }
              : { ...latest },
        );
      }
    }, 1_500);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [login, busy]);

  async function cancel() {
    if (!login || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await request<OpenRouterLogin>(
        `/api/pi/setup/openrouter/${login.id}`,
        { method: "DELETE" },
      );
      if (!alive.current) return;
      // The callback may have completed before the cancel reached Hallvi.
      if (next.state === "complete") await saved.current();
      if (alive.current) setLogin(next);
    } catch (caught) {
      if (alive.current)
        setError(caught instanceof Error ? caught.message : "Try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function start() {
    if (busy) return;
    // Opened inside the click, so no popup blocker stands in the way, and
    // pointed at OpenRouter once Hallvi has made the attempt.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    setError(null);
    try {
      const next = await request<OpenRouterLogin>("/api/pi/setup/openrouter", {
        method: "POST",
        body: "{}",
      });
      if (!alive.current) {
        tab?.close();
        return;
      }
      if (tab) tab.location.href = next.authorizeUrl;
      setLogin(next);
    } catch (caught) {
      tab?.close();
      setError(caught instanceof Error ? caught.message : "Try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  const waiting =
    login?.state === "awaiting-user" || login?.state === "exchanging";
  if (waiting)
    return (
      <>
        <p className="hv-ob-fine" role="status">
          <SpinnerGap className="spin" aria-hidden="true" />{" "}
          {login.state === "exchanging"
            ? "Finishing OpenRouter sign-in…"
            : "Waiting for approval on OpenRouter. Nothing else is happening."}
        </p>
        <div className="hv-ob-row">
          <Away href={login.authorizeUrl}>Open OpenRouter</Away>
          <button
            type="button"
            className="hv-ob-quiet"
            disabled={busy}
            onClick={() => void cancel()}
          >
            Cancel
          </button>
        </div>
        {error && (
          <Problem title="Could not cancel sign-in">
            <p>{error}</p>
          </Problem>
        )}
      </>
    );

  return (
    <>
      {login?.state === "cancelled" && (
        <p className="hv-ob-fine" role="status">
          {login.message}
        </p>
      )}
      {login?.state === "failed" && (
        <Problem title="OpenRouter wasn’t connected">
          <p>{login.message}</p>
        </Problem>
      )}
      <p>
        Pay per use for Claude, Gemini and a few others through your OpenRouter
        account. You approve Hallvi on OpenRouter’s own page and can set a
        spending limit there.
      </p>
      {pasting && (
        <SecretPaste
          label="OpenRouter key"
          recognise={recognise}
          busy={busy}
          action="Save key"
          onSubmit={async (key) => {
            setBusy(true);
            setError(null);
            try {
              const status = await request<PiSetupStatus>(
                "/api/pi/setup/openrouter",
                { method: "PUT", body: JSON.stringify({ key }) },
              );
              await saved.current(status);
              return true;
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : "Try again.");
              return false;
            } finally {
              if (alive.current) setBusy(false);
            }
          }}
        />
      )}
      <div className="hv-ob-row">
        <button
          type="button"
          className={pasting || quiet ? "hv-ob-quiet" : "hv-ob-primary"}
          disabled={busy}
          onClick={() => void start()}
        >
          {pasting ? "Sign in instead" : "Connect OpenRouter"}
        </button>
        {!pasting && (
          <button
            type="button"
            className="hv-ob-quiet"
            onClick={() => setPasting(true)}
          >
            Paste a key instead
          </button>
        )}
        {actions}
      </div>
      {error && (
        <Problem title="That didn’t work">
          <p>{error}</p>
        </Problem>
      )}
    </>
  );
}
