"use client";

import { useEffect, useId, useRef, useState } from "react";

import s from "./confirm-action-dialog.module.css";

/**
 * The application's name is the owner's label. It is derived from the
 * repository when the application is added, so this is where it changes.
 */
export function RenameApplicationDialog({
  current,
  busy,
  error,
  onCancel,
  onRename,
}: {
  current: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onRename: (name: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const inputId = useId();
  const [name, setName] = useState(current);
  const usable = name.trim().length > 0 && name.trim() !== current;

  useEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement;
    element.showModal();
    element.querySelector("input")?.select();
    return () => {
      element.close();
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      className={s.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id={titleId}>Rename application</h2>
      <p>
        Only the name changes. The repository, server, conversations and history
        stay as they are.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && usable) onRename(name.trim());
        }}
      >
        <label htmlFor={inputId}>
          <span>Application name</span>
          <input
            id={inputId}
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            autoComplete="off"
          />
        </label>
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
            className={s.primary}
            type="submit"
            disabled={busy || !usable}
          >
            {busy ? "Renaming…" : "Rename"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
