"use client";

// PROTOTYPE — the floating bar that flips between variants (← →) and between
// the account states each variant has to handle. Never shipped.

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export const VARIANTS = [
  { key: "A", name: "Model first" },
  { key: "B", name: "Two doors" },
  { key: "C", name: "Settings list" },
  { key: "current", name: "Today’s page" },
] as const;
export const STATES = [
  { key: "none", name: "Nothing connected" },
  { key: "chatgpt", name: "ChatGPT" },
  { key: "openrouter", name: "OpenRouter" },
  { key: "both", name: "Both" },
] as const;

export function PrototypeSwitcher({
  variant,
  state,
}: {
  variant: string;
  state: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const index = Math.max(
    0,
    VARIANTS.findIndex((item) => item.key === variant),
  );
  const go = (next: { variant?: string; state?: string }) => {
    const query = new URLSearchParams(params.toString());
    if (next.variant) query.set("variant", next.variant);
    if (next.state) query.set("state", next.state);
    router.replace(`${pathname}?${query}`, { scroll: false });
  };
  const step = (by: number) =>
    go({
      variant: VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length]!.key,
    });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable]") ||
        event.metaKey ||
        event.ctrlKey
      )
        return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="msp-switcher" role="toolbar" aria-label="Prototype">
      <button type="button" onClick={() => step(-1)} aria-label="Previous">
        <CaretLeft weight="bold" />
      </button>
      <span className="msp-switcher-label">
        <b>{VARIANTS[index]!.key}</b> {VARIANTS[index]!.name}
      </span>
      <button type="button" onClick={() => step(1)} aria-label="Next">
        <CaretRight weight="bold" />
      </button>
      {variant !== "current" && (
        <span className="msp-switcher-states">
          {STATES.map((item) => (
            <button
              key={item.key}
              type="button"
              data-on={item.key === state ? "" : undefined}
              onClick={() => go({ state: item.key })}
            >
              {item.name}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
