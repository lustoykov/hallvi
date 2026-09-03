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
  const [saving, setSaving] = useState(false);
  const [acknowledgeApiBilling, setAcknowledgeApiBilling] = useState(false);

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/pi/setup", { cache: "no-store" });
    setStatus(await readJson<PiSetupStatus>(response));
  }, []);

  useEffect(() => {
    if (!attempt || !activeAttempt(attempt)) return;
    const currentAttempt = attempt;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/pi/setup/login/${currentAttempt.id}`, { cache: "no-store", signal: controller.signal });
        const next = await readJson<PiLoginAttempt>(response);
        if (controller.signal.aborted) return;
        setAttempt(next);
        if (next.state === "complete") await refreshStatus();
      } catch (caught) {
        if (controller.signal.aborted) return;
        const message = caught instanceof Error ? caught.message : "Could not check the login attempt.";
        setError(message);
        setAttempt((current) =>
          current ? { ...current, state: "failed", message } : current,
        );
      }
    }, currentAttempt.state === "starting" ? 700 : 1_500);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [attempt, refreshStatus]);

  async function previewSetup() {
    setError(null);
    setAcknowledgeApiBilling(false);
    setAttempt(null);
    setSaving(true);
    try {
      setStatus(await readJson<PiSetupStatus>(await fetch("/api/pi/setup?preview=1", { cache: "no-store" })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not inspect Pi setup.");
    } finally { setSaving(false); }
  }

  async function chooseSetup(mode: "shared" | "separate") {
    setError(null);
    setSaving(true);
    setAttempt(null);
    try {
      const body = mode === "separate" ? { mode } : { mode, candidateId: status.detected?.id, acknowledgeApiBilling };
      setStatus(await readJson<PiSetupStatus>(await fetch("/api/pi/setup", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save Pi setup.");
    } finally { setSaving(false); }
  }

  async function startLogin() {
    setError(null);
    setCopied(false);
    setSaving(true);
    try {
      const response = await fetch("/api/pi/setup/login", { method: "POST" });
      setAttempt(await readJson<PiLoginAttempt>(response));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start ChatGPT login.");
    } finally { setSaving(false); }
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
    try {
      await navigator.clipboard.writeText(attempt.userCode);
      setCopied(true);
    } catch { setError("Could not copy the code. Select it and copy it manually."); }
  }

  const isReady = status.ready;
  const isWorking = activeAttempt(attempt);
  const needsChoice = status.state === "needs-choice";
  const selectionLabel = needsChoice ? "Preview" : status.mode === "shared" ? "Adopted" : "Default";

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
            <h1>Set up Pi for Server Guy</h1>
            <p>
              Reuse an existing Pi setup, or connect ChatGPT separately with Sol and high reasoning.
              Server Guy bundles Pi; no separate installation is needed.
            </p>
          </div>
          <span className={`sg-setup-state ${isReady ? "ready" : "attention"}`}>
            {isReady ? <Check weight="bold" /> : <WarningCircle weight="bold" />}
            {isReady ? "Ready" : needsChoice && status.hasSavedConfiguration ? "Review setup" : "Setup required"}
          </span>
        </header>

        <div className="sg-setup-layout">
          <section className="sg-setup-main" aria-labelledby="pi-readiness-heading">
            <div className="sg-setup-section-heading">
              <h2 id="pi-readiness-heading">{needsChoice ? "Existing Pi setup preview" : "Server Guy’s Pi setup"}</h2>
              <p>{needsChoice
                ? status.hasSavedConfiguration ? "Read-only preview. Your saved setup stays active until you choose a replacement." : "Read-only detection. Nothing has been adopted or sent to a provider."
                : "These saved choices are passed explicitly to every Pi turn."}</p>
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
                  <span>{status.billing === "api" ? "API usage is billed by this provider." : "Subscription access, subject to account limits."}</span>
                </dd>
                <dd className={`sg-readiness-status ${status.authentication.configured && isReady ? "passed" : "pending"}`}>
                  {status.authentication.configured ? "Found" : "Required"}
                </dd>
              </div>
              <div>
                <dt>Provider</dt>
                <dd>
                  <strong>{status.selection.provider}</strong>
                  <code>{status.selection.providerId}</code>
                </dd>
                <dd className="sg-readiness-status fixed">{selectionLabel}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd>
                  <strong>{status.selection.model}</strong>
                  <code>{status.selection.modelId}</code>
                </dd>
                <dd className={`sg-readiness-status ${status.state === "model-unavailable" ? "failed" : "fixed"}`}>
                  {status.state === "model-unavailable" ? "Unavailable" : selectionLabel}
                </dd>
              </div>
              <div>
                <dt>Reasoning effort</dt>
                <dd>
                  <strong>{status.selection.reasoningEffort}</strong>
                  <span>Applied to every Phase 1 Pi session.</span>
                </dd>
                <dd className="sg-readiness-status fixed">{selectionLabel}</dd>
              </div>
            </dl>

            <div className="sg-credential-source">
              <strong>Credential source</strong>
              <code>{status.authentication.source}</code>
              <p>
                {status.mode === "separate"
                  ? "Separate Server Guy store. Your machine’s Pi settings and credentials are untouched."
                  : "Shared Pi store. Reusing it allows Pi to refresh shared OAuth tokens; Server Guy never overwrites your global model preferences."}
              </p>
              {status.detected && <><strong className="sg-settings-source-label">Settings inspected</strong><code>{status.detected.settingsPath}</code>
                {status.detected.usesDefaultModel && <p>No saved model selection was found. The preview uses Server Guy’s default: OpenAI Codex, Sol, high (unless Pi saved a different effort).</p>}</>}
              <p>Only provider, model, and effort are adopted. Tools, extensions, instructions, and Codex CLI credentials are not imported.</p>
            </div>
          </section>

          <aside className="sg-connect-panel" aria-live="polite">
            {needsChoice ? (
              <>
                <span className="sg-connect-icon"><WarningCircle weight="bold" /></span>
                <h2>{status.detected?.canReuse ? "Use this Pi setup?" : "Configure Pi separately"}</h2>
                <p>{status.detected?.canReuse
                  ? "Save these model preferences for Server Guy and reuse the shared credential file. Future changes to Pi’s model settings won’t change this choice."
                  : status.detected?.issue ?? "No reusable Pi setup was found."}</p>
                {status.detected?.canReuse && status.billing === "api" && (
                  <label className="sg-billing-consent">
                    <input type="checkbox" checked={acknowledgeApiBilling} onChange={(event) => setAcknowledgeApiBilling(event.target.checked)} />
                    <span>I understand this setup uses paid API access, not my ChatGPT subscription.</span>
                  </label>
                )}
                {status.detected?.canReuse && <button className="sg-primary-button" type="button"
                  disabled={saving || (status.billing === "api" && !acknowledgeApiBilling)} onClick={() => chooseSetup("shared")}>
                  {saving ? "Saving…" : "Use existing setup"}
                </button>}
                <button className={status.detected?.canReuse ? "sg-secondary-setup-button" : "sg-primary-button"} type="button" disabled={saving} onClick={() => chooseSetup("separate")}>
                  Configure separately
                </button>
                <p className="sg-separate-copy">{status.hasSavedConfiguration ? "This replaces your saved choice. Chat will need a separate ChatGPT login. " : ""}Separate setup uses OpenAI Codex / Sol / high, with its own credential file.</p>
                <button className="sg-link-button" type="button" disabled={saving} onClick={previewSetup}>Refresh preview</button>
                {status.hasSavedConfiguration && <button className="sg-link-button" type="button" disabled={saving} onClick={() => { setError(null); void refreshStatus().catch(() => setError("Could not reload the saved setup.")); }}>Keep saved setup</button>}
              </>
            ) : isReady && !isWorking ? (
              <>
                <span className="sg-connect-icon ready"><Check weight="bold" /></span>
                <h2>Pi is ready</h2>
                <p>Model preferences are saved and a credential is present. Provider access and usage limits are checked when you send a message.</p>
                <Link className="sg-primary-button" href="/">Return to operator</Link>
                {status.mode === "separate" && <button className="sg-link-button" disabled={saving} onClick={startLogin} type="button">
                  Connect a different ChatGPT account
                </button>}
                <button className="sg-link-button" disabled={saving} onClick={previewSetup} type="button">Change setup</button>
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
                <h2>{attempt?.state === "cancelled" ? "Login cancelled" : status.mode === "separate" ? "ChatGPT connection required" : "Pi setup needs attention"}</h2>
                <p>
                  {attempt?.state === "failed"
                    ? attempt.message
                    : status.mode === "separate" ? "Server Guy will request a one-time device code. Your password never enters this app. Login writes only to Server Guy’s separate credential file."
                    : "Reconnect through Pi to repair shared credentials, or choose a separate Server Guy setup."}
                </p>
                <button
                  className="sg-primary-button"
                  disabled={saving || status.state === "model-unavailable"}
                  onClick={status.mode === "separate" ? startLogin : previewSetup}
                  type="button"
                >
                  {status.mode === "separate" ? "Connect ChatGPT" : "Choose setup"}
                </button>
                {status.mode === "separate" && <button className="sg-link-button" disabled={saving} onClick={previewSetup} type="button">Change setup</button>}
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
          Detection never contacts a provider or refreshes credentials. A failed chat turn restores
          your draft and reports the error; Server Guy never automatically switches providers or billing methods.
        </p>
      </section>
    </main>
  );
}
