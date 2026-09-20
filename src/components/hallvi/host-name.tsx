"use client";

// Which Hallvi this is.
//
// A controller is opened at a loopback address, on the machine itself or
// through an SSH connection from another one, and nothing said which. With two
// installations that is two identical tabs, so the machine's name goes in the
// tab title, where two tabs are told apart. The version at the foot of the
// sidebar names it too, for anyone who asks the page itself.

import { useEffect, useState } from "react";

interface ThisHallvi {
  name: string | null;
  /** A newer release the last check found, or nothing. */
  update: { version: string } | null;
}

let asked: Promise<ThisHallvi> | undefined;

function thisHallvi() {
  asked ??= fetch("/api/host", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => ({
      name: typeof body?.name === "string" ? body.name : null,
      update:
        typeof body?.update?.version === "string"
          ? { version: body.update.version as string }
          : null,
    }))
    .catch(() => ({ name: null, update: null }));
  return asked;
}

function useThisHallvi() {
  const [value, setValue] = useState<ThisHallvi>({ name: null, update: null });
  useEffect(() => {
    let alive = true;
    void thisHallvi().then((found) => alive && setValue(found));
    return () => {
      alive = false;
    };
  }, []);
  return value;
}

export function useHostName() {
  return useThisHallvi().name;
}

/**
 * Keeps the machine's name at the end of the tab title. Pages set their own
 * titles as they load, so this follows the title element rather than a route.
 */
export function HostTitle() {
  const name = useHostName();
  useEffect(() => {
    if (!name) return;
    const suffix = ` · ${name}`;
    const apply = () => {
      if (!document.title.endsWith(suffix)) document.title += suffix;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [name]);
  return null;
}
