"use client";

// Which Hallvi this is.
//
// A controller is opened at a loopback address, on the machine itself or
// through an SSH connection from another one, and nothing said which. With two
// installations that is two identical tabs, so the machine's name goes in the
// tab title, where two tabs are told apart. The version at the foot of the
// sidebar names it too, for anyone who asks the page itself.
//
// A checkout runs on the same machine as the installed Hallvi, so the
// machine's name does not tell them apart. A checkout leads its tab title with
// "Dev" and what it is, wears a green mascot in the tab, and says so in the
// strip at the top of every page.

import { useEffect, useState } from "react";

interface ThisHallvi {
  name: string | null;
  /** Set when this Hallvi runs from a checkout rather than an installation. */
  development: { checkout: string; application: string | null } | null;
}

let asked: Promise<ThisHallvi> | undefined;

function thisHallvi() {
  asked ??= fetch("/api/host", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => ({
      name: typeof body?.name === "string" ? body.name : null,
      development:
        typeof body?.development?.checkout === "string"
          ? {
              checkout: body.development.checkout as string,
              application:
                typeof body.development.application === "string"
                  ? (body.development.application as string)
                  : null,
            }
          : null,
    }))
    .catch(() => ({ name: null, development: null }));
  return asked;
}

function useThisHallvi() {
  const [value, setValue] = useState<ThisHallvi>({
    name: null,
    development: null,
  });
  useEffect(() => {
    let alive = true;
    void thisHallvi().then((found) => alive && setValue(found));
    return () => {
      alive = false;
    };
  }, []);
  return value;
}

/** The mascot from `icon.svg` with a green body: the tab of a checkout. */
const DEVELOPMENT_ICON = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 36"><path d="M13 9V3.5M23 9V3.5" stroke="#0b5e3c" stroke-width="1.4"/><circle cx="13" cy="2.6" r="1.9" fill="#9fe0c0"/><circle cx="23" cy="2.6" r="1.9" fill="#9fe0c0"/><rect x="5" y="8" width="26" height="24" rx="5.5" fill="#14945f"/><rect x="7.5" y="11" width="21" height="11" rx="3.5" fill="#192338"/><rect x="13" y="14" width="2.2" height="4.4" rx="1.1" fill="#eaf8f1"/><rect x="20.8" y="14" width="2.2" height="4.4" rx="1.1" fill="#eaf8f1"/><path d="M9 32h7v2.5H9zM20 32h7v2.5h-7z" fill="#0b5e3c"/></svg>`,
)}`;

/**
 * Keeps the tab saying which Hallvi it is: the machine's name at the end of
 * the title, or "Dev" and the checkout at its start. Pages set their own
 * titles and icons as they load, so this follows the head rather than a route.
 */
export function HostTitle() {
  const { name, development } = useThisHallvi();
  useEffect(() => {
    if (!name) return;
    const prefix = development
      ? `Dev · ${development.application ?? development.checkout} · `
      : "";
    const suffix = development ? "" : ` · ${name}`;
    const apply = () => {
      if (!document.title.startsWith(prefix))
        document.title = prefix + document.title;
      if (!document.title.endsWith(suffix)) document.title += suffix;
      if (!development) return;
      for (const icon of document.querySelectorAll<HTMLLinkElement>(
        'link[rel="icon"]',
      ))
        if (icon.href !== DEVELOPMENT_ICON) {
          icon.href = DEVELOPMENT_ICON;
          icon.type = "image/svg+xml";
        }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [name, development]);
  return null;
}

/** The chip in the top strip of a checkout; nothing in an installation. */
export function DevelopmentLabel() {
  const { development } = useThisHallvi();
  if (!development) return null;
  const { checkout, application } = development;
  return (
    <span
      className="hv-development-label"
      title={
        application
          ? `Development checkout ${checkout}, attached to the retained application ${application}. Not the installed Hallvi.`
          : `Development checkout ${checkout}. Not the installed Hallvi.`
      }
    >
      Dev · {application ?? checkout}
    </span>
  );
}
