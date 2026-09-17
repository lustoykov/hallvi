"use client";

import { CaretRight, ShieldCheck, Warning } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import type { ControllerProtectionFacts } from "@/server/application-facts";

import { ago } from "./architecture-prototype/model";
import { BackupStorageForm } from "./backup-storage-form";
import "./controller-protection.css";

interface Kit {
  passphrase: string;
  bucket: string;
  endpoint: string;
  prefix: string;
  keep: number;
}

/** One sentence for the page's summary: would Server Guy itself survive? */
export function controllerSentence(
  facts: ControllerProtectionFacts,
  now: number,
) {
  return facts.state === "recoverable"
    ? `Copied ${ago(facts.lastCopyAt, now)}; recovery kit saved`
    : facts.state === "copied"
      ? `Copied ${ago(facts.lastCopyAt, now)}; recovery kit still needs saving`
      : facts.state === "failing"
        ? "Latest copy failed"
        : facts.connected
          ? "Storage connected; no copy yet"
          : "Not copied";
}

/**
 * Server Guy's own recovery is separate from the application's data. It is
 * always findable, but stays one compact disclosure until the owner needs it.
 */
export function ControllerProtectionBand({
  facts,
  now,
  onRefresh,
}: {
  facts: ControllerProtectionFacts;
  now: number;
  onRefresh?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [kit, setKit] = useState<Kit | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const unconfirmed = facts.kitReady && !facts.kitConfirmedAt;
  const failed = facts.copies.find((copy) => copy.outcome === "failed");

  useEffect(() => {
    if (!unconfirmed || !open || kit) return;
    let live = true;
    // The passphrase only travels when the owner opens this section. It is
    // not part of the page's ordinary refresh data.
    fetch("/api/controller-protection/kit")
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (live && value?.passphrase) setKit(value as Kit);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [kit, open, unconfirmed]);

  return (
    <details
      className="cpb"
      aria-label="Server Guy on this Mac"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className="cpb-icon" data-state={facts.state} aria-hidden="true">
          {facts.state === "recoverable" ? (
            <ShieldCheck weight="bold" />
          ) : (
            <Warning weight="bold" />
          )}
        </span>
        <span className="cpb-summary-copy">
          <b>Server Guy on this Mac</b>
          <small>{controllerSentence(facts, now)}</small>
        </span>
        <CaretRight className="cpb-chevron" weight="bold" aria-hidden="true" />
      </summary>

      <div className="cpb-body">
        {!facts.connected && facts.lastCopyAt ? (
          <p className="cpb-say">
            Backup storage is no longer connected. Existing copies in{" "}
            <code>{facts.bucket}</code> remain there, but nothing new is being
            copied.
          </p>
        ) : !facts.connected ? (
          <>
            <p className="cpb-say">
              Losing this Mac would lose Server Guy’s conversations,
              connections, deployment access and decisions. Connect storage to
              copy those rebuild dependencies. Application data still needs its
              own backup plan.
            </p>
            <div className="cpb-form">
              <BackupStorageForm onConnected={onRefresh} />
            </div>
          </>
        ) : !facts.lastCopyAt ? (
          <p className="cpb-say">
            Storage is connected. The first copy is taken within a minute, or
            after work in progress finishes. This copies Server Guy, not the
            application.
          </p>
        ) : (
          <p className="cpb-say">
            Server Guy’s conversations, connections, deployment access and
            decisions were copied {ago(facts.lastCopyAt, now)} into{" "}
            <code>{facts.bucket}</code>. It keeps the last {facts.keep} copies.
          </p>
        )}

        {failed && (
          <p className="cpb-failure">
            <b>The latest attempt failed {ago(failed.at, now)}.</b>{" "}
            {failed.reason} Server Guy tries again within the hour.
          </p>
        )}
        {facts.retentionFailed && (
          <p className="cpb-failure">
            An older copy could not be deleted. Nothing was lost; storage holds
            more copies than planned.
          </p>
        )}

        {unconfirmed && (
          <div className="cpb-kit" aria-label="Recovery kit">
            <b>Save your recovery kit</b>
            <p>
              The copies are encrypted and include every key Server Guy holds,
              including the key to this bucket. Keep this passphrase in your
              password manager; it is deliberately absent from the backups.
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
              <p>
                {open
                  ? "Reading the kit…"
                  : "Open this section to read the kit."}
              </p>
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
                  const response = await fetch(
                    "/api/controller-protection/kit",
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: "{}",
                    },
                  );
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
      </div>
    </details>
  );
}
