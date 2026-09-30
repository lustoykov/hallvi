"use client";

import {
  ArrowSquareOut,
  Check,
  Copy,
  SpinnerGap,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { DetectedPiSetup } from "@/server/pi-configuration";
import type { PiLoginAttempt, PiSetupStatus } from "@/server/pi-setup";
import { ConfirmActionDialog } from "./confirm-action-dialog";
import type { SetupReturn } from "@/server/setup-return";
import {
  OPENROUTER_MODEL_ID,
  OPENROUTER_PROVIDER_ID,
  PI_MODEL_ID,
  PI_PROVIDER_ID,
} from "@/server/pi-settings";
import type { PiModelOption } from "@/server/pi-models";
import { OpenRouterConnect } from "./onboarding/openrouter-connect";
import { RequestCard } from "./onboarding/pieces";
import { SettingsShell, useToast } from "./settings-shell";
import s from "./settings.module.css";
import h from "./pi-setup-screen.module.css";

class SetupRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok || !body)
    throw new SetupRequestError(
      body?.error ?? "Could not reach Hallvi. Try again.",
      response.status,
    );
  return body as T;
}
function active(attempt: PiLoginAttempt | null) {
  return attempt?.state === "starting" || attempt?.state === "awaiting-user";
}
function effortLabel(effort: string) {
  return effort === "xhigh"
    ? "Extra high"
    : effort.charAt(0).toUpperCase() + effort.slice(1);
}
const isDefault = (model: PiModelOption) =>
  model.id ===
  (model.providerId === PI_PROVIDER_ID ? PI_MODEL_ID : OPENROUTER_MODEL_ID);
const dollars = (value: number) =>
  `$${Number.isInteger(value) ? value : value.toFixed(2)}`;
const price = (model: PiModelOption) =>
  model.price
    ? `${dollars(model.price.input)} / ${dollars(model.price.output)}`
    : "In plan";
/** The generation a ChatGPT model belongs to: "gpt-6-sol" → "6". */
const generation = (id: string) => /^gpt-(\d+)/.exec(id)?.[1] ?? "";

/** One line on what a model is for; the catalog has only names. */
const NOTES: Record<string, string> = {
  "gpt-6-sol": "The everyday choice. Strong at code and servers.",
  "gpt-6-astra": "Most capable. Slower; uses more of your plan.",
  "gpt-6-luna": "Fastest and lightest on your plan.",
  "anthropic/claude-sonnet-5": "Careful and thorough. A great default.",
  "anthropic/claude-opus-5.5": "Anthropic’s strongest, for hard problems.",
  "openai/gpt-6-sol": "ChatGPT’s model, without a plan.",
  "google/gemini-3.1-pro-preview":
    "Huge context. Good at reading big repositories.",
  "qwen/qwen3.8-max-0902": "Frontier quality at a third of the price.",
  "z-ai/glm-5.3": "Capable and very cheap.",
  "deepseek/deepseek-v4-pro-0813": "The cheapest strong option.",
};

const ACCOUNTS = {
  chatgpt: {
    name: "ChatGPT",
    mark: "C",
    billing: "Included in your ChatGPT plan",
  },
  openrouter: {
    name: "OpenRouter",
    mark: "O",
    billing: "Pay per use from OpenRouter credit",
  },
} as const;

function Mark({
  account,
  size = 28,
}: {
  account: keyof typeof ACCOUNTS;
  size?: number;
}) {
  return (
    <span
      className={h.mark}
      data-account={account}
      style={{ width: size, height: size, fontSize: size * 0.46 }}
      aria-hidden="true"
    >
      {ACCOUNTS[account].mark}
    </span>
  );
}

export function PiSetupScreen({
  initialStatus,
  returnTo,
}: {
  initialStatus: PiSetupStatus;
  /**
   * The conversation the reader came from, already checked against the
   * records by the page; the top bar's way out leads back to it.
   */
  returnTo?: SetupReturn;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [detected, setDetected] = useState<DetectedPiSetup | null>(
    initialStatus.detected,
  );
  // ChatGPT's own choice between reusing a login and signing in, open while it
  // is not connected or while the owner is changing it.
  const [choosing, setChoosing] = useState(!initialStatus.connections.chatgpt);
  const [attempt, setAttempt] = useState<PiLoginAttempt | null>(null);
  const [openRouterOpen, setOpenRouterOpen] = useState(false);
  const [older, setOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pathCopy, setPathCopy] = useState<{
    path: string;
    result: "copied" | "failed";
  } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState<
    "chatgpt" | "openrouter" | null
  >(null);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const { show, toast } = useToast();
  const working = active(attempt);
  const { chatgpt, openRouter } = status.connections;
  const selection = status.selection;
  const selected = status.models.find(
    (model) =>
      model.providerId === selection.providerId &&
      model.id === selection.modelId,
  );
  const chatgptModels = status.models
    .filter((model) => model.providerId === PI_PROVIDER_ID)
    .sort((a, b) => Number(isDefault(b)) - Number(isDefault(a)));
  const featured = chatgptModels.filter(
    (model) => generation(model.id) === generation(PI_MODEL_ID),
  );
  const openRouterModels = status.models.filter(
    (model) => model.providerId === OPENROUTER_PROVIDER_ID,
  );
  const visibleError =
    error ?? (attempt?.state === "failed" ? attempt.message : null);

  function applyStatus(next: PiSetupStatus) {
    setStatus(next);
    setDetected(next.detected);
    setChoosing(!next.connections.chatgpt);
  }
  async function reload() {
    applyStatus(
      await readJson<PiSetupStatus>(
        await fetch("/api/pi/setup", { cache: "no-store" }),
      ),
    );
    setOpenRouterOpen(false);
    router.refresh();
  }

  async function disconnect() {
    setSaving(true);
    setDisconnectError(null);
    try {
      applyStatus(
        await readJson<PiSetupStatus>(
          await fetch(
            confirmDisconnect === "openrouter"
              ? "/api/pi/setup/openrouter"
              : "/api/pi/setup",
            {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ confirm: "disconnect" }),
            },
          ),
        ),
      );
      show(
        `${confirmDisconnect === "openrouter" ? "OpenRouter" : "ChatGPT"} disconnected`,
      );
      setAttempt(null);
      setError(null);
      setPollError(null);
      setConfirmDisconnect(null);
      router.refresh();
    } catch (caught) {
      setDisconnectError(
        caught instanceof Error
          ? caught.message
          : "Could not disconnect. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!active(attempt)) return;
    const current = attempt!;
    const controller = new AbortController();
    const timeout = window.setTimeout(
      async () => {
        try {
          const next = await readJson<PiLoginAttempt>(
            await fetch("/api/pi/setup/login/" + current.id, {
              cache: "no-store",
              signal: controller.signal,
            }),
          );
          // Reconcile saved setup before stopping polling; a failed status
          // refresh is retryable too.
          const saved =
            next.state === "complete"
              ? await readJson<PiSetupStatus>(
                  await fetch("/api/pi/setup", {
                    cache: "no-store",
                    signal: controller.signal,
                  }),
                )
              : null;
          if (controller.signal.aborted) return;
          if (saved) {
            applyStatus(saved);
            show("ChatGPT connected");
            router.refresh();
          }
          setPollError(null);
          setAttempt(next);
        } catch (caught) {
          if (controller.signal.aborted) return;
          if (caught instanceof SetupRequestError && caught.status === 404) {
            setAttempt({
              ...current,
              state: "failed",
              message: "This sign-in is no longer available. Start again.",
            });
            setPollError(null);
          } else {
            setPollError(
              "Can’t check sign-in right now. Retrying… You can still cancel.",
            );
            setAttempt((latest) =>
              latest?.id === current.id ? { ...latest } : latest,
            );
          }
        }
      },
      current.state === "starting" ? 700 : 1_500,
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
    // `show` and `router` are stable enough for a poll that restarts on each
    // attempt change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  async function changeConnection() {
    setSaving(true);
    setError(null);
    setAttempt(null);
    setPollError(null);
    try {
      const preview = await readJson<PiSetupStatus>(
        await fetch("/api/pi/setup?preview=1", { cache: "no-store" }),
      );
      setDetected(preview.detected);
      setChoosing(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not check for a saved login.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function reuse() {
    setSaving(true);
    setError(null);
    setAttempt(null);
    try {
      applyStatus(
        await readJson<PiSetupStatus>(
          await fetch("/api/pi/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode: "shared", candidateId: detected?.id }),
          }),
        ),
      );
      show("Using the ChatGPT login from Pi");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not reuse this login. Check again.",
      );
    } finally {
      setSaving(false);
    }
  }
  /** Sign in to ChatGPT, starting on `model` when one was picked. */
  async function startLogin(model?: PiModelOption) {
    setSaving(true);
    setError(null);
    setPollError(null);
    setCopied(false);
    const chosen =
      model ??
      (selection.providerId === PI_PROVIDER_ID ? selected : undefined) ??
      chatgptModels[0];
    try {
      setAttempt(
        await readJson<PiLoginAttempt>(
          await fetch("/api/pi/setup/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              providerId: PI_PROVIDER_ID,
              modelId: chosen?.id ?? PI_MODEL_ID,
              reasoningEffort: chosen?.reasoningEfforts.includes(
                selection.reasoningEffort,
              )
                ? selection.reasoningEffort
                : "high",
            }),
          }),
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not start sign-in.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function cancelLogin() {
    if (!attempt) return;
    setSaving(true);
    try {
      const next = await readJson<PiLoginAttempt>(
        await fetch("/api/pi/setup/login/" + attempt.id, { method: "DELETE" }),
      );
      const saved =
        next.state === "complete"
          ? await readJson<PiSetupStatus>(
              await fetch("/api/pi/setup", { cache: "no-store" }),
            )
          : null;
      setAttempt(next);
      setError(null);
      setPollError(null);
      if (saved) applyStatus(saved);
      else setChoosing(!status.connections.chatgpt);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not cancel sign-in. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  /** A model or an effort applies when it is picked, like Claude's menu. */
  async function save(model: PiModelOption, effort?: string) {
    const reasoningEffort =
      effort ??
      (model.reasoningEfforts.includes(selection.reasoningEffort)
        ? selection.reasoningEffort
        : model.reasoningEfforts.includes("high")
          ? "high"
          : model.reasoningEfforts[0]);
    setSaving(true);
    setError(null);
    try {
      applyStatus(
        await readJson<PiSetupStatus>(
          await fetch("/api/pi/setup", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              providerId: model.providerId,
              modelId: model.id,
              reasoningEffort,
            }),
          }),
        ),
      );
      show(
        effort
          ? `Saved · ${effortLabel(effort)} effort`
          : `Saved · the next message uses ${model.name}`,
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save the model. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(attempt?.userCode ?? "");
      setCopied(true);
    } catch {
      setError("Could not copy. Select the code and copy it manually.");
    }
  }

  const row = (
    model: PiModelOption,
    connected: boolean,
    onPick: () => void,
  ) => {
    // Only a usable choice wears the check: a saved preference for an
    // account that is not connected says nothing about what runs.
    const on =
      connected &&
      model.providerId === selection.providerId &&
      model.id === selection.modelId;
    return (
      <li key={`${model.providerId} ${model.id}`}>
        <button
          type="button"
          className={`${s.row} ${s.pick}`}
          aria-pressed={on}
          disabled={saving || working}
          onClick={onPick}
        >
          <span className={s.check}>{on && <Check weight="bold" />}</span>
          <span className={s.rowText}>
            <strong>
              {model.name}
              {isDefault(model) && (
                <span className={h.defaultTag}> Default</span>
              )}
            </strong>
            {NOTES[model.id] && <small>{NOTES[model.id]}</small>}
          </span>
          <span className={s.price}>
            {connected ? price(model) : "Connect"}
          </span>
        </button>
      </li>
    );
  };

  return (
    <SettingsShell
      current="pi"
      title="Model"
      lead="What Hallvi thinks with, and who pays for it."
      returnTo={returnTo}
    >
      <section className={s.hero} aria-label="Current model">
        {status.ready && selected ? (
          <>
            <div>
              <span className={s.eyebrow}>Thinking with</span>
              <h3>{selected.name}</h3>
              <p className={s.heroMeta}>
                <Mark
                  account={
                    selected.providerId === OPENROUTER_PROVIDER_ID
                      ? "openrouter"
                      : "chatgpt"
                  }
                  size={18}
                />
                {selected.price
                  ? `OpenRouter · ${price(selected)} per million tokens`
                  : "ChatGPT · included in your plan"}
              </p>
              <p className={h.checkedNote}>
                Access is checked when you send a message.
              </p>
            </div>
            <div
              className={s.seg}
              role="radiogroup"
              aria-label="Reasoning effort"
            >
              {selected.reasoningEfforts.map((level) => (
                <button
                  key={level}
                  type="button"
                  role="radio"
                  aria-checked={selection.reasoningEffort === level}
                  disabled={saving}
                  onClick={() =>
                    level !== selection.reasoningEffort &&
                    void save(selected, level)
                  }
                >
                  {level === "xhigh" ? "X-high" : effortLabel(level)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div>
            <span className={s.eyebrow}>No model yet</span>
            <h3>Pick what Hallvi thinks with</h3>
            <p>Use your ChatGPT plan, or pay per use through OpenRouter.</p>
            {status.issue && (
              <p className={s.problem} role="alert">
                <Warning aria-hidden="true" />
                {status.issue}
              </p>
            )}
          </div>
        )}
      </section>

      {/* ChatGPT: the subscription. */}
      <section aria-labelledby="chatgpt-heading">
        <header className={s.groupHead}>
          <Mark account="chatgpt" />
          <div>
            <strong id="chatgpt-heading">ChatGPT</strong>
            <span>{ACCOUNTS.chatgpt.billing}</span>
          </div>
          {chatgpt && !choosing && !working ? (
            <span className={s.rowSide}>
              <span className={s.ok}>
                <span className={s.dot} /> Login saved
              </span>
              <button
                type="button"
                className={s.link}
                disabled={saving}
                onClick={changeConnection}
              >
                Change
              </button>
              <button
                type="button"
                className={`${s.link} ${s.quiet}`}
                disabled={saving}
                onClick={() => {
                  setDisconnectError(null);
                  setConfirmDisconnect("chatgpt");
                }}
              >
                Disconnect
              </button>
            </span>
          ) : !working ? (
            <span className={s.rowSide}>
              {detected?.canReuse && (
                <button
                  type="button"
                  className={`${s.btn} ${status.ready ? "" : s.primary}`}
                  disabled={saving}
                  onClick={reuse}
                >
                  Use existing login
                </button>
              )}
              <button
                type="button"
                className={`${s.btn} ${status.ready || detected?.canReuse ? "" : s.primary}`}
                disabled={saving}
                onClick={() => void startLogin()}
              >
                {detected?.canReuse
                  ? "Connect another account"
                  : "Connect ChatGPT"}
              </button>
              {chatgpt && (
                <button
                  type="button"
                  className={s.link}
                  onClick={() => {
                    setChoosing(false);
                    setAttempt(null);
                    setError(null);
                  }}
                >
                  Keep current login
                </button>
              )}
            </span>
          ) : null}
        </header>
        {!chatgpt && !working && (
          <p className={s.fine}>
            {detected?.canReuse
              ? `A ChatGPT login was found in Pi on this machine · ${
                  chatgptModels.find((m) => m.id === detected.selection.modelId)
                    ?.name ?? detected.selection.modelId
                } / ${effortLabel(detected.selection.reasoningEffort)}. Using it shares Pi’s login file.`
              : "No reusable ChatGPT login found. Sign in with a short code on ChatGPT’s page."}
          </p>
        )}
        {chatgpt && !choosing && (
          <p className={s.fine}>
            {status.mode === "shared"
              ? "Sharing the existing Pi login file. ChatGPT checks it when you send a message."
              : "Separate login for Hallvi. ChatGPT checks it when you send a message."}
          </p>
        )}
        {working && (
          <div className={s.flow} aria-live="polite">
            {attempt?.state === "awaiting-user" ? (
              <>
                <p>Enter this code on OpenAI’s website, then approve.</p>
                <p className={s.code}>{attempt.userCode}</p>
                <div className={s.flowRow}>
                  <span>
                    <SpinnerGap className="spin" aria-hidden="true" /> Waiting
                    for approval…
                    {attempt.expiresAt &&
                      ` Code expires at ${new Date(
                        attempt.expiresAt,
                      ).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}.`}
                  </span>
                  <button type="button" className={s.link} onClick={copyCode}>
                    {copied ? <Check /> : <Copy />}{" "}
                    {copied ? "Copied" : "Copy code"}
                  </button>
                  <a
                    className={`${s.btn} ${s.primary}`}
                    href={attempt.verificationUri ?? undefined}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open OpenAI &amp; enter code <ArrowSquareOut />
                  </a>
                  <button
                    type="button"
                    className={`${s.link} ${s.quiet}`}
                    disabled={saving}
                    onClick={cancelLogin}
                  >
                    Cancel sign-in
                  </button>
                </div>
                <p className={s.muted}>
                  On another browser, open {attempt.verificationUri}.
                </p>
              </>
            ) : (
              <div className={s.flowRow}>
                <span>
                  <SpinnerGap className="spin" aria-hidden="true" /> Starting
                  sign-in…
                </span>
                <button
                  type="button"
                  className={`${s.link} ${s.quiet}`}
                  disabled={saving}
                  onClick={cancelLogin}
                >
                  Cancel sign-in
                </button>
              </div>
            )}
          </div>
        )}
        {(attempt?.state === "cancelled" || attempt?.state === "complete") && (
          <p className={s.fine}>{attempt.message}</p>
        )}
        {pollError && (
          <p className={s.error} role="status">
            {pollError}
          </p>
        )}
        {visibleError && (
          <p className={s.error} role="alert">
            {visibleError}
          </p>
        )}
        <ul className={`${s.rows} ${chatgpt ? "" : s.dim}`}>
          {(older ? chatgptModels : featured).map((model) =>
            row(model, chatgpt, () =>
              chatgpt ? void save(model) : void startLogin(model),
            ),
          )}
        </ul>
        {!older && chatgptModels.length > featured.length && (
          <button
            type="button"
            className={`${s.link} ${s.more}`}
            onClick={() => setOlder(true)}
          >
            {chatgptModels.length - featured.length} older models
          </button>
        )}
      </section>

      {/* OpenRouter: pay per use. */}
      <section aria-labelledby="openrouter-heading">
        <header className={s.groupHead}>
          <Mark account="openrouter" />
          <div>
            <strong id="openrouter-heading">OpenRouter</strong>
            <span>{ACCOUNTS.openrouter.billing}</span>
          </div>
          {openRouter ? (
            <span className={s.rowSide}>
              <span className={s.ok}>
                <span className={s.dot} /> Key saved
              </span>
              <button
                type="button"
                className={`${s.link} ${s.quiet}`}
                disabled={saving}
                onClick={() => {
                  setDisconnectError(null);
                  setConfirmDisconnect("openrouter");
                }}
              >
                Disconnect
              </button>
            </span>
          ) : (
            !openRouterOpen && (
              <button
                type="button"
                className={s.btn}
                onClick={() => setOpenRouterOpen(true)}
              >
                Connect OpenRouter
              </button>
            )
          )}
        </header>
        {!openRouter && openRouterOpen && (
          // An offer, not a request: the calm frame, not the amber one that
          // says someone is needed.
          <div className={h.openRouterCard}>
            <RequestCard
              plain
              state="done"
              asks="can use OpenRouter"
              label="Connect OpenRouter"
            >
              <OpenRouterConnect
                onSaved={async () => {
                  await reload();
                  show("OpenRouter connected · using Claude Sonnet 5");
                }}
                actions={
                  <button
                    type="button"
                    className="hv-ob-quiet"
                    onClick={() => setOpenRouterOpen(false)}
                  >
                    Not now
                  </button>
                }
              />
            </RequestCard>
          </div>
        )}
        <ul className={`${s.rows} ${openRouter ? "" : s.dim}`}>
          {openRouterModels.map((model) =>
            row(model, openRouter, () =>
              openRouter ? void save(model) : setOpenRouterOpen(true),
            ),
          )}
        </ul>
      </section>

      <p className={s.fine}>
        Hallvi never switches models by itself. Logins stay on this computer.{" "}
        <button
          className={s.link}
          type="button"
          popoverTarget="connection-help"
        >
          Storage &amp; privacy
        </button>
      </p>
      {toast}
      <aside
        popover="auto"
        id="connection-help"
        className={h.help}
        aria-labelledby="connection-help-title"
      >
        <header>
          <h2 id="connection-help-title">Storage &amp; privacy</h2>
          <button
            className={h.close}
            type="button"
            popoverTarget="connection-help"
            popoverTargetAction="hide"
            aria-label="Close connection help"
          >
            <X />
          </button>
        </header>
        {[
          {
            title: "Local diagnostic logs",
            path: status.diagnosticLogPath,
            description:
              "Individual reply and step events, saved as JSON lines.",
            label: "Copy log path",
          },
          {
            title: "Local traces",
            path: status.localTracePath,
            description:
              "Completed spans with timings and parent relationships, saved as OpenTelemetry JSON lines. Unfinished spans are not saved after a crash.",
            label: "Copy trace path",
          },
        ].map((file) => (
          <section key={file.path} aria-label={file.title}>
            <h3>{file.title}</h3>
            <p>{file.description}</p>
            <code>{file.path}</code>
            <button
              className={h.textButton}
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(file.path);
                  setPathCopy({ path: file.path, result: "copied" });
                } catch {
                  setPathCopy({ path: file.path, result: "failed" });
                }
              }}
            >
              {pathCopy?.path === file.path && pathCopy.result === "copied" ? (
                <Check />
              ) : (
                <Copy />
              )}
              {file.label}
            </button>
            <p role="status" hidden={pathCopy?.path !== file.path}>
              {pathCopy?.path === file.path
                ? pathCopy.result === "failed"
                  ? "Could not copy. Select the path and copy it manually."
                  : "Path copied."
                : null}
            </p>
          </section>
        ))}
        <p>
          Both files are stored on the machine running Hallvi and work without
          Langfuse. Prompts, answers and tool payloads are omitted. Each file
          rotates at 1 MiB and keeps three archives.
        </p>
        <h3>Optional trace export</h3>
        <p>
          {status.traceExport.mode === "off"
            ? "Off. Traces stay local."
            : status.traceExport.mode === "incomplete"
              ? "Not configured. Tracing is enabled, but no destination or Langfuse project keys are configured."
              : `Configured for ${status.traceExport.mode === "langfuse" ? "Langfuse" : "OTLP"}: ${status.traceExport.destination}`}
        </p>
        <p>
          This server’s configuration must also be used by the worker. Restart
          both after changing it. Configured does not confirm delivery. Export
          uses an in-memory batch; local files are not automatically resent.
        </p>
        <h3>How your login is protected</h3>
        <p>
          Pi saves OAuth tokens, not your password, in a local file. New files
          are readable and writable only by the operating-system user running
          Hallvi (0600). Existing files keep their permissions.
        </p>
        <p>
          The tokens are not encrypted by Pi or Hallvi or stored in an OS
          keychain. Other software running as that same user can read them. This
          prototype relies on file permissions, not encrypted credential
          storage.
        </p>
        <dl>
          <div>
            <dt>Hallvi</dt>
            <dd>Your app, chats, and saved decisions.</dd>
          </div>
          <div>
            <dt>Pi</dt>
            <dd>
              The included agent runtime. Calls the model; nothing to install.
            </dd>
          </div>
          <div>
            <dt>ChatGPT</dt>
            <dd>Your OpenAI account and subscription provide model access.</dd>
          </div>
          <div>
            <dt>OpenRouter</dt>
            <dd>
              Optional. Your OpenRouter credit pays for other models, per use.
            </dd>
          </div>
        </dl>
        <h3>Login files</h3>
        <p>
          Stored on the machine running Hallvi—not necessarily this browser’s
          computer.
        </p>
        {status.hasSavedConfiguration && (
          <>
            <strong>Current login file</strong>
            <code>{status.authentication.source}</code>
          </>
        )}
        {attempt && (
          <>
            <strong>New login file</strong>
            <code>{attempt.authPath}</code>
          </>
        )}
        {!attempt && (
          <>
            <strong>New, separate login</strong>
            <code>
              {status.separateAuthPath.replace(
                /[^/]+$/,
                "pi-auth-<login-id>.json",
              )}
            </code>
          </>
        )}
        <strong>OpenRouter key</strong>
        <code>{status.openRouterAuthPath}</code>
        {detected && (
          <>
            <strong>Pi login checked</strong>
            <code>{detected.authPath}</code>
            {detected.issue && <p>{detected.issue}</p>}
          </>
        )}
        <p>
          Reuse shares Pi’s login file and copies its model preferences. Later
          model changes apply only to Hallvi. A new login uses its own file and
          replaces your current connection only after it succeeds.
        </p>
        <p>
          Previously accepted login files are retained for running turns;
          signing in again does not delete them. A separate login can use the
          same or a different ChatGPT account.
        </p>
        <h3>Disconnecting</h3>
        <p>
          Disconnecting ChatGPT removes Hallvi’s saved connection choice.
          Credential files remain on disk, and messages already running may
          finish. It does not revoke OAuth tokens or sign you out of ChatGPT or
          Pi. Disconnecting OpenRouter deletes Hallvi’s saved copy of the key; a
          running turn keeps its key in memory until it ends. Revoke the key
          itself on openrouter.ai. Either way, the other account, when
          connected, takes over new messages.
        </p>
        <h3>What leaves this machine?</h3>
        <p>
          If optional Langfuse tracing is enabled by the operator, reply IDs,
          step timings, outcomes, model names and token counts are exported.
          Traces omit prompts, replies, tool arguments and credentials.
        </p>
        <p>
          Sign-in goes to OpenAI or OpenRouter. Chat messages and relevant
          context go to the chosen model: through OpenAI on your ChatGPT plan,
          whose limits apply, or through OpenRouter to the model’s maker, paid
          from your OpenRouter credit. Hallvi never switches between them by
          itself.
        </p>
        <p>
          Detection is read-only. A saved login is not proof of provider access;
          that is checked when you send a message. Pi tools, extensions, and
          Codex CLI credentials are not imported.
        </p>
      </aside>
      {confirmDisconnect && (
        <ConfirmActionDialog
          title={
            confirmDisconnect === "openrouter"
              ? "Disconnect OpenRouter?"
              : "Disconnect ChatGPT?"
          }
          description={
            (confirmDisconnect === "openrouter"
              ? "Deletes Hallvi’s copy of the key; revoke the key itself on openrouter.ai. "
              : "Clears Hallvi’s ChatGPT connection. Credential files stay intact, and this does not sign you out of ChatGPT or Pi. ") +
            ((confirmDisconnect === "openrouter" ? chatgpt : openRouter)
              ? `New messages use ${confirmDisconnect === "openrouter" ? "ChatGPT" : "OpenRouter"}. Chats stay intact.`
              : "Stops new messages across all applications. Chats stay intact.")
          }
          action="Disconnect"
          busy={saving}
          error={disconnectError}
          onCancel={() => setConfirmDisconnect(null)}
          onConfirm={() => void disconnect()}
        />
      )}
    </SettingsShell>
  );
}
