"use client";

import {
  Archive,
  Brain,
  CaretRight,
  Check,
  Cloud,
  Cube,
  GitBranch,
  Globe,
  Key,
  Plugs,
  Warning,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ModelConnect } from "./onboarding/model-connect";
import { GithubConnect } from "./onboarding/github-connect";
import { ProviderTokenForm } from "./provider-token-form";
import type { SetupReturn } from "@/server/setup-return";
import { BackupStorageForm } from "./backup-storage-form";
import { SettingsShell } from "./settings-shell";
import h from "./pi-setup-screen.module.css";
import s from "./settings.module.css";

/** A credential this page can take, on this page, in a field. */
export type ConnectionForm =
  | "hetzner"
  | "cloudflare"
  | "backup-storage"
  /** The two accounts Hallvi itself signs in to, as their own cards. */
  | "model"
  | "github";

/**
 * The one thing a row offers: a form here, or a place that does the work.
 * A row never links somewhere that sends the reader back here, and never
 * picks an application on their behalf — when a destination needs one, the
 * link says which application it opens, or offers the list.
 */
export type ConnectionAction =
  | { kind: "form"; form: ConnectionForm; label: string }
  | { kind: "link"; href: string; label: string };

/**
 * One provider connection as Settings shows it: what it is used for, its
 * state in words, and the one action that fits. Credentials never appear;
 * only their scope and age.
 */
export interface ConnectionItem {
  id: string;
  name: string;
  purpose: string;
  state: "connected" | "expired" | "failed" | "not-connected";
  detail: string;
  /** "Token scoped to one bucket · added 9 Sep". Never the credential. */
  credential?: string | null;
  usedBy?: string[];
  /** What the reader has to know before the action, such as that there is
   * no application yet for a conversation to happen in. */
  note?: string;
  action: ConnectionAction;
}

/**
 * Hallvi's own copies are encrypted with a passphrase the owner keeps
 * elsewhere. It is shown once when the first copy lands; afterwards only a
 * deliberate action here shows it again.
 */
function RecoveryKit({
  kit,
}: {
  kit: { confirmedAt: string | null; bucket: string; host: string };
}) {
  const [shown, setShown] = useState<{
    passphrase: string;
    endpoint: string;
  } | null>(null);
  const [error, setError] = useState("");
  return (
    <section aria-label="Hallvi recovery kit">
      <h3 className={s.groupTitle}>Recovery</h3>
      <ul className={s.rows}>
        <li data-state={kit.confirmedAt ? "connected" : "expired"}>
          <div className={s.row}>
            <span className={s.rowIcon}>
              <Key aria-hidden="true" />
            </span>
            <span className={s.rowText}>
              <strong>Hallvi recovery kit</strong>
              <small>
                Hallvi copies its own records and keys into{" "}
                <code>{kit.bucket}</code> at {kit.host}, encrypted. This
                passphrase is the only thing that opens them.{" "}
                {kit.confirmedAt
                  ? "You have said it is saved outside this machine."
                  : "Not saved yet. Keep it in your password manager."}
              </small>
            </span>
            {!shown && (
              <button
                type="button"
                className={s.btn}
                onClick={async () => {
                  setError("");
                  try {
                    const response = await fetch(
                      "/api/controller-protection/kit",
                    );
                    const value = await response.json();
                    if (!response.ok || !value?.passphrase)
                      throw new Error("The recovery kit could not be read.");
                    setShown(value);
                  } catch (caught) {
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : "The recovery kit could not be read.",
                    );
                  }
                }}
              >
                Show recovery kit
              </button>
            )}
          </div>
          {(shown || error) && (
            <div className={s.rowMore}>
              {shown && (
                <>
                  <code className={h.recoveryCode} data-recovery-passphrase="">
                    {shown.passphrase}
                  </code>
                  <p className={s.muted}>{shown.endpoint}</p>
                </>
              )}
              {error && (
                <p className={s.error} role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
        </li>
      </ul>
    </section>
  );
}

const ICONS: Record<string, ReactNode> = {
  model: <Brain aria-hidden="true" />,
  github: <GitBranch aria-hidden="true" />,
  workspace: <Cube aria-hidden="true" />,
  hetzner: <Cloud aria-hidden="true" />,
  cloudflare: <Globe aria-hidden="true" />,
  "r2-uploads": <Archive aria-hidden="true" />,
};
/** Hallvi's own accounts; the rest are the owner's providers. */
const OWN = ["model", "github", "workspace"];

export function ConnectionsScreen({
  connections,
  recoveryKit,
  returnTo,
  prototype = false,
}: {
  returnTo?: SetupReturn;
  connections: ConnectionItem[];
  recoveryKit?: { confirmedAt: string | null; bucket: string; host: string };
  prototype?: boolean;
}) {
  const router = useRouter();
  // The credential the reader is typing, if any. One at a time, on this page,
  // so the inventory they came for stays where it was.
  const [open, setOpen] = useState<ConnectionForm | null>(null);
  const needing = connections.filter(
    (item) => item.state === "expired" || item.state === "failed",
  );
  const model = connections.find((item) => item.id === "model");
  const hetzner = connections.find((item) => item.id === "hetzner");
  const connectedCount = connections.filter(
    (item) => item.state === "connected",
  ).length;
  /**
   * One blue action at most, and only where someone is needed: a credential
   * that stopped working, or no model at all. Everything else not set up is an
   * offer and stays quiet.
   */
  const leading =
    needing[0]?.id ?? (model?.state === "not-connected" ? "model" : undefined);

  const connected = () => {
    setOpen(null);
    router.refresh();
  };
  const row = (item: ConnectionItem) => (
    <li
      key={item.id}
      className={`hv-connection hv-connection-${item.state}`}
      data-state={item.state}
      aria-label={item.name}
    >
      <div className={s.row}>
        <span className={s.rowIcon}>{ICONS[item.id] ?? <Plugs />}</span>
        <span className={s.rowText}>
          <h3>{item.name}</h3>
          <small>{item.detail}</small>
          {item.credential && <small>{item.credential}</small>}
          {item.usedBy && item.usedBy.length > 0 && (
            <small>Used by {item.usedBy.join(", ")}</small>
          )}
          {item.note && <small>{item.note}</small>}
        </span>
        <span className={s.rowSide}>
          {item.state === "connected" ? (
            <span className={`hv-connection-state ${s.ok}`}>
              <Check weight="bold" aria-hidden="true" /> Connected
            </span>
          ) : item.state !== "not-connected" ? (
            <span className={`hv-connection-state ${s.warn}`}>
              <Warning weight="bold" aria-hidden="true" />
              {item.state === "expired" ? "Expired" : "Failing"}
            </span>
          ) : null}
          {item.action.kind === "link" ? (
            <Link
              className={item.id === leading ? `${s.btn} ${s.primary}` : s.link}
              href={
                item.action.href.startsWith("/setup/")
                  ? `${item.action.href}${returnTo?.query ?? ""}`
                  : item.action.href
              }
            >
              {item.action.label}
              {item.id !== leading && <CaretRight aria-hidden="true" />}
            </Link>
          ) : (
            <button
              type="button"
              className={item.id === leading ? `${s.btn} ${s.primary}` : s.btn}
              aria-expanded={open === item.action.form}
              onClick={() =>
                setOpen((current) =>
                  item.action.kind === "form" && current === item.action.form
                    ? null
                    : item.action.kind === "form"
                      ? item.action.form
                      : null,
                )
              }
            >
              {open === item.action.form ? "Close" : item.action.label}
            </button>
          )}
        </span>
      </div>
      {item.action.kind === "form" && open === item.action.form && (
        <div className={s.rowMore}>
          {item.action.form === "backup-storage" ? (
            <BackupStorageForm
              className={h.connectForm}
              onConnected={async () => connected()}
            />
          ) : item.action.form === "model" ? (
            // The same card the conversation draws, so there is one account
            // sign-in in the product rather than two.
            <ModelConnect
              plain
              settingsHref={`/setup/pi${returnTo?.query ?? ""}`}
              onConnected={connected}
            />
          ) : item.action.form === "github" ? (
            // It stays open on its own receipt; only the row above it, which
            // the server drew, has to be told.
            <GithubConnect plain onConnected={() => router.refresh()} />
          ) : (
            <ProviderTokenForm
              provider={item.action.form}
              onConnected={connected}
              onCancel={() => setOpen(null)}
            />
          )}
        </div>
      )}
    </li>
  );

  return (
    <SettingsShell
      current="connections"
      title="Connections"
      lead="Every account Hallvi acts through, and what each one allows."
      returnTo={returnTo}
    >
      {prototype && (
        <p className="hv-reference-banner">
          Prototype · invented connections. Real model, GitHub and workspace
          settings run on the other pages.
        </p>
      )}
      <section className={s.hero} aria-label="What Hallvi can do">
        <div>
          <span className={s.eyebrow}>
            {connectedCount} of {connections.length} connected
          </span>
          <h3>
            {model?.state !== "connected"
              ? "Connect a model to start"
              : hetzner?.state === "connected"
                ? "Hallvi can read, plan and deploy"
                : "Hallvi can read and plan"}
          </h3>
          <p>
            {model?.state !== "connected"
              ? "Everything else can wait until an application needs it."
              : hetzner?.state === "connected"
                ? "Servers, domains and backups follow each application’s permission mode."
                : "Rent servers with Hetzner, or bring one of your own."}
          </p>
          {needing.length > 0 && (
            <p className={s.problem} role="status">
              <Warning aria-hidden="true" /> {needing.length} connection
              {needing.length === 1 ? "" : "s"} need
              {needing.length === 1 ? "s" : ""} attention. Work that depends on{" "}
              {needing.length === 1 ? "it" : "them"} pauses and shows the reason
              in the application.
            </p>
          )}
        </div>
        <ul className={s.dots} aria-hidden="true">
          {connections.map((item) => (
            <li key={item.id} data-state={item.state} title={item.name}>
              {ICONS[item.id] ?? <Plugs />}
            </li>
          ))}
        </ul>
      </section>

      <h3 className={s.groupTitle}>Hallvi</h3>
      <ul className={s.rows} aria-label="Hallvi’s own accounts">
        {connections.filter((item) => OWN.includes(item.id)).map(row)}
      </ul>
      <h3 className={s.groupTitle}>Your providers</h3>
      <ul className={s.rows} aria-label="Your providers">
        {connections.filter((item) => !OWN.includes(item.id)).map(row)}
      </ul>
      {recoveryKit && <RecoveryKit kit={recoveryKit} />}
      <p className={s.fine}>
        Connecting an account changes nothing by itself. What happens next
        follows each application&rsquo;s permission mode: Always ask waits for
        you on every command, Hallvi decides asks at Hallvi&rsquo;s own
        judgment, and Bypass runs without asking.
      </p>
    </SettingsShell>
  );
}
