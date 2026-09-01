"use client";

import { ArrowClockwise, ArrowSquareOut, ChatCircleDots, Check, Circle, SpinnerGap, X } from "@phosphor-icons/react";
import { useEffect } from "react";

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
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="sg-drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside
        aria-label={`${check.label} details`}
        aria-modal="true"
        className="sg-detail-drawer"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div><span className="sg-eyebrow">Launch Brief check</span><h2>{check.label}</h2></div>
          <button aria-label="Close details" className="sg-icon-button" onClick={onClose} type="button"><X /></button>
        </header>
        <section className="sg-drawer-summary">
          <span className={`sg-check-icon ${check.status}`}>
            {check.status === "passed" ? <Check weight="bold" /> : <Circle weight="bold" />}
          </span>
          <div><span>Current result</span><strong>{statusLabel(check.status)}</strong><p>{check.result}</p></div>
        </section>
        <section>
          <span className="sg-eyebrow">What this checks</span>
          <p>{check.definition}</p>
        </section>
        <section>
          <span className="sg-eyebrow">Verify it yourself</span>
          <p>Open the underlying record or external source. Server Guy’s status is derived from that source and can be rechecked.</p>
          <div className="sg-drawer-actions">
            {check.sourceUrl && (
              <a href={check.sourceUrl} rel="noreferrer" target="_blank">
                {check.sourceLabel ?? "Open source"} <ArrowSquareOut />
              </a>
            )}
            {check.observationId && (
              <a href={`/api/observations/${check.observationId}`} rel="noreferrer" target="_blank">
                Raw receipt <ArrowSquareOut />
              </a>
            )}
          </div>
          {check.observedAt && <small>Recorded {formatTimestamp(check.observedAt)}</small>}
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
    </div>
  );
}
