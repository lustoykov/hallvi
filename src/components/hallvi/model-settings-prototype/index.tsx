"use client";

// PROTOTYPE — the host for the three Settings → Model directions. Keeps the
// real top bar, settings navigation and heading; only the body changes.

import { ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";

import type { PiSetupStatus } from "@/server/pi-setup";

import { HallviMark } from "../hallvi-mark";
import { SettingsNav } from "../settings-nav";
import s from "../pi-setup-screen.module.css";
import { useModelSettings, type Connections } from "./shared";
import { PrototypeSwitcher } from "./switcher";
import { VariantA } from "./variant-a";
import { VariantB } from "./variant-b";
import { VariantC } from "./variant-c";
import "./prototype.css";

const START: Record<string, Connections> = {
  none: { chatgpt: false, openrouter: false },
  chatgpt: { chatgpt: true, openrouter: false },
  openrouter: { chatgpt: false, openrouter: true },
  both: { chatgpt: true, openrouter: true },
};

function Body({
  variant,
  status,
  state,
}: {
  variant: string;
  status: PiSetupStatus;
  state: string;
}) {
  const settings = useModelSettings(status, START[state] ?? START.none!);
  return variant === "B" ? (
    <VariantB s={settings} />
  ) : variant === "C" ? (
    <VariantC s={settings} />
  ) : (
    <VariantA s={settings} />
  );
}

export function ModelSettingsPrototype({
  variant,
  state,
  status,
}: {
  variant: string;
  state: string;
  status: PiSetupStatus;
}) {
  return (
    <main className={"hv-setup-shell " + s.root}>
      <header className="hv-setup-topbar">
        <Link className="hv-setup-brand" href="/" aria-label="Hallvi">
          <HallviMark size={22} />
          <span>Hallvi</span>
        </Link>
        <Link className="hv-setup-back" href="/applications">
          <ArrowLeft /> All applications
        </Link>
      </header>
      <div className={s.page} data-variant={variant}>
        <SettingsNav current="pi" />
        <header className={s.heading}>
          <div>
            <h1>Settings</h1>
            <p>
              The model Hallvi thinks with, and the account that pays for it.
            </p>
          </div>
        </header>
        {/* Remount per variant and state so each starts clean. */}
        <Body
          key={`${variant}-${state}`}
          variant={variant}
          status={status}
          state={state}
        />
      </div>
      <PrototypeSwitcher variant={variant} state={state} />
    </main>
  );
}
