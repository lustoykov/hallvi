"use client";

import { ArrowLeft, ArrowRight, ArrowSquareOut, Check, Copy, SpinnerGap, X } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { DetectedPiSetup } from "@/server/pi-configuration";
import type { PiLoginAttempt, PiSetupStatus } from "@/server/pi-setup";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import s from "./pi-setup-screen.module.css";

class SetupRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw new SetupRequestError(body?.error ?? "Could not reach Server Guy. Try again.", response.status);
  return body as T;
}
function active(attempt: PiLoginAttempt | null) {
  return attempt?.state === "starting" || attempt?.state === "awaiting-user";
}
function effortLabel(effort: string) {
  return effort === "xhigh" ? "Extra high" : effort.charAt(0).toUpperCase() + effort.slice(1);
}

export function PiSetupScreen({ initialStatus }: { initialStatus: PiSetupStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [detected, setDetected] = useState<DetectedPiSetup | null>(initialStatus.detected);
  const [choosing, setChoosing] = useState(!initialStatus.ready);
  const [attempt, setAttempt] = useState<PiLoginAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const [modelId, setModelId] = useState(initialStatus.selection.modelId);
  const [effort, setEffort] = useState(initialStatus.selection.reasoningEffort);
  const working = active(attempt);
  const models = [...status.models].sort((a, b) => Number(b.id === "gpt-5.6-sol") - Number(a.id === "gpt-5.6-sol"));
  const selectedModel = models.find((model) => model.id === modelId);
  const validSelection = selectedModel?.reasoningEfforts.includes(effort) ?? false;
  const hasChanges = modelId !== status.selection.modelId || effort !== status.selection.reasoningEffort;
  const connectionReady = status.ready && !choosing;
  const visibleError = error ?? (attempt?.state === "failed" ? attempt.message : null) ?? status.issue;

  function applyStatus(next: PiSetupStatus) {
    setStatus(next); setDetected(next.detected); setModelId(next.selection.modelId); setEffort(next.selection.reasoningEffort); setChoosing(!next.ready);
  }

  async function disconnect() {
    setSaving(true); setDisconnectError(null);
    try {
      applyStatus(await readJson<PiSetupStatus>(await fetch("/api/pi/setup", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "disconnect" }),
      })));
      setAttempt(null); setError(null); setPollError(null); setConfirmDisconnect(false);
      router.refresh();
    } catch (caught) {
      setDisconnectError(caught instanceof Error ? caught.message : "Could not disconnect. Try again.");
    } finally { setSaving(false); }
  }

  useEffect(() => {
    if (!active(attempt)) return;
    const current = attempt!;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const next = await readJson<PiLoginAttempt>(await fetch("/api/pi/setup/login/" + current.id, { cache: "no-store", signal: controller.signal }));
        // Reconcile saved setup before stopping polling; a failed status refresh is retryable too.
        const saved = next.state === "complete"
          ? await readJson<PiSetupStatus>(await fetch("/api/pi/setup", { cache: "no-store", signal: controller.signal }))
          : null;
        if (controller.signal.aborted) return;
        if (saved) applyStatus(saved);
        setPollError(null); setAttempt(next);
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (caught instanceof SetupRequestError && caught.status === 404) {
          setAttempt({ ...current, state: "failed", message: "This sign-in is no longer available. Start again." });
          setPollError(null);
        } else {
          setPollError("Can’t check sign-in right now. Retrying… You can still cancel.");
          setAttempt((latest) => latest?.id === current.id ? { ...latest } : latest);
        }
      }
    }, current.state === "starting" ? 700 : 1_500);
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [attempt]);

  async function changeConnection() {
    setSaving(true); setError(null); setAttempt(null); setPollError(null);
    try {
      const preview = await readJson<PiSetupStatus>(await fetch("/api/pi/setup?preview=1", { cache: "no-store" }));
      setDetected(preview.detected); setStatus((current) => ({ ...current, models: preview.models })); setChoosing(true);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not check for a saved login."); }
    finally { setSaving(false); }
  }
  async function reuse() {
    setSaving(true); setError(null); setAttempt(null);
    try {
      applyStatus(await readJson<PiSetupStatus>(await fetch("/api/pi/setup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "shared", candidateId: detected?.id }),
      })));
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not reuse this login. Check again."); }
    finally { setSaving(false); }
  }
  async function startLogin() {
    setSaving(true); setError(null); setPollError(null); setCopied(false);
    try {
      const next = await readJson<PiLoginAttempt>(await fetch("/api/pi/setup/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, reasoningEffort: effort }),
      }));
      setAttempt(next); setModelId(next.selection.modelId); setEffort(next.selection.reasoningEffort);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start sign-in."); }
    finally { setSaving(false); }
  }
  async function cancelLogin() {
    if (!attempt) return;
    setSaving(true);
    try {
      const next = await readJson<PiLoginAttempt>(await fetch("/api/pi/setup/login/" + attempt.id, { method: "DELETE" }));
      const saved = next.state === "complete" ? await readJson<PiSetupStatus>(await fetch("/api/pi/setup", { cache: "no-store" })) : null;
      setAttempt(next); setError(null); setPollError(null);
      if (saved) applyStatus(saved);
      else setChoosing(!status.ready);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not cancel sign-in. Try again."); }
    finally { setSaving(false); }
  }
  async function viewApplications() {
    setSaving(true); setError(null);
    try {
      if (hasChanges) applyStatus(await readJson<PiSetupStatus>(await fetch("/api/pi/setup", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, reasoningEffort: effort }),
      })));
      router.push("/applications"); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save model preferences."); }
    finally { setSaving(false); }
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(attempt?.userCode ?? ""); setCopied(true); }
    catch { setError("Could not copy. Select the code and copy it manually."); }
  }

  return <main className={"sg-setup-shell " + s.root}>
    <header className="sg-setup-topbar">
      <Link className="sg-setup-brand" href="/"><span className="sg-app-mark">SG</span><span>Server Guy</span></Link>
      <Link className="sg-setup-back" href="/applications"><ArrowLeft /> All applications</Link>
    </header>
    <div className={s.page}>
      <header className={s.heading}><h1>Settings</h1><p>ChatGPT account and model preferences.</p></header>
      <section className={s.card} aria-label="ChatGPT and model settings">
        <section className={s.section} aria-labelledby="account-heading">
          <h2 id="account-heading"><span className={s.step}>{connectionReady && !working ? <Check /> : "1"}</span>ChatGPT account</h2>
          <div aria-live="polite">
            {working ? <div className={s.device}>
              {attempt?.state === "awaiting-user" ? <>
                <p>Enter this code on OpenAI’s website.</p>
                <div className={s.codeRow}><code>{attempt.userCode}</code><button className={s.textButton} type="button" onClick={copyCode}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy code"}</button></div>
                <a className={s.primary} href={attempt.verificationUri ?? undefined} target="_blank" rel="noreferrer">Open OpenAI &amp; enter code <ArrowSquareOut /></a>
                {attempt.expiresAt && <p className={s.hint}>Code expires at {new Date(attempt.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p>}
                <p className={s.hint}><SpinnerGap className="spin" /> Waiting for approval…</p>
              </> : <p><SpinnerGap className="spin" /> Starting sign-in…</p>}
              <button className={s.textButton} type="button" disabled={saving} onClick={cancelLogin}>Cancel sign-in</button>
            </div> : connectionReady ? <div className={s.accountRow}>
              <div><strong className={s.success}><Check /> Login saved</strong><p>{status.mode === "shared" ? "Using the saved Pi login" : "Separate login for Server Guy"}</p></div>
              <button className={s.textButton} type="button" disabled={saving} onClick={changeConnection}>Change</button>
            </div> : <div className={s.actions}>
              {detected?.canReuse && <>
                <div className={s.savedLogin}><Check /><div><strong>Existing ChatGPT login found</strong><p>In Pi on this machine · {models.find((model) => model.id === detected.selection.modelId)?.name ?? detected.selection.modelId} / {effortLabel(detected.selection.reasoningEffort)}</p></div></div>
                <p className={s.hint}>Reuse its login file and model settings.</p>
                <button className={s.primary} type="button" disabled={saving} onClick={reuse}>Use existing login</button>
              </>}
              {detected && !detected.canReuse && <p className={s.hint}>No reusable ChatGPT login found.</p>}
              <button className={detected?.canReuse ? s.textButton : s.primary} type="button" disabled={saving || !validSelection} onClick={startLogin}>
                {saving ? "Connecting…" : detected?.canReuse ? "Connect another account" : "Connect ChatGPT"}<ArrowRight />
              </button>
              {status.ready && <button className={s.textButton} type="button" disabled={saving} onClick={() => { setChoosing(false); setAttempt(null); setError(null); }}>Keep current login</button>}
            </div>}
            {attempt?.state === "cancelled" && <p className={s.hint}>{attempt.message}</p>}
            {attempt?.state === "complete" && <p className={s.hint}>{attempt.message}</p>}
            {pollError && <p className={s.error} role="status">{pollError}</p>}
            {visibleError && <p className={s.error} role="alert">{visibleError}</p>}
          </div>
          <div className={s.privacy}>
            <button className={s.textButton} type="button" popoverTarget="connection-help">Storage &amp; privacy</button>
            {status.hasSavedConfiguration && <button className={`${s.textButton} ${s.disconnect}`} type="button" disabled={saving || working} onClick={() => { setDisconnectError(null); setConfirmDisconnect(true); }}>Disconnect</button>}
          </div>
        </section>
        <section className={s.section} aria-labelledby="model-heading">
          <h2 id="model-heading"><span className={s.step}>2</span>Model preferences</h2>
          <div className={s.fields}>
            <label htmlFor="pi-model">Model<select id="pi-model" value={modelId} disabled={saving || working || !models.length} onChange={(event) => {
              const next = models.find((model) => model.id === event.target.value);
              if (!next) return;
              setModelId(next.id);
              if (!next.reasoningEfforts.includes(effort)) setEffort(next.reasoningEfforts.includes("high") ? "high" : next.reasoningEfforts[0]);
            }}>
              {!selectedModel && <option value={modelId} disabled>{modelId} — unavailable</option>}
              {models.map((model) => <option key={model.id} value={model.id}>{model.name}{model.id === "gpt-5.6-sol" ? " · Default" : ""}</option>)}
            </select></label>
            <label htmlFor="pi-effort">Reasoning effort<select id="pi-effort" value={effort} disabled={saving || working || !selectedModel} onChange={(event) => {
              const next = selectedModel?.reasoningEfforts.find((level) => level === event.target.value);
              if (next) setEffort(next);
            }}>
              {!validSelection && <option value={effort} disabled>{effortLabel(effort)} — unavailable</option>}
              {selectedModel?.reasoningEfforts.map((level) => <option key={level} value={level}>{effortLabel(level)}{level === "high" ? " · Default" : ""}</option>)}
            </select></label>
            <p className={s.hint}>Higher effort allows more reasoning, usually with a longer wait.</p>
          </div>
        </section>
        <footer className={s.footer}>
          <span className={s.hint}>{working ? "Finish sign-in to continue." : !connectionReady ? "Connect your account to start." : hasChanges ? "Your model preferences will be saved." : "Access is checked when you send a message."}</span>
          <button className={s.primary} type="button" disabled={!connectionReady || working || saving || !validSelection} onClick={viewApplications}>{saving ? "Saving…" : "View applications"}<ArrowRight /></button>
        </footer>
      </section>
    </div>
    <aside popover="auto" id="connection-help" className={s.help} aria-labelledby="connection-help-title">
      <header><h2 id="connection-help-title">Storage &amp; privacy</h2><button className={s.close} type="button" popoverTarget="connection-help" popoverTargetAction="hide" aria-label="Close connection help"><X /></button></header>
      <h3>How your login is protected</h3><p>Pi saves OAuth tokens, not your password, in a local file. New files are readable and writable only by the operating-system user running Server Guy (0600). Existing files keep their permissions.</p>
      <p>The tokens are not encrypted by Pi or Server Guy or stored in an OS keychain. Other software running as that same user can read them. This prototype relies on file permissions, not encrypted credential storage.</p>
      <dl><div><dt>Server Guy</dt><dd>Your app, chats, and saved decisions.</dd></div><div><dt>Pi</dt><dd>The included agent runtime. Calls the model; nothing to install.</dd></div><div><dt>ChatGPT</dt><dd>Your OpenAI account and subscription provide model access.</dd></div></dl>
      <h3>Login files</h3><p>Stored on the machine running Server Guy—not necessarily this browser’s computer.</p>
      {status.hasSavedConfiguration && <><strong>Current login file</strong><code>{status.authentication.source}</code></>}
      {attempt && <><strong>New login file</strong><code>{attempt.authPath}</code></>}
      {!attempt && <><strong>New, separate login</strong><code>{status.separateAuthPath.replace(/[^/]+$/, "pi-auth-<login-id>.json")}</code></>}
      {detected && <><strong>Pi login checked</strong><code>{detected.authPath}</code>{detected.issue && <p>{detected.issue}</p>}</>}
      <p>Reuse shares Pi’s login file and copies its model preferences. Later model changes apply only to Server Guy. A new login uses its own file and replaces your current connection only after it succeeds.</p>
      <p>Previously accepted login files are retained for running turns; signing in again does not delete them. A separate login can use the same or a different ChatGPT account.</p>
      <h3>Disconnecting</h3><p>Disconnect removes Server Guy’s saved connection choice and model preferences. New messages require setup again. Credential files remain on disk, and messages already running may finish. It does not revoke OAuth tokens or sign you out of ChatGPT or Pi.</p>
      <h3>What leaves this machine?</h3><p>Sign-in goes to OpenAI. Chat messages and relevant context go to its model. Your subscription limits apply; there’s no automatic switch to API billing.</p>
      <p>Detection is read-only. A saved login is not proof of provider access; that is checked when you send a message. Pi tools, extensions, and Codex CLI credentials are not imported.</p>
    </aside>
    {confirmDisconnect && <ConfirmActionDialog
      title="Disconnect ChatGPT?"
      description="Stops new messages across all applications and clears Server Guy’s connection preferences. Chats and credential files stay intact. This does not sign you out of ChatGPT or Pi."
      action="Disconnect"
      busy={saving}
      error={disconnectError}
      onCancel={() => setConfirmDisconnect(false)}
      onConfirm={() => void disconnect()}
    />}
  </main>;
}
