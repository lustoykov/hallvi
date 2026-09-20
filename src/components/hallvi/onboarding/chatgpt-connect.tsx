"use client";

// Connecting ChatGPT, as a turn in the conversation.
//
// The composer used to say "Connect ChatGPT to chat" and send the reader to
// Settings and back. The sign-in is a short code approved on ChatGPT's own
// page, so it needs no page of its own: it is drawn here, beside the message
// the reader was writing, and that message never has to travel.
//
// Two things stay apart. Signing in is not choosing a model: preferences stay
// in Settings, one link away. And a saved login is not a working one: nothing
// has been asked of ChatGPT with it until the first message, so the receipt
// says saved, never verified. Finishing here never sends anything.

import { SpinnerGap } from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PiLoginAttempt, PiSetupStatus } from "@/server/pi-setup";

import { Away, CopyLine, Problem, Receipt, RequestCard } from "./pieces";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(data?.error ?? "Could not reach Hallvi. Try again.");
  return data;
}

const pending = (attempt: PiLoginAttempt | null) =>
  attempt?.state === "starting" || attempt?.state === "awaiting-user";

export function ChatgptConnect({
  settingsHref,
  onConnected,
  onClose,
}: {
  /** Settings, carrying the conversation to come back to. */
  settingsHref: string;
  /** A login is saved: the composer can send. */
  onConnected: () => void;
  onClose?: () => void;
}) {
  const [status, setStatus] = useState<PiSetupStatus | null>(null);
  const [attempt, setAttempt] = useState<PiLoginAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const connected = useRef(onConnected);
  useEffect(() => {
    connected.current = onConnected;
  }, [onConnected]);

  const load = useCallback(async () => {
    // The preview asks what is already on this machine without saving it.
    const fresh = await request<PiSetupStatus>("/api/pi/setup?preview=1");
    if (!alive.current) return null;
    setStatus(fresh);
    if (fresh.ready) connected.current();
    return fresh;
  }, []);

  useEffect(() => {
    alive.current = true;
    void load().catch((caught: Error) => setError(caught.message));
    return () => {
      alive.current = false;
    };
  }, [load]);

  useEffect(() => {
    if (!pending(attempt)) return;
    const current = attempt!;
    const timer = window.setTimeout(
      async () => {
        try {
          const next = await request<PiLoginAttempt>(
            `/api/pi/setup/login/${current.id}`,
          );
          if (!alive.current) return;
          if (next.state === "complete") await load();
          setAttempt(next);
        } catch {
          if (!alive.current) return;
          // A check that failed says nothing about the sign-in: keep asking.
          setAttempt((latest) =>
            latest?.id === current.id ? { ...latest } : latest,
          );
        }
      },
      current.state === "starting" ? 700 : 1_500,
    );
    return () => window.clearTimeout(timer);
  }, [attempt, load]);

  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Try again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  if (status?.ready)
    return (
      <Receipt title="ChatGPT login saved · checked with your first message">
        <p>
          Nothing has been sent. If ChatGPT refuses the login, the conversation
          says so and keeps your message.{" "}
          <Link href={settingsHref}>Model preferences</Link>
        </p>
      </Receipt>
    );

  if (!status)
    return (
      <RequestCard
        asks="needs a model to think with"
        state="waiting"
        label="Connect ChatGPT"
      >
        {error ? (
          <Problem title="Hallvi didn’t answer">
            <p>{error}</p>
          </Problem>
        ) : (
          <p>
            <SpinnerGap className="spin" aria-hidden="true" /> Looking for a
            ChatGPT login…
          </p>
        )}
      </RequestCard>
    );

  const start = () =>
    act(async () =>
      setAttempt(
        await request<PiLoginAttempt>("/api/pi/setup/login", {
          method: "POST",
          body: JSON.stringify({
            modelId: status.selection.modelId,
            reasoningEffort: status.selection.reasoningEffort,
          }),
        }),
      ),
    );
  const reusable = status.detected?.canReuse ? status.detected : null;
  const stopped = attempt?.state === "cancelled";
  const failed = attempt?.state === "failed";
  const close = onClose && !pending(attempt) && (
    <button type="button" className="hv-ob-quiet" onClick={onClose}>
      Not now
    </button>
  );

  return (
    <RequestCard
      asks="needs a model to think with"
      state={pending(attempt) ? "working" : failed ? "failed" : "waiting"}
      label="Connect ChatGPT"
    >
      {pending(attempt) && attempt ? (
        <>
          <p>Enter this code on ChatGPT, then approve:</p>
          {attempt.userCode ? (
            <div className="hv-ob-code">
              <CopyLine value={attempt.userCode} label="Copy code" />
            </div>
          ) : (
            <p>
              <SpinnerGap className="spin" aria-hidden="true" /> Getting a code…
            </p>
          )}
          {attempt.verificationUri && (
            <Away href={attempt.verificationUri}>Open ChatGPT</Away>
          )}
          <p className="hv-ob-fine" role="status">
            <SpinnerGap className="spin" aria-hidden="true" /> Waiting for you
            to approve on ChatGPT. Nothing else is happening.
          </p>
          <div className="hv-ob-row">
            <button
              type="button"
              className="hv-ob-quiet"
              disabled={busy}
              onClick={() =>
                void act(async () =>
                  setAttempt(
                    await request<PiLoginAttempt>(
                      `/api/pi/setup/login/${attempt.id}`,
                      { method: "DELETE" },
                    ),
                  ),
                )
              }
            >
              Cancel sign-in
            </button>
          </div>
        </>
      ) : (
        <>
          {stopped ? (
            <Problem title="Sign-in cancelled">
              <p>You stopped it. Nothing was saved.</p>
            </Problem>
          ) : failed ? (
            <Problem title="The sign-in didn’t finish">
              <p>{attempt?.message || "Nothing was saved."}</p>
            </Problem>
          ) : status.issue ? (
            // A saved login that ChatGPT or Pi turned down, in their words.
            <Problem title="The saved ChatGPT login isn’t working">
              <p>{status.issue}</p>
            </Problem>
          ) : (
            <p>
              Hallvi thinks with a model through your ChatGPT plan. You approve
              it on ChatGPT’s own page with a short code; your password never
              reaches Hallvi.
            </p>
          )}
          <p className="hv-ob-fine">
            It sends your messages and the files Hallvi reads to the model. It
            has nothing to do with GitHub, and signing in sends nothing by
            itself.
          </p>
          <div className="hv-ob-row">
            {reusable && !stopped && !failed ? (
              <>
                <button
                  type="button"
                  className="hv-ob-primary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await request<PiSetupStatus>("/api/pi/setup", {
                        method: "POST",
                        body: JSON.stringify({
                          mode: "shared",
                          candidateId: reusable.id,
                        }),
                      });
                      await load();
                    })
                  }
                >
                  Use the ChatGPT login on this machine
                </button>
                <button
                  type="button"
                  className="hv-ob-quiet"
                  disabled={busy}
                  onClick={() => void start()}
                >
                  Sign in separately
                </button>
              </>
            ) : (
              <button
                type="button"
                className="hv-ob-primary"
                disabled={busy}
                onClick={() => void start()}
              >
                {stopped || failed ? "Get a new code" : "Connect ChatGPT"}
              </button>
            )}
            {close}
          </div>
        </>
      )}
      {error && (
        <Problem title="That didn’t work">
          <p>{error}</p>
        </Problem>
      )}
    </RequestCard>
  );
}
