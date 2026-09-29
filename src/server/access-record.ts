import type { SavedInformation } from "./operator-data";

/** The same current route for the controller check and every Open action. */
export function currentAccessRecord(
  records: SavedInformation[],
  applicationId?: string,
): SavedInformation | undefined {
  const latest = records
    .filter(
      (record) =>
        !record.retiredAt &&
        (!applicationId || record.applicationId === applicationId) &&
        record.presentation?.content?.kind === "application-access",
    )
    .sort(
      (a, b) =>
        b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id),
    )[0];
  const content = latest?.presentation?.content;
  const url = latest?.presentation?.url;
  if (content?.kind !== "application-access" || !url) return undefined;
  if (content.mode === "private") {
    if (!URL.canParse(url)) return undefined;
    const target = new URL(url);
    if (
      !["http:", "https:"].includes(target.protocol) ||
      target.hostname !== "127.0.0.1" ||
      !Number.isInteger(content.localPort) ||
      !Number.isInteger(content.remotePort) ||
      content.localPort! < 1024 ||
      content.localPort! > 65535 ||
      content.remotePort! < 1 ||
      content.remotePort! > 65535 ||
      Number(target.port || (target.protocol === "https:" ? 443 : 80)) !==
        content.localPort
    )
      return undefined;
  }
  // An incomplete newer route does not revive an older address.
  return latest;
}

/** An answer about one saved route cannot validate a replacement or edit. */
export function accessRouteIdentity(record: SavedInformation | undefined) {
  const content = record?.presentation?.content;
  if (!record || content?.kind !== "application-access") return null;
  return JSON.stringify([
    record.applicationId,
    record.id,
    record.updatedAt,
    record.presentation?.url,
    content.mode,
    content.server,
    content.localPort,
    content.remotePort,
  ]);
}
