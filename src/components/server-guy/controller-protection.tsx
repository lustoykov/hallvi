"use client";

import { ShieldCheck, Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import type { ControllerProtectionFacts } from "@/server/application-facts";

import { ago } from "./architecture-prototype/model";
import { BackupStorageForm } from "./views/backup-storage-form";
import "./controller-protection.css";

interface Kit {
  passphrase: string;
  bucket: string;
  endpoint: string;
  prefix: string;
  keep: number;
}

/** The state in the fewest words that stay true; the band says the rest. */
export const controllerWord = {
  unprotected: "Not copied",
  copied: "Kit not saved",
  recoverable: "Recoverable",
  failing: "Copy failed",
} as const;

/** One sentence for the page's lede: would Server Guy itself survive this? */
export function controllerSentence(
  facts: ControllerProtectionFacts,
  now: number,
) {
  return facts.state === "recoverable"
    ? `Server Guy’s own records and keys are copied off this machine too, last ${ago(facts.lastCopyAt, now)}, and you hold what opens them.`
    : facts.state === "copied"
      ? `Server Guy’s own records and keys are copied off this machine, last ${ago(facts.lastCopyAt, now)}, but its recovery kit is not saved yet.`
      : facts.state === "failing"
        ? "Server Guy’s last copy of its own records and keys did not finish."
        : facts.connected
          ? "Server Guy’s own records and keys have not been copied yet."
          : "Server Guy’s own records and keys are not copied anywhere either.";
}

/**
 * What the owner has to know or do about Server Guy's own protection, under
 * the board that shows it. Nothing appears while it is quietly working: the
 * calendar row already says so.
 */
export function ControllerProtectionBand({
  facts,
  now,
  onRefresh,
  standalone = false,
}: {
  facts: ControllerProtectionFacts;
  now: number;
  onRefresh?: () => Promise<void>;
  /** No board above it, so it states the whole fact rather than going quiet. */
  standalone?: boolean;
}) {
  const [kit, setKit] = useState<Kit | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const unconfirmed = facts.kitReady && !facts.kitConfirmedAt;
  useEffect(() => {
    if (!unconfirmed) return;
    let live = true;
    // Asked for only when it is about to be shown, so the passphrase never
    // travels with the page's ordinary refresh.
    fetch("/api/controller-protection/kit")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (live && value?.passphrase) setKit(value as Kit);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [unconfirmed]);
  const failed = facts.copies.find((copy) => copy.outcome === "failed");
  const quiet =
    facts.state === "recoverable" && !failed && !facts.retentionFailed;
  if (quiet && !standalone) return null;
  return (
    <section className="cpb" aria-label="Server Guy itself">
      <div className="cpb-head">
        <span className="cpb-icon" data-state={facts.state} aria-hidden="true">
          {facts.state === "recoverable" ? (
            <ShieldCheck weight="bold" />
          ) : (
            <Warning weight="bold" />
          )}
        </span>
        <div>
          <b>
            Server Guy itself
            <em className="cpb-state" data-state={facts.state}>
              {controllerWord[facts.state]}
            </em>
          </b>
          <small>
            Its conversations, connections, deployment access and decisions —
            what rebuilding it needs.
          </small>
        </div>
      </div>
      {!facts.connected && facts.lastCopyAt ? (
        <p className="cpb-say">
          Backup storage is no longer connected. The copies already in{" "}
          <code>{facts.bucket}</code> are still there; nothing new is being
          copied.
        </p>
      ) : !facts.connected ? (
        <>
          <p className="cpb-say">
            Losing this machine would lose them. Connecting off-host storage
            protects your application’s data and Server Guy together — there is
            nothing else to switch on.
          </p>
          <div className="cpb-form">
            <BackupStorageForm onConnected={onRefresh} />
          </div>
        </>
      ) : !facts.lastCopyAt ? (
        <p className="cpb-say">
          Storage is connected. The first copy is taken within a minute, or
          right after the work in progress finishes.
        </p>
      ) : quiet ? (
        <p className="cpb-say">
          Copied {ago(facts.lastCopyAt, now)} into <code>{facts.bucket}</code>,
          after each piece of work and once a day. The last {facts.keep} copies
          are kept, and you hold the passphrase that opens them.
        </p>
      ) : null}
      {failed && (
        <p className="cpb-say">
          The last attempt failed {ago(failed.at, now)}: {failed.reason} Server
          Guy tries again within the hour.
        </p>
      )}
      {facts.retentionFailed && (
        <p className="cpb-say">
          An older copy could not be deleted. Nothing was lost; storage holds
          more than it should.
        </p>
      )}
      {unconfirmed && (
        <div className="cpb-kit" aria-label="Recovery kit">
          <b>Save your recovery kit</b>
          <p>
            The copies are encrypted, and they contain every key Server Guy
            holds — including the one to this bucket. Keep this passphrase in
            your password manager: it is deliberately nowhere on this machine’s
            backups.
          </p>
          {kit ? (
            <dl>
              <div>
                <dt>Passphrase</dt>
                <dd>
                  <code data-recovery-passphrase="">{kit.passphrase}</code>
                </dd>
              </div>
              <div>
                <dt>Bucket</dt>
                <dd>
                  <code>{kit.bucket}</code>
                </dd>
              </div>
              <div>
                <dt>Storage</dt>
                <dd>
                  <code>{kit.endpoint}</code>
                </dd>
              </div>
            </dl>
          ) : (
            <p>Reading the kit…</p>
          )}
          {error && (
            <p role="alert" className="cpb-error">
              {error}
            </p>
          )}
          <button
            type="button"
            className="ax-button cpb-saved"
            disabled={saving || !kit}
            onClick={async () => {
              setSaving(true);
              setError("");
              try {
                const response = await fetch("/api/controller-protection/kit", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                if (!response.ok)
                  throw new Error("That could not be recorded. Try again.");
                setKit(null);
                await onRefresh?.();
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "That could not be recorded.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "I saved it"}
          </button>
        </div>
      )}
    </section>
  );
}
