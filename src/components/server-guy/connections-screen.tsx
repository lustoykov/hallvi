"use client";

import { ArrowLeft, Check, Warning } from "@phosphor-icons/react";
import Link from "next/link";

import { SettingsNav } from "./settings-nav";
import s from "./pi-setup-screen.module.css";

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
  href: string;
  action: string;
}

export function ConnectionsScreen({
  connections,
  prototype = false,
}: {
  connections: ConnectionItem[];
  prototype?: boolean;
}) {
  const needing = connections.filter(
    (item) => item.state === "expired" || item.state === "failed",
  );
  return (
    <main className={`sg-setup-shell ${s.root}`}>
      <header className="sg-setup-topbar">
        <Link className="sg-setup-brand" href="/applications">
          <span className="sg-app-mark">SG</span>
          <span>Server Guy</span>
        </Link>
        <Link className="sg-setup-back" href="/applications">
          <ArrowLeft aria-hidden="true" /> All applications
        </Link>
      </header>
      <div className={s.page}>
        <SettingsNav current="connections" />
        <header className={s.heading}>
          <h1>Settings</h1>
          <p>
            Connections: the accounts Server Guy acts through, and what each one
            is allowed to do.
          </p>
        </header>
        {prototype && (
          <p className="sg-reference-banner">
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
              className={`${s.section} sg-connection sg-connection-${item.state}`}
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
                  className={`sg-connection-state sg-connection-${item.state}`}
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
                </div>
                <Link
                  className={
                    item.state === "connected" ? s.textButton : s.primary
                  }
                  href={item.href}
                >
                  {item.action}
                </Link>
              </div>
            </section>
          ))}
        </section>
        <p className={s.hint}>
          Connecting an account never authorises spending or changes on its own.
          Each purchase, deployment or change is approved in the conversation
          that proposes it, with its cost and scope.
        </p>
      </div>
    </main>
  );
}
