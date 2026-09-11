"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// The header the redesigned destinations draw for themselves, as Overview
// and Architecture do: the way back, the title, and "Open <app>" with who can
// reach it.

import { ArrowSquareOut, ShieldCheck } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function PageHead({
  bar,
  title,
  name,
  openUrl,
  restricted,
}: {
  bar: ReactNode;
  title: string;
  name: string;
  openUrl: string | null;
  restricted: boolean;
}) {
  return (
    <header className="axj3-head">
      {bar && <div className="axj3-bar">{bar}</div>}
      <div className="axj3-title">
        <h1>{title}</h1>
        {openUrl && (
          <div className="axj3-open">
            {restricted && (
              <small>
                <ShieldCheck weight="bold" /> Only from your network
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
