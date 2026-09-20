"use client";

// Which Hallvi this is.
//
// A controller is opened at a loopback address, on the machine itself or
// through an SSH connection from another one, and nothing on the page said
// which. With two installations that is two identical tabs. The machine's name
// goes in the tab title and beside the product name, quietly, everywhere.

import { useEffect, useState } from "react";

let asked: Promise<string | null> | undefined;

function hostName() {
  asked ??= fetch("/api/host", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => (typeof body?.name === "string" ? body.name : null))
    .catch(() => null);
  return asked;
}

export function useHostName() {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void hostName().then((found) => alive && setName(found));
    return () => {
      alive = false;
    };
  }, []);
  return name;
}

/** "on mac-mini", for beside the product name. Nothing until it is known. */
export function HostName({ className }: { className?: string }) {
  const name = useHostName();
  if (!name) return null;
  return (
    <span className={className} title={`This Hallvi runs on ${name}`}>
      on {name}
    </span>
  );
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
