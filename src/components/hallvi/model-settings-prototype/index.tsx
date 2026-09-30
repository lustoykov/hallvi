"use client";

// PROTOTYPE — Settings in direction A's language across all four pages, with
// the shell as the open question: today's top tabs, or a sidebar the way
// Claude's settings are laid out. The real top bar stays; sign-ins, tokens and
// choices are simulated in memory and nothing is saved.

import {
  ArrowLeft,
  Brain,
  Cube,
  GitBranch,
  Plugs,
} from "@phosphor-icons/react";
import Link from "next/link";
import type { ReactNode } from "react";

import type { PiSetupStatus } from "@/server/pi-setup";

import { HallviMark } from "../hallvi-mark";
import { ConnectionsPage } from "./page-connections";
import { GithubPage } from "./page-github";
import { WorkspacePage } from "./page-workspace";
import { useModelSettings, type Connections } from "./shared";
import { PrototypeSwitcher, type SettingsPage } from "./switcher";
import { VariantA } from "./variant-a";
import "./prototype.css";

export interface ProtoApplication {
  id: string;
  name: string;
  repository: string;
}

const PAGES: {
  key: SettingsPage;
  href: string;
  name: string;
  icon: ReactNode;
  lead: string;
}[] = [
  {
    key: "connections",
    href: "/setup/connections",
    name: "Connections",
    icon: <Plugs />,
    lead: "Everything Hallvi acts through, at a glance.",
  },
  {
    key: "pi",
    href: "/setup/pi",
    name: "Model",
    icon: <Brain />,
    lead: "What Hallvi thinks with, and who pays for it.",
  },
  {
    key: "github",
    href: "/setup/github",
    name: "GitHub",
    icon: <GitBranch />,
    lead: "Reading private repositories you choose.",
  },
  {
    key: "workspace",
    href: "/setup/workspace",
    name: "Workspace",
    icon: <Cube />,
    lead: "Where Pi works on its copy of your code.",
  },
];

const MODEL_START: Record<string, Connections> = {
  none: { chatgpt: false, openrouter: false },
  chatgpt: { chatgpt: true, openrouter: false },
  openrouter: { chatgpt: false, openrouter: true },
  both: { chatgpt: true, openrouter: true },
};

function ModelPage({
  status,
  state,
}: {
  status: PiSetupStatus;
  state: string;
}) {
  const settings = useModelSettings(
    status,
    MODEL_START[state] ?? MODEL_START.none!,
  );
  return <VariantA s={settings} />;
}

export function SettingsPrototype({
  page,
  shell,
  state,
  status,
  applications,
}: {
  page: SettingsPage;
  shell: string;
  state: string;
  status: PiSetupStatus;
  applications: ProtoApplication[];
}) {
  const current = PAGES.find((item) => item.key === page)!;
  const query = `?variant=A&shell=${shell}`;
  const nav = (
    <nav className="msp-nav" data-shell={shell} aria-label="Settings">
      {PAGES.map((item) => (
        <Link
          key={item.key}
          href={item.href + query}
          aria-current={item.key === page ? "page" : undefined}
        >
          {shell === "sidebar" && item.icon}
          {item.name}
        </Link>
      ))}
    </nav>
  );
  const body =
    page === "pi" ? (
      <ModelPage status={status} state={state} />
    ) : page === "github" ? (
      <GithubPage state={state} applications={applications} />
    ) : page === "workspace" ? (
      <WorkspacePage state={state} />
    ) : (
      <ConnectionsPage state={state} applications={applications} />
    );

  return (
    <main className="hv-setup-shell msp-shell" data-shell={shell}>
      <header className="hv-setup-topbar">
        <Link className="hv-setup-brand" href="/" aria-label="Hallvi">
          <HallviMark size={22} />
          <span>Hallvi</span>
        </Link>
        <Link className="hv-setup-back" href="/applications">
          <ArrowLeft /> All applications
        </Link>
      </header>
      {shell === "sidebar" ? (
        <div className="msp-sidebar-layout">
          <aside>
            <h1>Settings</h1>
            {nav}
          </aside>
          <section>
            <header className="msp-page-head">
              <h2>{current.name}</h2>
              <p>{current.lead}</p>
            </header>
            {/* Remount per page and state so each starts clean. */}
            <div key={`${page}-${state}`}>{body}</div>
          </section>
        </div>
      ) : (
        <div className="msp-tabs-layout">
          {nav}
          <header className="msp-page-head">
            <h1>{current.name}</h1>
            <p>{current.lead}</p>
          </header>
          <div key={`${page}-${state}`}>{body}</div>
        </div>
      )}
      <PrototypeSwitcher page={page} variant="A" shell={shell} state={state} />
    </main>
  );
}
