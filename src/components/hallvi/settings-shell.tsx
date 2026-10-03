"use client";

import {
  ArrowLeft,
  Brain,
  Cube,
  GitBranch,
  Plugs,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";

import type { SetupReturn } from "@/server/setup-return";

import { HallviMark } from "./hallvi-mark";
import s from "./settings.module.css";

export type SettingsPage = "connections" | "pi" | "github" | "workspace";

const PAGES: {
  key: SettingsPage;
  href: string;
  name: string;
  icon: ReactNode;
}[] = [
  // Connections is a real page: it asks each provider whether the
  // credential works rather than reporting that a variable is set.
  {
    key: "connections",
    href: "/setup/connections",
    name: "Connections",
    icon: <Plugs aria-hidden="true" />,
  },
  {
    key: "pi",
    href: "/setup/pi",
    name: "Model",
    icon: <Brain aria-hidden="true" />,
  },
  {
    key: "github",
    href: "/setup/github",
    name: "GitHub",
    icon: <GitBranch aria-hidden="true" />,
  },
  {
    key: "workspace",
    href: "/setup/workspace",
    name: "Workspace",
    icon: <Cube aria-hidden="true" />,
  },
];

function keepSettingsFocusVisible(event: FocusEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.matches(":focus-visible"))
    return;
  if (
    !event.currentTarget.contains(target) ||
    target.closest("dialog, [popover]")
  )
    return;
  const scroller = event.currentTarget.closest<HTMLElement>(".hv-app-content");
  if (!scroller) return;
  const rect = target.getBoundingClientRect();
  const bounds = scroller.getBoundingClientRect();
  const top = Math.max(0, bounds.top) + 8;
  const bottom = Math.min(window.innerHeight, bounds.bottom) - 8;
  if (bottom <= top) return;
  if (rect.height > bottom - top) {
    // Keep a larger control's nearer edge without alternating visible edges.
    if (rect.top > top)
      scroller.scrollBy({ top: rect.top - top, behavior: "instant" });
    else if (rect.bottom < bottom)
      scroller.scrollBy({ top: rect.bottom - bottom, behavior: "instant" });
    return;
  }
  if (rect.top < top)
    scroller.scrollBy({ top: rect.top - top, behavior: "instant" });
  else if (rect.bottom > bottom)
    scroller.scrollBy({ top: rect.bottom - bottom, behavior: "instant" });
}

/**
 * Settings: the top bar, a sidebar of four pages, and the page's own title.
 * Every link keeps the conversation Settings was opened from.
 */
export function SettingsShell({
  current,
  title,
  lead,
  returnTo,
  back,
  children,
}: {
  current: SettingsPage;
  title: string;
  lead: string;
  returnTo?: SetupReturn;
  /** Where the top bar's way out goes when no conversation is waiting. */
  back?: { href: string; label: string };
  children: ReactNode;
}) {
  const query = returnTo?.query ?? "";
  const out = returnTo ??
    back ?? { href: "/applications", label: "All applications" };
  return (
    <main className={`hv-setup-shell ${s.root}`}>
      <header className="hv-setup-topbar">
        <Link className="hv-setup-brand" href="/applications">
          <HallviMark size={22} />
          <span>Hallvi</span>
        </Link>
        <Link className="hv-setup-back" href={out.href}>
          <ArrowLeft aria-hidden="true" /> {out.label}
        </Link>
      </header>
      <div className={s.layout}>
        <aside className={s.sidebar}>
          <h1>Settings</h1>
          <nav className={s.nav} aria-label="Settings">
            {PAGES.map((page) => (
              <Link
                key={page.key}
                href={`${page.href}${query}`}
                aria-current={page.key === current ? "page" : undefined}
              >
                {page.icon}
                {page.name}
              </Link>
            ))}
          </nav>
          {process.env.NODE_ENV === "development" &&
            process.env.NEXT_PUBLIC_HALLVI_DASHBOARD_PORT && (
              <div className={s.developer}>
                <a
                  href={`http://127.0.0.1:${process.env.NEXT_PUBLIC_HALLVI_DASHBOARD_PORT}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Testing dashboard (opens in a new tab)"
                >
                  Testing dashboard
                </a>
                {/* Studio opens on the whole controller database: it has no
                    URL for a table or a row. */}
                {process.env.NEXT_PUBLIC_HALLVI_STUDIO_PORT && (
                  <a
                    href={`https://local.drizzle.studio/?port=${process.env.NEXT_PUBLIC_HALLVI_STUDIO_PORT}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Database in Drizzle Studio (opens in a new tab)"
                  >
                    Database
                  </a>
                )}
              </div>
            )}
        </aside>
        <section
          aria-labelledby="settings-page-title"
          onFocus={keepSettingsFocusVisible}
        >
          <header className={s.head}>
            <h2 id="settings-page-title">{title}</h2>
            <p>{lead}</p>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}

/**
 * Arrow keys for a group of custom radios, as a native radio group has: move
 * to the neighbour, focus it and choose it. Each radio keeps
 * `tabIndex={checked ? 0 : -1}` so Tab enters the group once.
 */
export function radioKeys(event: React.KeyboardEvent<HTMLElement>) {
  const step =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
  if (!step) return;
  const radios = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
  ].filter(
    (radio) =>
      !radio.hasAttribute("disabled") &&
      radio.getAttribute("aria-disabled") !== "true",
  );
  if (!radios.length) return;
  event.preventDefault();
  const at = radios.indexOf(document.activeElement as HTMLElement);
  const next = radios[(at + step + radios.length) % radios.length]!;
  next.focus();
  next.click();
}

/** The quiet confirmation Claude and Codex show after a setting applies. */
export function useToast() {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const show = (next: string) => {
    setText(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(null), 2600);
  };
  const toast = (
    <div className={s.toast} data-show={text ? "" : undefined} role="status">
      {text}
    </div>
  );
  return { show, toast };
}
