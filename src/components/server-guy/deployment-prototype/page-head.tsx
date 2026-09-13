"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// The header the redesigned destinations draw for themselves, as Overview
// and Architecture do: the way back, the title, and "Open <app>" with who can
// reach it.

import {
  ArrowSquareOut,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function PageHead({
  bar,
  title,
  name,
  openUrl,
  restricted,
  reachable = true,
}: {
  bar: ReactNode;
  title: string;
  name: string;
  openUrl: string | null;
  restricted: boolean;
  /**
   * Whether the way in still works. A private URL lives inside an SSH tunnel
   * this controller holds, and that tunnel dies with a restart — so the link
   * a reader is most likely to click was the one most likely to be dead,
   * offered without a word.
   */
  reachable?: boolean;
}) {
  return (
    <header className="axj3-head">
      {bar && <div className="axj3-bar">{bar}</div>}
      <div className="axj3-title">
        <h1>{title}</h1>
        {openUrl && (
          <div className="axj3-open" data-unreachable={!reachable || undefined}>
            {reachable ? (
              restricted && (
                <small>
                  <ShieldCheck weight="bold" /> Only from your network
                </small>
              )
            ) : (
              <small className="axj3-closed">
                <WarningCircle weight="bold" /> The tunnel is closed
              </small>
            )}
            <a href={openUrl} target="_blank" rel="noreferrer">
              Open {name}
              <ArrowSquareOut weight="bold" />
            </a>
          </div>
        )}
      </div>
    </header>
  );
}
