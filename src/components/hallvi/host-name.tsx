"use client";

// Which Hallvi this is.
//
// A controller is opened at a loopback address, on the machine itself or
// through an SSH connection from another one, and nothing on the page said
// which. With two installations that is two identical tabs. The machine's name
// goes in the tab title and beside the product name, quietly, everywhere.

import Link from "next/link";
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
 * The quietest possible word that a newer Hallvi exists: two, and a link to
 * the one place that can install it. No badge, no count, and nothing that
 * comes back after it has been read, because the answer only changes when a
 * release does.
 *
 * It sits beside the product name rather than inside that link, which is where
 * it belongs and also the only place it may be: a link inside a link is not
 * markup a browser will keep.
 */
export function UpdateAvailable({ className }: { className?: string }) {
  const { update } = useThisHallvi();
  if (!update) return null;
  return (
    <Link
      className={`hv-update-hint${className ? ` ${className}` : ""}`}
      href="/setup/connections#hallvi-version"
      title={`Hallvi ${update.version} is available`}
    >
      Update available
    </Link>
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
