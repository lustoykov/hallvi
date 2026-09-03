"use client";

import {
  ArrowLeft,
  ArrowSquareOut,
  Check,
  Copy,
  SpinnerGap,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { PiLoginAttempt, PiSetupStatus } from "@/server/pi-setup";

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !body) {
    throw new Error(body?.error ?? "Server Guy could not complete the Pi setup request.");
  }
  return body;
}

function activeAttempt(attempt: PiLoginAttempt | null) {
  return attempt?.state === "starting" || attempt?.state === "awaiting-user";
}

export function PiSetupScreen({ initialStatus }: { initialStatus: PiSetupStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [attempt, setAttempt] = useState<PiLoginAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/pi/setup", { cache: "no-store" });
    setStatus(await readJson<PiSetupStatus>(response));
  }, []);

  useEffect(() => {
    if (!attempt || !activeAttempt(attempt)) return;
    const currentAttempt = attempt;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/pi/setup/login/${currentAttempt.id}`, { cache: "no-store" });
        const next = await readJson<PiLoginAttempt>(response);
        setAttempt(next);
        if (next.state === "complete") await refreshStatus();
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Could not check the login attempt.";
        setError(message);
        setAttempt((current) =>
          current ? { ...current, state: "failed", message } : current,
        );
      }
    }, currentAttempt.state === "starting" ? 700 : 1_500);
    return () => window.clearTimeout(timeout);
  }, [attempt, refreshStatus]);

  async function startLogin() {
    setError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/pi/setup/login", { method: "POST" });
      setAttempt(await readJson<PiLoginAttempt>(response));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start ChatGPT login.");
    }
  }

  async function cancelLogin() {
    if (!attempt) return;
    try {
      const response = await fetch(`/api/pi/setup/login/${attempt.id}`, { method: "DELETE" });
      setAttempt(await readJson<PiLoginAttempt>(response));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not cancel ChatGPT login.");
    }
  }

  async function copyCode() {
    if (!attempt?.userCode) return;
    await navigator.clipboard.writeText(attempt.userCode);
    setCopied(true);
  }

  const isReady = status.ready;
  const isWorking = activeAttempt(attempt);

  return (
    <main className="sg-setup-shell">
      <header className="sg-setup-topbar">
        <Link className="sg-setup-brand" href="/">
          <span className="sg-app-mark">SG</span>
          <span>Server Guy</span>
        </Link>
        <Link className="sg-setup-back" href="/">
          <ArrowLeft /> Back to operator
        </Link>
      </header>

      <section className="sg-setup-page">
        <header className="sg-setup-heading">
          <div>
            <h1>Connect Pi to ChatGPT</h1>
            <p>
              Server Guy bundles Pi and fixes the Phase 1 model choice. Connect once with your
              ChatGPT account so Pi can answer inside the operator.
            </p>
          </div>
          <span className={`sg-setup-state ${isReady ? "ready" : "attention"}`}>
            {isReady ? <Check weight="bold" /> : <WarningCircle weight="bold" />}
            {isReady ? "Ready" : "Setup required"}
          </span>
        </header>

        <div className="sg-setup-layout">
          <section className="sg-setup-main" aria-labelledby="pi-readiness-heading">
            <div className="sg-setup-section-heading">
              <h2 id="pi-readiness-heading">Readiness</h2>
              <p>These are the exact runtime choices Server Guy will pass to Pi.</p>
            </div>

            <dl className="sg-readiness-list">
              <div>
                <dt>Runtime</dt>
                <dd>
                  <strong>{status.runtime.label}</strong>
                  <span>{status.runtime.detail}</span>
                </dd>
                <dd className={`sg-readiness-status ${status.state === "runtime-unavailable" ? "failed" : "passed"}`}>
                  {status.state === "runtime-unavailable" ? "Unavailable" : "Available"}
                </dd>
              </div>
              <div>
                <dt>Authentication</dt>
                <dd>
                  <strong>{status.authentication.label}</strong>
                  <span>Subscription access; no API key is requested.</span>
                </dd>
                <dd className={`sg-readiness-status ${status.authentication.configured && isReady ? "passed" : "pending"}`}>
                  {status.authentication.configured && isReady ? "Connected" : "Required"}
                </dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>
                  <strong>{status.selection.provider}</strong>
                  <code>{status.selection.providerId}</code>
                </dd>
                <dd className="sg-readiness-status fixed">Fixed</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>
                  <strong>{status.selection.model}</strong>
                  <code>{status.selection.modelId}</code>
                </dd>
                <dd className={`sg-readiness-status ${status.state === "model-unavailable" ? "failed" : "fixed"}`}>
                  {status.state === "model-unavailable" ? "Unavailable" : "Fixed"}
                </dd>
              </div>
              <div>
                <dt>Reasoning effort</dt>
                <dd>
                  <strong>{status.selection.reasoningEffort}</strong>
                  <span>Applied to every Phase 1 Pi session.</span>
                </dd>
                <dd className="sg-readiness-status fixed">Fixed</dd>
              </div>
            </dl>

            <div className="sg-credential-source">
              <strong>Credential source</strong>
              <code>{status.authentication.source}</code>
              <p>
                This is Pi’s own credential store. Server Guy does not read or copy Codex CLI
                credentials from <code>~/.codex/auth.json</code>.
              </p>
            </div>
          </section>

          <aside className="sg-connect-panel" aria-live="polite">
            {isReady && !isWorking ? (
              <>
                <span className="sg-connect-icon ready"><Check weight="bold" /></span>
                <h2>Pi is ready</h2>
                <p>New chat turns use ChatGPT OAuth through the bundled Pi runtime.</p>
                <Link className="sg-primary-button" href="/">Return to operator</Link>
                <button className="sg-link-button" onClick={startLogin} type="button">
                  Connect a different ChatGPT account
                </button>
              </>
            ) : attempt?.state === "awaiting-user" ? (
              <>
                <span className="sg-connect-icon"><ArrowSquareOut weight="bold" /></span>
                <h2>Enter this one-time code</h2>
                <p>Open OpenAI’s device page, enter the code, and approve access.</p>
                <button className="sg-device-code" onClick={copyCode} type="button">
                  <code>{attempt.userCode}</code>
                  <span>{copied ? <Check weight="bold" /> : <Copy />}{copied ? "Copied" : "Copy"}</span>
                </button>
                <a
                  className="sg-primary-button"
                  href={attempt.verificationUri ?? undefined}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open OpenAI <ArrowSquareOut />
                </a>
                <span className="sg-waiting-copy"><SpinnerGap className="spin" /> Waiting for approval…</span>
                <button className="sg-link-button danger" onClick={cancelLogin} type="button">
                  <X /> Cancel login
                </button>
              </>
            ) : isWorking ? (
              <>
                <span className="sg-connect-icon"><SpinnerGap className="spin" /></span>
                <h2>Starting secure login</h2>
                <p>{attempt?.message}</p>
                <button className="sg-link-button danger" onClick={cancelLogin} type="button">
                  <X /> Cancel login
                </button>
              </>
            ) : (
              <>
                <span className="sg-connect-icon"><WarningCircle weight="bold" /></span>
                <h2>{attempt?.state === "cancelled" ? "Login cancelled" : "ChatGPT connection required"}</h2>
                <p>
                  {attempt?.state === "failed"
                    ? attempt.message
                    : "Server Guy will request a one-time device code. Your password never enters this app."}
                </p>
                <button
                  className="sg-primary-button"
                  disabled={status.state === "runtime-unavailable" || status.state === "model-unavailable"}
                  onClick={startLogin}
                  type="button"
                >
                  Connect ChatGPT
                </button>
              </>
            )}

            {(status.issue || error) && (
              <div className="sg-setup-error" role="alert">
                <WarningCircle weight="bold" />
                <span>{error ?? status.issue}</span>
              </div>
            )}
          </aside>
        </div>

        <p className="sg-setup-footnote">
          Usage availability is checked when Pi answers a message. If the connected subscription
          reaches its current limit, Server Guy restores the draft and reports a retryable Pi error;
          it does not switch to API billing.
        </p>
      </section>
    </main>
  );
}
