"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { RevisionImpact } from "@/server/revision-correction";
import { api } from "./api";
import s from "./confirm-action-dialog.module.css";

export function RevisionDialog({
  applicationId,
  onClose,
  onApplied,
}: {
  applicationId: string;
  onClose: () => void;
  onApplied: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [reference, setReference] = useState("main");
  const [impact, setImpact] = useState<RevisionImpact | null>(null);
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
        await api.applyRevision(applicationId, impact.id);
        await onApplied();
        onClose();
      } else setImpact(await api.revisionImpact(applicationId, reference));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not check this revision. Try again.",
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
        {impact ? "Review revision change" : "Choose another revision"}
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
              Your current commit stays selected until you review and apply the
              change.
            </p>
            <label>
              Branch, tag or commit
              <input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                required
                maxLength={200}
                disabled={busy}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </>
        ) : (
          <>
            <p>
              <code>{impact.fromCommit.slice(0, 8)}</code> →{" "}
              <code>{impact.toCommit.slice(0, 8)}</code>. Later pushes to{" "}
              <code>{impact.reference}</code> won’t change this selection.
            </p>
            <h3>What stays</h3>
            <ul>
              {impact.retained.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3>What needs doing again</h3>
            <ul>
              {impact.required.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <details>
              <summary>
                Changed files{impact.filesComplete ? "" : " (incomplete list)"}
              </summary>
              <ul>
                {impact.changedFiles.map((file) => (
                  <li key={file.path}>
                    {file.change}: <code>{file.path}</code>
                  </li>
                ))}
              </ul>
              {!impact.changedFiles.length && (
                <p>No file differences found in the available trees.</p>
              )}
            </details>
            <p>{impact.uncertainty}</p>
          </>
        )}
        {error && (
          <p className={s.error} role="alert">
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
              Review another revision
            </button>
          )}
          <button
            className={s.primary}
            disabled={busy || !reference.trim()}
            type="submit"
          >
            {busy
              ? "Working…"
              : impact
                ? "Use this commit and review Phase 2"
                : "Review impact"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
