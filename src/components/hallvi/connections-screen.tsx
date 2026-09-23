"use client";

import { HallviMark } from "./hallvi-mark";
import { ArrowLeft, Check, Warning } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChatgptConnect } from "./onboarding/chatgpt-connect";
import { GithubConnect } from "./onboarding/github-connect";
import { ProviderTokenForm } from "./provider-token-form";
import type { SetupReturn } from "@/server/setup-return";
import { SettingsNav } from "./settings-nav";
import { BackupStorageForm } from "./backup-storage-form";
import s from "./pi-setup-screen.module.css";

/** A credential this page can take, on this page, in a field. */
export type ConnectionForm =
  | "hetzner"
  | "cloudflare"
  | "backup-storage"
  /** The two accounts Hallvi itself signs in to, as their own cards. */
  | "chatgpt"
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
    <section className={s.card} aria-label="Hallvi recovery kit">
      <section className={s.section}>
        <h2>
          <span className={s.step} aria-hidden="true">
            {kit.confirmedAt ? <Check /> : <Warning />}
          </span>
          Hallvi recovery kit
        </h2>
        <p className={s.hint}>
          Hallvi copies its own records and keys into <code>{kit.bucket}</code>{" "}
          at {kit.host}. The copies are encrypted, and this passphrase is the
          only thing that opens them.
        </p>
        <div className={s.accountRow}>
          <div>
            <p>
              {kit.confirmedAt
                ? "You have said this is saved outside this machine."
                : "Not saved yet. Keep it in your password manager."}
            </p>
            {shown && (
              <>
                <code className={s.recoveryCode} data-recovery-passphrase="">
                  {shown.passphrase}
                </code>
                <p className={s.hint}>{shown.endpoint}</p>
              </>
            )}
            {error && (
              <p className={s.hint} role="alert">
                {error}
              </p>
            )}
          </div>
          {!shown && (
            <button
              type="button"
              className={s.textButton}
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
      </section>
    </section>
  );
}

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
  /**
   * One dominant action. Five rows that all need connecting used to draw five
   * blue buttons, which says everything is equally urgent and therefore
   * nothing is. The first row that wants the owner keeps the blue; the rest
   * stay available and quiet.
   */
  const leading = connections.find((item) => item.state !== "connected")?.id;

  const connected = () => {
    setOpen(null);
    router.refresh();
  };
  return (
    <main className={`hv-setup-shell ${s.root}`}>
      <header className="hv-setup-topbar">
        <Link className="hv-setup-brand" href="/applications">
          <HallviMark size={28} onDark />
          <span>Hallvi</span>
        </Link>
        <Link
          className="hv-setup-back"
          href={returnTo?.href ?? "/applications"}
        >
          <ArrowLeft aria-hidden="true" />{" "}
          {returnTo?.label ?? "All applications"}
        </Link>
      </header>
      <div className={s.page}>
        <SettingsNav current="connections" returnTo={returnTo} />
        <header className={s.heading}>
          <h1>Settings</h1>
          <p>
            Every account Hallvi acts through, what it is allowed to do, and
            what is missing.
          </p>
        </header>
        {prototype && (
          <p className="hv-reference-banner">
            Prototype · invented connections. Real ChatGPT, GitHub and Execution
            settings run on the other pages.
          </p>
        )}
        {needing.length > 0 && (
          <p className={s.hint} role="status">
            <Warning aria-hidden="true" /> {needing.length} connection
            {needing.length === 1 ? "" : "s"} need
            {needing.length === 1 ? "s" : ""} attention. Work that depends on{" "}
            {needing.length === 1 ? "it" : "them"} pauses and shows the reason
            in the application.
          </p>
        )}
        <section className={s.card} aria-label="Connections">
          {connections.map((item) => (
            <section
              className={`${s.section} hv-connection hv-connection-${item.state}`}
              key={item.id}
              aria-label={item.name}
            >
              <h2>
                <span className={s.step} aria-hidden="true">
                  {item.state === "connected" ? (
                    <Check />
                  ) : item.state === "not-connected" ? (
                    "·"
                  ) : (
                    <Warning />
                  )}
                </span>
                {item.name}
                <em
                  className={`hv-connection-state hv-connection-${item.state}`}
                >
                  {item.state === "connected"
                    ? "Connected"
                    : item.state === "expired"
                      ? "Expired"
                      : item.state === "failed"
                        ? "Failing"
                        : "Not connected"}
                </em>
              </h2>
              <p className={s.hint}>{item.purpose}</p>
              <div className={s.accountRow}>
                <div>
                  <p>{item.detail}</p>
                  {item.credential && (
                    <p className={s.hint}>{item.credential}</p>
                  )}
                  {item.usedBy && item.usedBy.length > 0 && (
                    <p className={s.hint}>Used by {item.usedBy.join(", ")}</p>
                  )}
                  {item.note && <p className={s.hint}>{item.note}</p>}
                </div>
                {item.action.kind === "link" ? (
                  <Link
                    className={`${
                      item.id === leading ? s.primary : s.textButton
                    } ${s.connectionAction}`}
                    href={
                      item.action.href.startsWith("/setup/")
                        ? `${item.action.href}${returnTo?.query ?? ""}`
                        : item.action.href
                    }
                  >
                    {item.action.label}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={`${
                      item.id === leading ? s.primary : s.textButton
                    } ${s.connectionAction}`}
                    aria-expanded={open === item.action.form}
                    onClick={() =>
                      setOpen((current) =>
                        item.action.kind === "form" &&
                        current === item.action.form
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
              </div>
              {item.action.kind === "form" &&
                open === item.action.form &&
                (item.action.form === "backup-storage" ? (
                  <BackupStorageForm
                    className={s.connectForm}
                    onConnected={async () => connected()}
                  />
                ) : item.action.form === "chatgpt" ? (
                  // The same card the conversation draws, so there is one
                  // account sign-in in the product rather than two.
                  <ChatgptConnect
                    plain
                    settingsHref={`/setup/pi${returnTo?.query ?? ""}`}
                    onConnected={connected}
                  />
                ) : item.action.form === "github" ? (
                  // It stays open on its own receipt; only the row above it,
                  // which the server drew, has to be told.
                  <GithubConnect plain onConnected={() => router.refresh()} />
                ) : (
                  <ProviderTokenForm
                    provider={item.action.form}
                    onConnected={connected}
                    onCancel={() => setOpen(null)}
                  />
                ))}
            </section>
          ))}
        </section>
        {recoveryKit && <RecoveryKit kit={recoveryKit} />}
        <p className={s.hint}>
          Connecting an account changes nothing by itself. What happens next
          follows each application&rsquo;s permission mode: Always ask waits for
          you on every command, Hallvi decides asks at Hallvi&rsquo;s own
          judgment, and Bypass runs without asking.
        </p>
      </div>
    </main>
  );
}
