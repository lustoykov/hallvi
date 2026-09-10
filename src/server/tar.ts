// A small tar reader and writer for execution trees. Reading validates every
// entry before anything is materialized: no absolute paths, no `..`, no
// symbolic or hard links, bounded counts and sizes. Writing produces ustar
// archives (with pax headers for long paths) owned by the workload user.

export interface TarEntry {
  path: string;
  mode: number;
  type: "file" | "directory";
  content: Buffer;
}

export class TarValidationError extends Error {}

export const TAR_LIMITS = {
  entries: 20_000,
  bytes: 64 * 1024 * 1024,
  pathCharacters: 512,
} as const;

const BLOCK = 512;

function field(block: Buffer, offset: number, length: number) {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return (end < 0 ? raw : raw.subarray(0, end)).toString("utf8");
}

function octal(block: Buffer, offset: number, length: number) {
  const raw = block.subarray(offset, offset + length);
  // GNU base-256 encoding for sizes above 8 GiB is out of bounds anyway.
  if (raw[0] & 0x80) throw new TarValidationError("Unsupported tar size.");
  const text = field(block, offset, length).trim();
  return text ? parseInt(text, 8) : 0;
}

function parsePax(content: Buffer) {
  const records: Record<string, string> = {};
  let offset = 0;
  while (offset < content.length) {
    const space = content.indexOf(0x20, offset);
    if (space < 0) break;
    const length = Number(content.subarray(offset, space).toString("utf8"));
    if (!Number.isInteger(length) || length <= 0) break;
    const record = content.subarray(space + 1, offset + length - 1);
    const equals = record.indexOf(0x3d);
    if (equals > 0)
      records[record.subarray(0, equals).toString("utf8")] = record
        .subarray(equals + 1)
        .toString("utf8");
    offset += length;
  }
  return records;
}

/** Normalizes and validates one archive path; returns null to skip it. */
export function normalizeTarPath(
  raw: string,
  stripComponents: number,
): string | null {
  let path = raw.replace(/\\/g, "/");
  while (path.startsWith("./")) path = path.slice(2);
  if (path.startsWith("/"))
    throw new TarValidationError(`Absolute path in archive: ${raw}`);
  const segments = path.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === ".." || segment === "."))
    throw new TarValidationError(`Unsafe path in archive: ${raw}`);
  if (segments.some((segment) => segment.includes("\0")))
    throw new TarValidationError(`Invalid path in archive: ${raw}`);
  const stripped = segments.slice(stripComponents);
  if (!stripped.length) return null;
  const result = stripped.join("/");
  if (result.length > TAR_LIMITS.pathCharacters)
    throw new TarValidationError(`Path too long in archive: ${raw}`);
  return result;
}

/**
 * Reads an uncompressed tar buffer. Links are rejected outright: a symbolic
 * link could point outside the owned workspace once materialized, and the
 * supported profile does not need them.
 */
export function readTar(
  buffer: Buffer,
  options: { stripComponents?: number } = {},
): TarEntry[] {
  const strip = options.stripComponents ?? 0;
  const entries: TarEntry[] = [];
  let offset = 0;
  let paxPath: string | null = null;
  let longName: string | null = null;
  let total = 0;
  while (offset + BLOCK <= buffer.length) {
    const block = buffer.subarray(offset, offset + BLOCK);
    if (block.every((byte) => byte === 0)) break;
    const size = octal(block, 124, 12);
    const type = String.fromCharCode(block[156] || 0x30);
    const dataStart = offset + BLOCK;
    const dataEnd = dataStart + size;
    if (dataEnd > buffer.length)
      throw new TarValidationError("Truncated archive.");
    const content = buffer.subarray(dataStart, dataEnd);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;
    if (type === "x") {
      paxPath = parsePax(content).path ?? null;
      continue;
    }
    if (type === "g") continue;
    if (type === "L") {
      longName = field(content, 0, content.length);
      continue;
    }
    if (type === "K")
      throw new TarValidationError("Links are not supported in archives.");
    const prefix = field(block, 345, 155);
    const baseName = field(block, 0, 100);
    const rawName =
      paxPath ??
      longName ??
      (prefix && field(block, 257, 6).startsWith("ustar")
        ? `${prefix}/${baseName}`
        : baseName);
    paxPath = null;
    longName = null;
    if (type === "1" || type === "2")
      throw new TarValidationError(
        `Links are not supported in archives: ${rawName}`,
      );
    if (type !== "0" && type !== "\0" && type !== "5" && type !== "7") continue;
    const path = normalizeTarPath(rawName, strip);
    if (path === null) continue;
    const isDirectory = type === "5" || rawName.endsWith("/");
    if (!isDirectory) {
      total += size;
      if (total > TAR_LIMITS.bytes)
        throw new TarValidationError(
          `Archive exceeds ${TAR_LIMITS.bytes} bytes of file content.`,
        );
    }
    entries.push({
      path,
      mode: octal(block, 100, 8) & 0o777,
      type: isDirectory ? "directory" : "file",
      content: isDirectory ? Buffer.alloc(0) : Buffer.from(content),
    });
    if (entries.length > TAR_LIMITS.entries)
      throw new TarValidationError(
        `Archive has more than ${TAR_LIMITS.entries} entries.`,
      );
  }
  return entries;
}

function header(input: {
  path: string;
  size: number;
  mode: number;
  type: "0" | "5" | "x";
  uid: number;
  mtime: number;
}) {
  const block = Buffer.alloc(BLOCK, 0);
  block.write(input.path.slice(0, 100), 0, "utf8");
  block.write(input.mode.toString(8).padStart(7, "0"), 100, "ascii");
  block.write(input.uid.toString(8).padStart(7, "0"), 108, "ascii");
  block.write(input.uid.toString(8).padStart(7, "0"), 116, "ascii");
  block.write(input.size.toString(8).padStart(11, "0"), 124, "ascii");
  block.write(input.mtime.toString(8).padStart(11, "0"), 136, "ascii");
  block.write("        ", 148, "ascii");
  block.write(input.type, 156, "ascii");
  block.write("ustar", 257, "ascii");
  block.write("00", 263, "ascii");
  block.write("app", 265, "ascii");
  block.write("app", 297, "ascii");
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "ascii");
  return block;
}

function padded(content: Buffer) {
  const remainder = content.length % BLOCK;
  return remainder
    ? Buffer.concat([content, Buffer.alloc(BLOCK - remainder, 0)])
    : content;
}

/**
 * Writes entries as a tar owned by uid/gid 1000, the workload user, with
 * parent directories included so extraction leaves nothing root-owned.
 * Build contexts need a real mtime: BuildKit keeps an earlier synced file
 * whose size and mtime are unchanged, so a same-size edit would build stale.
 */
export function writeTar(
  entries: Array<{ path: string; content: Buffer; mode?: number }>,
  options: { uid?: number; mtime?: number } = {},
) {
  const uid = options.uid ?? 1000;
  const mtime = options.mtime ?? 0;
  const directories = new Set<string>();
  for (const entry of entries) {
    const parts = entry.path.split("/");
    for (let depth = 1; depth < parts.length; depth++)
      directories.add(parts.slice(0, depth).join("/"));
  }
  const blocks: Buffer[] = [];
  const emit = (
    path: string,
    content: Buffer,
    mode: number,
    type: "0" | "5",
  ) => {
    if (path.length > 100) {
      const record = `path=${path}\n`;
      const line = `${record.length + String(record.length + 3).length + 1} ${record}`;
      const pax = Buffer.from(line, "utf8");
      blocks.push(
        header({
          path: "././@PaxHeader",
          size: pax.length,
          mode: 0o644,
          type: "x",
          uid,
          mtime,
        }),
        padded(pax),
      );
    }
    blocks.push(
      header({ path, size: content.length, mode, type, uid, mtime }),
      padded(content),
    );
  };
  for (const directory of [...directories].sort())
    emit(`${directory}/`, Buffer.alloc(0), 0o755, "5");
  for (const entry of entries)
    emit(entry.path, entry.content, entry.mode ?? 0o644, "0");
  blocks.push(Buffer.alloc(BLOCK * 2, 0));
  return Buffer.concat(blocks);
}
