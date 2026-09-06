"use client";

import {
  ArrowClockwise,
  ArrowSquareOut,
  ChatCircleDots,
  GithubLogo,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import { useLayoutEffect, useRef } from "react";
import Link from "next/link";

import type { GateCheck } from "@/server/types";

import { statusLabel } from "./format";
import { CheckIcon } from "./inspector";
import { LocalTime } from "./local-time";

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
  onRerun: (key: NonNullable<GateCheck["rerun"]>["key"]) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      // Restore before the next frame, so an explicit Ask action can then
      // move focus to the composer without this cleanup stealing it back.
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="sg-drawer-layer"
      aria-label={`${check.label} details`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
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
          <button
            aria-label="Close details"
            className="sg-icon-button"
            onClick={onClose}
            type="button"
          >
            <X />
          </button>
        </header>

        <div className="sg-drawer-body">
          {/* The result leads: it is the one fact the operator opened this
              drawer for. */}
          <section className={`sg-drawer-summary ${check.status}`}>
            <span className="sg-eyebrow">Current result</span>
            <div className="sg-drawer-result">
              <CheckIcon status={check.status} />
              <div>
                <strong>{statusLabel(check.status)}</strong>
                <p>{check.result}</p>
                {check.key === "repository-readable" && (
                  <Link
                    className="sg-secondary-button sg-drawer-settings"
                    href="/setup/github"
                  >
                    <GithubLogo weight="fill" /> Open GitHub settings
                  </Link>
                )}
                {check.key === "conformance-passed" && (
                  <Link
                    className="sg-secondary-button sg-drawer-settings"
                    href="/setup/execution"
                  >
                    Open Execution settings
                  </Link>
                )}
              </div>
            </div>
          </section>

          <section>
            <span className="sg-eyebrow">What this means</span>
            <p className="sg-drawer-rule">{check.definition}</p>
          </section>

          <section>
            <span className="sg-eyebrow">Saved details</span>
            <p>Open a record to see what this result is based on.</p>
            {check.evidence.length ? (
              <div className="sg-evidence-list">
                {check.evidence.map((evidence) => (
                  <a
                    href={evidence.href}
                    key={`${evidence.recordType}:${evidence.recordId}:${evidence.role}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <span>{evidence.role}</span>
                    <strong>{evidence.label}</strong>
                    <small>
                      Recorded <LocalTime value={evidence.observedAt} />
                    </small>
                    <ArrowSquareOut aria-hidden="true" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="sg-evidence-empty">
                No details saved for this check yet.
              </p>
            )}
          </section>
        </div>

        <footer className="sg-drawer-actions">
          <button
            className="sg-secondary-button"
            onClick={() => onAsk(check)}
            type="button"
          >
            <ChatCircleDots /> Ask about this check
          </button>
          {check.rerun && (
            <button
              className="sg-primary-button"
              disabled={busy}
              onClick={() => onRerun(check.rerun!.key)}
              type="button"
            >
              {busy ? <SpinnerGap className="spin" /> : <ArrowClockwise />}
              {check.rerun.label}
            </button>
          )}
        </footer>
      </aside>
    </dialog>
  );
}
