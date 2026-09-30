"use client";

// PROTOTYPE — Connections in direction A's language: one raised line that says
// whether Hallvi can work, then two quiet groups. Hallvi's own three link to
// their pages; the owner's providers take a token right in the row. A missing
// provider is an offer, never a warning.

import {
  Archive,
  Brain,
  CaretRight,
  Check,
  Cloud,
  Cube,
  GitBranch,
  Globe,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import type { ProtoApplication } from ".";
import { Toast } from "./shared";

interface Row {
  id: string;
  name: string;
  icon: ReactNode;
  on: string;
  off: string;
  href?: string;
  token?: string;
}

const OWN: Row[] = [
  {
    id: "model",
    name: "Model",
    icon: <Brain />,
    on: "Claude Sonnet 5 through OpenRouter",
    off: "Needed to read, plan and reply",
    href: "/setup/pi",
  },
  {
    id: "github",
    name: "GitHub",
    icon: <GitBranch />,
    on: "Signed in as lyubomir · 3 repositories",
    off: "Only for private repositories",
    href: "/setup/github",
  },
  {
    id: "workspace",
    name: "Workspace",
    icon: <Cube />,
    on: "On this computer",
    off: "On this computer",
    href: "/setup/workspace",
  },
];
const PROVIDERS: Row[] = [
  {
    id: "hetzner",
    name: "Hetzner Cloud",
    icon: <Cloud />,
    on: "Project token · added 12 Sep",
    off: "Rent servers for your applications",
    token: "Hetzner API token",
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    icon: <Globe />,
    on: "DNS for example.com · R2 on the same account",
    off: "Your domains and their DNS",
    token: "Cloudflare API token",
  },
  {
    id: "backups",
    name: "Backup storage",
    icon: <Archive />,
    on: "Bucket hallvi-backups",
    off: "Off-site copies of your data",
    token: "R2 access key",
  },
];
const START: Record<string, string[]> = {
  none: ["workspace"],
  some: ["model", "workspace", "hetzner"],
  all: ["model", "github", "workspace", "hetzner", "cloudflare", "backups"],
};

export function ConnectionsPage({
  state,
  applications,
}: {
  state: string;
  applications: ProtoApplication[];
}) {
  const [on, setOn] = useState<string[]>(START[state] ?? START.none!);
  const [open, setOpen] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const model = on.includes("model");
  const connectedCount = on.length;

  function save(row: Row) {
    setOn((now) => [...now, row.id]);
    setOpen(null);
    setToast(`${row.name} connected`);
    window.setTimeout(() => setToast(null), 2400);
  }

  const line = (row: Row, editable: boolean) => {
    const connected = on.includes(row.id);
    return (
      <li key={row.id} data-on={connected ? "" : undefined}>
        <div className="msp-row">
          <span className="msp-row-icon">{row.icon}</span>
          <span className="msp-row-text">
            <strong>{row.name}</strong>
            <small>{connected ? row.on : row.off}</small>
          </span>
          {row.href ? (
            <Link className="msp-row-go" href={`${row.href}?variant=A`}>
              {connected ? (
                <span className="msp-ok">
                  <Check weight="bold" /> Connected
                </span>
              ) : row.id === "model" ? (
                <span className="msp-btn msp-btn-primary">Connect</span>
              ) : (
                <span className="msp-muted">Set up</span>
              )}
              <CaretRight />
            </Link>
          ) : connected ? (
            <span className="msp-row-actions">
              <span className="msp-ok">
                <Check weight="bold" /> Connected
              </span>
              <button
                type="button"
                className="msp-link msp-muted"
                onClick={() =>
                  setOn((now) => now.filter((id) => id !== row.id))
                }
              >
                Remove
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="msp-btn"
              onClick={() => setOpen(open === row.id ? null : row.id)}
            >
              {open === row.id ? "Cancel" : "Connect"}
            </button>
          )}
        </div>
        {editable && open === row.id && (
          <form
            className="msp-row-form"
            onSubmit={(event) => {
              event.preventDefault();
              save(row);
            }}
          >
            <input
              type="password"
              placeholder={`Paste your ${row.token}`}
              autoFocus
              autoComplete="off"
            />
            <button type="submit" className="msp-btn msp-btn-primary">
              Save
            </button>
            <a href="#" onClick={(event) => event.preventDefault()}>
              Where do I get one?
            </a>
          </form>
        )}
      </li>
    );
  };

  return (
    <div className="msp-a msp-page">
      <section className="msp-hero">
        <div>
          <span className="msp-eyebrow">
            {connectedCount} of {OWN.length + PROVIDERS.length} connected
          </span>
          <h2>
            {!model
              ? "Connect a model to start"
              : on.includes("hetzner")
                ? "Hallvi can read, plan and deploy"
                : "Hallvi can read and plan"}
          </h2>
          <p>
            {!model
              ? "Everything else can wait until an application needs it."
              : on.includes("hetzner")
                ? `Working on ${applications.length} application${applications.length === 1 ? "" : "s"}.`
                : "Connect Hetzner when you want Hallvi to rent a server."}
          </p>
        </div>
        <ul className="msp-hero-dots" aria-hidden="true">
          {[...OWN, ...PROVIDERS].map((row) => (
            <li
              key={row.id}
              data-on={on.includes(row.id) ? "" : undefined}
              title={row.name}
            >
              {row.icon}
            </li>
          ))}
        </ul>
      </section>

      <h3 className="msp-group-title">Hallvi</h3>
      <ul className="msp-rows">{OWN.map((row) => line(row, false))}</ul>

      <h3 className="msp-group-title">Your providers</h3>
      <ul className="msp-rows">{PROVIDERS.map((row) => line(row, true))}</ul>

      <p className="msp-fine">
        Connecting changes nothing by itself. What Hallvi then does follows each
        application’s permission mode.
      </p>
      <Toast text={toast} />
    </div>
  );
}
