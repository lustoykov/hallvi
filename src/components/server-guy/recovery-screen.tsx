"use client";

// Making a copy of the controller you could come back from.
//
// The failure this is for is the one nobody rehearses: this computer dies. The
// applications keep running — they are on their own servers — but the
// credentials that reach them, the passwords Server Guy generated and the
// records of what it did are all here, and nowhere else.
//
// The page has one job beyond making the file, and it is the harder one:
// making sure the owner understands that the passphrase is the whole
// protection and is not kept anywhere. A screen that produced the archive and
// left that implicit would be worse than no screen, because the owner would
// believe they had a backup.

import { Check, Copy, DownloadSimple, Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { SettingsNav } from "./settings-nav";
import s from "./pi-setup-screen.module.css";
import "./recovery-screen.css";

interface Entry {
  path: string;
  what: string;
  sensitive: boolean;
  bytes: number;
}

interface Ready {
  available: boolean;
  version: string | null;
  why?: string;
  entries: Entry[];
  missing: string[];
  excludes: string[];
  suggested: string;
  into: string;
}

interface Written {
  file: string;
  bytes: number;
  fingerprint: string;
  open: string;
}

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function RecoveryScreen() {
  const [ready, setReady] = useState<Ready | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [kept, setKept] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [written, setWritten] = useState<Written | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/recovery", { cache: "no-store" });
        const body = await response.json();
        if (cancelled) return;
        setReady(body);
        setPassphrase(body.suggested ?? "");
      } catch {
        if (!cancelled) setError("The controller did not answer.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const write = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error ?? "It was not written.");
      setWritten(body);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  const sensitive = (ready?.entries ?? []).filter((entry) => entry.sensitive);

  return (
    <main className={s.page}>
      <SettingsNav current="recovery" />
      <h1 className={s.headline}>Recovery copy</h1>
      <p className={s.lede}>
        An encrypted copy of what this computer would need to be rebuilt: the
        records, the credentials Server Guy generated, and the keys that reach
        your servers. It is not a backup of your applications&rsquo; own data —
        that is each application&rsquo;s Backups page, and a separate question.
      </p>

      {ready && !ready.available && (
        <div className="sg-recovery-blocked">
          <Warning weight="fill" aria-hidden="true" />
          <p>{ready.why}</p>
        </div>
      )}

      {ready?.available && !written && (
        <>
          <section className="sg-recovery-card">
            <h2>What goes in</h2>
            <ul className="sg-recovery-contents">
              {ready.entries.map((entry) => (
                <li
                  key={entry.path}
                  data-sensitive={entry.sensitive || undefined}
                >
                  <code>{entry.path}</code>
                  <span>{entry.what}</span>
                  <small>{size(entry.bytes)}</small>
                </li>
              ))}
            </ul>
            {sensitive.length > 0 && (
              <p className="sg-recovery-warn">
                <Warning weight="bold" aria-hidden="true" />
                {sensitive.length} of these hold credentials in a form that
                works. Anyone who opens this file can use them, so where you
                keep it matters as much as the passphrase.
              </p>
            )}
            <h3>What it does not include</h3>
            <ul className="sg-recovery-excludes">
              {ready.excludes.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          <section className="sg-recovery-card">
            <h2>The passphrase</h2>
            <p>
              This is the only thing protecting the file, and Server Guy does
              not keep it. It is not in the archive, not beside it, and not
              recoverable from this computer — which is the point, because the
              computer is what you are protecting against losing.
            </p>
            <div className="sg-recovery-passphrase">
              <input
                type="text"
                value={passphrase}
                spellCheck={false}
                autoComplete="off"
                aria-label="Recovery passphrase"
                onChange={(event) => {
                  setPassphrase(event.target.value);
                  setKept(false);
                }}
              />
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(passphrase);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2400);
                  } catch {
                    setError("The clipboard refused it; copy it by hand.");
                  }
                }}
              >
                {copied ? (
                  <Check weight="bold" aria-hidden="true" />
                ) : (
                  <Copy weight="bold" aria-hidden="true" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="sg-recovery-hint">
              Server Guy suggested this one. Replace it with your own if you
              would rather, as long as it is at least 16 characters.
            </p>
            {/* Deliberately a gate rather than a note. An owner who has not
                saved the passphrase does not have a recovery copy, and the
                moment they will believe otherwise is the moment the file
                appears. */}
            <label className="sg-recovery-confirm">
              <input
                type="checkbox"
                checked={kept}
                onChange={(event) => setKept(event.target.checked)}
              />
              I have saved this passphrase somewhere that is not this computer.
            </label>
            <button
              type="button"
              className="sg-recovery-make"
              disabled={busy || !kept || passphrase.length < 16}
              onClick={write}
            >
              <DownloadSimple weight="bold" aria-hidden="true" />
              {busy ? "Writing…" : "Write the recovery copy"}
            </button>
            <p className="sg-recovery-hint">
              It will be written to <code>{ready.into}</code>.
            </p>
          </section>
        </>
      )}

      {written && (
        <section className="sg-recovery-card" data-done="">
          <h2>
            <Check weight="bold" aria-hidden="true" /> Written
          </h2>
          <dl>
            <div>
              <dt>File</dt>
              <dd>
                <code>{written.file}</code>
              </dd>
            </div>
            <div>
              <dt>Size</dt>
              <dd>{size(written.bytes)}</dd>
            </div>
            <div>
              <dt>Fingerprint</dt>
              <dd>
                <code>{written.fingerprint}</code>
              </dd>
            </div>
            <div>
              <dt>To open it, with or without Server Guy</dt>
              <dd>
                <code>{written.open}</code>
              </dd>
            </div>
          </dl>
          <p className="sg-recovery-warn">
            <Warning weight="bold" aria-hidden="true" />
            Move it somewhere that is not this computer. A recovery copy stored
            only on the machine it recovers is not a recovery copy.
          </p>
        </section>
      )}

      {error && (
        <p className="sg-recovery-error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
