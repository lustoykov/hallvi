"use client";
import { useEffect, useId, useRef, useState } from "react";
import {
  APPROVAL_MODES,
  type ApplicationRecord,
  type ApprovalMode,
  type PhaseKey,
} from "@/server/types";
import type { SetupImpact } from "@/server/setup-correction";
import { api } from "./api";
import s from "./confirm-action-dialog.module.css";
export function SetupDialog({
  application,
  onClose,
  onApplied,
}: {
  application: ApplicationRecord;
  onClose: () => void;
  onApplied: (phase: PhaseKey) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [name, setName] = useState(application.name);
  const [repositoryUrl, setRepositoryUrl] = useState(application.repositoryUrl);
  const [approvalMode, setApprovalMode] = useState(application.approvalMode);
  const [impact, setImpact] = useState<SetupImpact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (impact) {
        const result = await api.applySetup(application.id, impact.id);
        await onApplied(result.phaseKey);
        onClose();
      } else
        setImpact(
          await api.setupImpact(application.id, {
            name,
            repositoryUrl,
            approvalMode,
          }),
        );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update setup.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className={s.dialog}
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id={title}>
        {impact ? "Review setup change" : "Edit application setup"}
      </h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {!impact ? (
          <>
            <p>
              Review the impact before applying. The deployment target remains
              Production; the server is chosen later.
            </p>
            <label>
              Application name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
                disabled={busy}
              />
            </label>
            <label>
              GitHub repository
              <input
                value={repositoryUrl}
                onChange={(e) => setRepositoryUrl(e.target.value)}
                required
                maxLength={2048}
                disabled={busy}
              />
            </label>
            <label>
              Permission policy
              <select
                value={approvalMode}
                disabled={busy}
                onChange={(e) =>
                  setApprovalMode(e.target.value as ApprovalMode)
                }
              >
                {Object.entries(APPROVAL_MODES).map(([value, policy]) => (
                  <option key={value} value={value}>
                    {policy.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <p>
              {impact.before.name} → {impact.after.name}
              <br />
              {impact.after.repositoryUrl}
              <br />
              {APPROVAL_MODES[impact.after.approvalMode].label}
            </p>
            <h3>What stays</h3>
            <ul>
              {impact.retained.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3>What changes</h3>
            <ul>
              {impact.required.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        )}
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          {impact && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setImpact(null);
                setError(null);
              }}
            >
              Edit again
            </button>
          )}
          <button className={s.primary} type="submit" disabled={busy}>
            {busy
              ? "Working…"
              : impact
                ? "Apply setup change"
                : "Review impact"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
