"use client";

// PROTOTYPE — the floating variant switcher. Hidden in production builds.
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";

import p from "./prototype.module.css";

export const VARIANTS = [
  { key: "A", name: "Now panel + focused details" },
  { key: "B", name: "Chat cards + integrated header" },
  { key: "C", name: "Current-step bar + outline record" },
] as const;
export type VariantKey = (typeof VARIANTS)[number]["key"];

/** Variants report stubbed actions here; nothing is sent to the server. */
export const PrototypeActionContext = createContext<(label: string) => void>(
  () => undefined,
);
export function usePrototypeAction() {
  return useContext(PrototypeActionContext);
}

export function PrototypeSwitcher({
  current,
  lastAction,
}: {
  current: VariantKey;
  lastAction: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(true);
  const index = VARIANTS.findIndex((variant) => variant.key === current);

  function go(offset: number) {
    const next = VARIANTS[(index + offset + VARIANTS.length) % VARIANTS.length];
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next.key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // go closes over index/searchParams; re-bind when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, searchParams, pathname]);

  if (process.env.NODE_ENV === "production") return null;
  if (!visible)
    return (
      <button
        className={p.switcherMini}
        onClick={() => setVisible(true)}
        type="button"
      >
        Prototype {current}
      </button>
    );
  return (
    <div className={p.switcher} role="group" aria-label="Prototype variants">
      <button
        aria-label="Previous variant"
        onClick={() => go(-1)}
        type="button"
      >
        <CaretLeft weight="bold" />
      </button>
      <span>
        <strong>
          {current} — {VARIANTS[index].name}
        </strong>
        <small>
          {lastAction
            ? `Stubbed: ${lastAction}`
            : "Prototype · actions are stubbed · ← → to switch"}
        </small>
      </span>
      <button aria-label="Next variant" onClick={() => go(1)} type="button">
        <CaretRight weight="bold" />
      </button>
      <button
        className={p.switcherHide}
        onClick={() => setVisible(false)}
        type="button"
        aria-label="Hide the prototype bar"
      >
        Hide
      </button>
    </div>
  );
}
