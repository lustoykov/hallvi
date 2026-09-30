"use client";

// PROTOTYPE — the floating bar: new design vs today's (← →), the settings
// shell (top tabs or a sidebar), and the states each page has to handle.
// Never shipped.

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export const VARIANTS = [
  { key: "A", name: "New design" },
  { key: "current", name: "Today’s page" },
] as const;
export const SHELLS = [
  { key: "tabs", name: "Tabs" },
  { key: "sidebar", name: "Sidebar" },
] as const;
export type SettingsPage = "connections" | "pi" | "github" | "workspace";
export const STATES: Record<SettingsPage, { key: string; name: string }[]> = {
  pi: [
    { key: "none", name: "Nothing" },
    { key: "chatgpt", name: "ChatGPT" },
    { key: "openrouter", name: "OpenRouter" },
    { key: "both", name: "Both" },
  ],
  connections: [
    { key: "none", name: "Fresh" },
    { key: "some", name: "Partly" },
    { key: "all", name: "Everything" },
  ],
  github: [
    { key: "none", name: "Signed out" },
    { key: "some", name: "Signed in" },
  ],
  workspace: [
    { key: "none", name: "Docker running" },
    { key: "some", name: "Docker stopped" },
  ],
};

export function PrototypeSwitcher({
  page,
  variant,
  shell,
  state,
}: {
  page: SettingsPage;
  variant: string;
  shell: string;
  state: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const index = Math.max(
    0,
    VARIANTS.findIndex((item) => item.key === variant),
  );
  const go = (next: Record<string, string>) => {
    const query = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) query.set(key, value);
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
      <span className="msp-switcher-label">{VARIANTS[index]!.name}</span>
      <button type="button" onClick={() => step(1)} aria-label="Next">
        <CaretRight weight="bold" />
      </button>
      {variant !== "current" && (
        <>
          <span className="msp-switcher-states">
            {SHELLS.map((item) => (
              <button
                key={item.key}
                type="button"
                data-on={item.key === shell ? "" : undefined}
                onClick={() => go({ shell: item.key })}
              >
                {item.name}
              </button>
            ))}
          </span>
          <span className="msp-switcher-states">
            {STATES[page].map((item) => (
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
        </>
      )}
    </div>
  );
}
