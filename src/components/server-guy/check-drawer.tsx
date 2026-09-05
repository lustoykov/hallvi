"use client";

import { ArrowClockwise, ArrowSquareOut, ChatCircleDots, Check, Circle, GithubLogo, SpinnerGap, X } from "@phosphor-icons/react";
import { useLayoutEffect, useRef } from "react";
import Link from "next/link";

import type { GateCheck } from "@/server/types";

import { formatTimestamp, statusLabel } from "./format";

export function CheckDrawer({
  check,
  busy,
  onClose,
  onAsk,
  onRerun,
}: {
  check: GateCheck;
  busy: boolean;
  onClose: () => void;
  onAsk: (check: GateCheck) => void;
  onRerun: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      // Restore before the next frame, so an explicit Ask Pi action can then
      // move focus to the composer without this cleanup stealing it back.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="sg-drawer-layer"
      aria-label={`${check.label} details`}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <aside className="sg-detail-drawer">
        <header className="sg-drawer-header">
          <h2>{check.label}</h2>
          <button aria-label="Close details" className="sg-icon-button" onClick={onClose} type="button"><X /></button>
        </header>

        <div className="sg-drawer-body">
          {/* The result leads: it is the one fact the operator opened this drawer for. */}
          <section className={`sg-drawer-summary ${check.status}`}>
            <span className="sg-eyebrow">Current result</span>
            <div className="sg-drawer-result">
              <span aria-hidden="true" className={`sg-check-icon ${check.status}`}>
                {check.status === "passed" ? <Check weight="bold" /> : <Circle weight="bold" />}
              </span>
              <div>
                <strong>{statusLabel(check.status)}</strong>
                <p>{check.result}</p>
                {check.key === "repository-readable" && (
                  <Link className="sg-secondary-button sg-drawer-settings" href="/setup/github">
                    <GithubLogo weight="fill" /> Open GitHub settings
                  </Link>
                )}
              </div>
            </div>
          </section>

          <section>
            <span className="sg-eyebrow">What this checks</span>
            <p className="sg-drawer-rule">{check.definition}</p>
          </section>

          <section>
            <span className="sg-eyebrow">Verify it yourself</span>
            <p>Server Guy derives this result from the records below. Open one to see exactly what was recorded.</p>
            {check.evidence.length ? (
              <div className="sg-evidence-list">
                {check.evidence.map((evidence) => (
                  <a href={evidence.href} key={`${evidence.recordType}:${evidence.recordId}:${evidence.role}`} rel="noreferrer" target="_blank">
                    <span>{evidence.role}</span>
                    <strong>{evidence.label}</strong>
                    <small>Recorded {formatTimestamp(evidence.observedAt)}</small>
                    <ArrowSquareOut aria-hidden="true" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="sg-evidence-empty">No relevant evidence has been recorded yet.</p>
            )}
          </section>
        </div>

        <footer className="sg-drawer-actions">
          <button className="sg-secondary-button" onClick={() => onAsk(check)} type="button">
            <ChatCircleDots /> Ask Pi about this check
          </button>
          {check.canRerun && (
            <button className="sg-primary-button" disabled={busy} onClick={onRerun} type="button">
              {busy ? <SpinnerGap className="spin" /> : <ArrowClockwise />}
              Re-run repository check
            </button>
          )}
        </footer>
      </aside>
    </dialog>
  );
}
