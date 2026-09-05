"use client";

import { ArrowClockwise, ArrowSquareOut, ChatCircleDots, Check, Circle, SpinnerGap, X } from "@phosphor-icons/react";
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
      <aside
        className="sg-detail-drawer"
      >
        <header>
          <div><span className="sg-eyebrow">Launch Brief check</span><h2>{check.label}</h2></div>
          <button aria-label="Close details" className="sg-icon-button" onClick={onClose} type="button"><X /></button>
        </header>
        <section className="sg-drawer-summary">
          <span className={`sg-check-icon ${check.status}`}>
            {check.status === "passed" ? <Check weight="bold" /> : <Circle weight="bold" />}
          </span>
          <div>
            <span>Current result</span>
            <strong>{statusLabel(check.status)}</strong>
            <p>{check.result}</p>
            {check.key === "repository-readable" && (
              <Link className="sg-secondary-button sg-drawer-settings" href="/setup/github">Open GitHub settings</Link>
            )}
          </div>
        </section>
        <section>
          <span className="sg-eyebrow">What this checks</span>
          <p>{check.definition}</p>
        </section>
        <section>
          <span className="sg-eyebrow">Verify it yourself</span>
          <p>Server Guy derives this result from the records below. A check may use no evidence, one record, or several independent observations.</p>
          {check.evidence.length ? (
            <div className="sg-evidence-list">
              {check.evidence.map((evidence) => (
                <a href={evidence.href} key={`${evidence.recordType}:${evidence.recordId}:${evidence.role}`} rel="noreferrer" target="_blank">
                  <span>{evidence.role}</span>
                  <strong>{evidence.label}</strong>
                  <small>Recorded {formatTimestamp(evidence.observedAt)}</small>
                  <ArrowSquareOut />
                </a>
              ))}
            </div>
          ) : (
            <p>No relevant evidence has been recorded yet.</p>
          )}
        </section>
        <section>
          <span className="sg-eyebrow">Take control</span>
          <button className="sg-secondary-button" onClick={() => onAsk(check)} type="button">
            <ChatCircleDots /> Ask Pi about this check
          </button>
          {check.canRerun && (
            <button className="sg-primary-button" disabled={busy} onClick={onRerun} type="button">
              {busy ? <SpinnerGap className="spin" /> : <ArrowClockwise />}
              Re-run repository check
            </button>
          )}
        </section>
      </aside>
    </dialog>
  );
}
