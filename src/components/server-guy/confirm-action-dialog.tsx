"use client";

import { useEffect, useId, useRef, useState } from "react";

import s from "./confirm-action-dialog.module.css";

export function ConfirmActionDialog({
  title,
  description,
  action,
  confirmation,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  action: string;
  confirmation?: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const inputId = useId();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      // Passive cleanup may run after React removes the dialog from the DOM.
      // Native close alone then cannot restore the initiating control.
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className={s.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && (!confirmation || typed === confirmation)) onConfirm();
        }}
      >
        {confirmation && (
          <label htmlFor={inputId}>
            <span>
              Type <strong>{confirmation}</strong> to confirm
            </span>
            <input
              id={inputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={busy}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}
        {error && (
          <p className={s.error} role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={s.danger}
            type="submit"
            disabled={busy || Boolean(confirmation && typed !== confirmation)}
          >
            {busy ? "Working…" : action}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
