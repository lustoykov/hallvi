// What the pulse actually asks, and therefore the only readings it may
// refresh.
//
// The pulse does two things: it requests the application's address, and it
// opens an SSH session to the server. An answer to the first says the
// address answers. It does not say a container's health check still passes,
// that a volume would survive a replacement, or that the database accepts a
// query — a page can load from cache in front of a dead worker. So a reading
// is refreshed only when it asked the same question of the same subject, and
// a lane or a tag is refreshed only when *every* aged reading in it did.
//
// Deliberately narrow. Anything not named here keeps its own age, calmly.

import type { Ref } from "@/server/operator-data";

export type Asked = "app" | "server";

/** "Did the address answer", asked of the application or its way in. */
const ADDRESS_KEYS = new Set(["http", "https", "answering"]);

export function pulseAsks(
  check: { key?: string },
  subject: Pick<Ref, "kind"> | undefined,
): Asked | null {
  if (!check.key || !subject) return null;
  if (subject.kind === "host") return check.key === "ssh" ? "server" : null;
  if (subject.kind === "application" || subject.kind === "access")
    return ADDRESS_KEYS.has(check.key) ? "app" : null;
  return null;
}

/**
 * The one question every aged reading in a group asked, or null.
 *
 * An empty group is null: nothing aged means nothing to refresh.
 */
export function allAsk(
  aged: { check: { key?: string }; subject: Pick<Ref, "kind"> | undefined }[],
): Asked | null {
  const asked = new Set(
    aged.map((item) => pulseAsks(item.check, item.subject)),
  );
  if (asked.size !== 1) return null;
  return [...asked][0];
}
