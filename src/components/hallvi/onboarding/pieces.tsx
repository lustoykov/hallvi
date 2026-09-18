"use client";

// The parts every onboarding card is made of: the turn frame it sits in, the
// guided steps, the check list, the copyable line and the one field a secret
// is pasted into. Nothing here knows a provider.

import {
  ArrowSquareOut,
  Check as CheckIcon,
  Circle,
  Copy,
  Info,
  SpinnerGap,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { Check, PermissionMode } from "./types";

import "./onboarding.css";

/** A request drawn as the turn in the conversation that it is. */
export function RequestCard({
  asks,
  state,
  label,
  children,
}: {
  /** Completes "Hallvi …": "needs a place to run it". */
  asks: string;
  state: "waiting" | "working" | "done" | "failed";
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="hv-ob" data-state={state} aria-label={label}>
      <div className="hv-ob-who">
        <span className="hv-ob-avatar" aria-hidden="true">
          H
        </span>
        <strong>Hallvi</strong>
        <span>{asks}</span>
      </div>
      <div className="hv-ob-body">{children}</div>
    </section>
  );
}

/** What the selected mode really does once the account is connected. */
export function ModeLine({
  mode,
  action,
}: {
  mode: PermissionMode;
  /** "rent the server", "change your DNS". */
  action: string;
}) {
  return (
    <p className="hv-ob-mode" data-mode={mode}>
      {mode === "bypass" ? (
        <Warning weight="bold" aria-hidden="true" />
      ) : (
        <Info weight="bold" aria-hidden="true" />
      )}
      <span>
        Connecting changes nothing by itself.{" "}
        {mode === "always-ask" ? (
          <>
            You are on <b>Always ask</b>: before Hallvi can {action}, the exact
            command waits for your approval.
          </>
        ) : mode === "pi-decides" ? (
          <>
            You are on <b>Pi decides</b>: Hallvi is instructed to ask before it
            can {action}, but in this mode asking is its judgment, not a lock.
            Choose Always ask for a guaranteed prompt.
          </>
        ) : (
          <>
            You are on <b>Bypass</b>: once connected, Hallvi will {action}{" "}
            without asking again.
          </>
        )}
      </span>
    </p>
  );
}

export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="hv-ob-checks" aria-live="polite">
      {checks.map((check) => (
        <li key={check.id} data-state={check.state}>
          <span className="hv-ob-check-mark" aria-hidden="true">
            {check.state === "passed" ? (
              <CheckIcon weight="bold" />
            ) : check.state === "failed" ? (
              <X weight="bold" />
            ) : check.state === "running" ? (
              <SpinnerGap weight="bold" className="spin" />
            ) : check.state === "noted" ? (
              <Info weight="bold" />
            ) : (
              <Circle />
            )}
          </span>
          <span>
            {check.label}
            {check.state === "unproven" && (
              <em className="hv-ob-unproven"> · not proven yet</em>
            )}
            {check.detail && <small>{check.detail}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Settles a check list one line at a time, so progress is legible. */
export function useStagedChecks() {
  const [checks, setChecks] = useState<Check[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return {
    checks,
    clear: () => setChecks([]),
    /** Shows `plan` pending, then settles lines in order up to the result. */
    async play(plan: Check[], settled: Check[]) {
      setChecks(plan.map((check) => ({ ...check, state: "pending" })));
      for (let index = 0; index < settled.length; index++) {
        if (!alive.current) return;
        setChecks((current) =>
          current.map((check, at) =>
            at === index ? { ...check, state: "running" } : check,
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 380));
        if (!alive.current) return;
        setChecks((current) =>
          current.map((check, at) => (at === index ? settled[index]! : check)),
        );
        if (settled[index]!.state === "failed") return;
      }
    },
  };
}

export function CopyLine({
  value,
  label,
  block = false,
}: {
  value: string;
  label: string;
  block?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="hv-ob-copy" data-block={block ? "" : undefined}>
      <code>{value}</code>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          } catch {
            /* Selection still works where the clipboard is refused. */
          }
        }}
      >
        {copied ? (
          <CheckIcon weight="bold" aria-hidden="true" />
        ) : (
          <Copy weight="bold" aria-hidden="true" />
        )}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function Away({ href, children }: { href: string; children: string }) {
  return (
    <a
      className="hv-ob-away"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
    >
      {children}
      <ArrowSquareOut weight="bold" aria-hidden="true" />
    </a>
  );
}

export interface GuideStep {
  title: string;
  body: ReactNode;
}

/**
 * Guided steps, one open at a time. Which step is open is the only thing
 * remembered between visits, and it is not a secret: a reader who left for
 * the provider's site and came back tomorrow lands on the step they were on.
 */
export function Guide({
  steps,
  at,
  onAt,
}: {
  steps: GuideStep[];
  at: number;
  onAt: (step: number) => void;
}) {
  return (
    <ol className="hv-ob-guide">
      {steps.map((step, index) => {
        const open = index === at;
        return (
          <li
            key={step.title}
            data-open={open ? "" : undefined}
            data-done={index < at ? "" : undefined}
          >
            <button
              type="button"
              className="hv-ob-guide-head"
              aria-expanded={open}
              onClick={() => onAt(index)}
            >
              <span className="hv-ob-guide-n" aria-hidden="true">
                {index < at ? <CheckIcon weight="bold" /> : index + 1}
              </span>
              {step.title}
            </button>
            {open && (
              <div className="hv-ob-guide-body">
                {step.body}
                {index < steps.length - 1 && (
                  <button
                    type="button"
                    className="hv-ob-next"
                    onClick={() => onAt(index + 1)}
                  >
                    Done, next step
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The one field a provider credential is pasted into.
 *
 * A password input that is never given a name a browser would offer to save
 * under, never written to storage, and cleared on success. `recognise` looks
 * at the shape only, so a wrong kind of key is caught before it is sent
 * anywhere; it never echoes any part of the value back.
 */
export function SecretPaste({
  label,
  recognise,
  busy,
  action,
  onSubmit,
  keep,
}: {
  label: string;
  recognise: (value: string) => { ok: boolean; hint: string } | null;
  busy: boolean;
  action: string;
  onSubmit: (value: string) => Promise<boolean>;
  /** Shown beside the field after a failure that left the value in place. */
  keep?: string | null;
}) {
  const [value, setValue] = useState("");
  const shape = value ? recognise(value.trim()) : null;
  return (
    <form
      className="hv-ob-paste"
      autoComplete="off"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!value.trim() || busy) return;
        if (await onSubmit(value.trim())) setValue("");
      }}
    >
      <label>
        {label}
        <div className="hv-ob-paste-row">
          <input
            type="password"
            autoComplete="off"
            data-1p-ignore=""
            data-lpignore="true"
            spellCheck={false}
            value={value}
            disabled={busy}
            placeholder="Paste it here"
            onChange={(event) => setValue(event.target.value)}
          />
          <button type="submit" disabled={busy || !value.trim()}>
            {busy ? "Checking…" : action}
          </button>
        </div>
      </label>
      {shape && (
        <p className="hv-ob-shape" data-ok={shape.ok ? "" : undefined}>
          {shape.hint}
        </p>
      )}
      {!shape && keep && <p className="hv-ob-shape">{keep}</p>}
      <p className="hv-ob-fine">
        Goes straight to Hallvi on this computer. Never into the conversation,
        the AI model, a web address or a log.
      </p>
    </form>
  );
}

export function Problem({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="hv-ob-problem" role="alert">
      <strong>
        <Warning weight="bold" aria-hidden="true" /> {title}
      </strong>
      {children}
    </div>
  );
}

export function Receipt({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <details className="hv-ob-receipt">
      <summary>
        <CheckIcon weight="bold" aria-hidden="true" />
        {title}
      </summary>
      {children}
    </details>
  );
}
