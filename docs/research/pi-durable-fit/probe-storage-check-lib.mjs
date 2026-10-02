// Helpers for probe-storage-check-*.mjs (the skeptic's counter-probes). Data
// lives under data-storage-check/.
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { HERE } from "./probe-storage-lib.mjs";

export * from "./probe-storage-lib.mjs";
export const CHECK_DATA = join(HERE, "data-storage-check");

/**
 * A fresh, empty path under data-storage-check/ (file or directory, plus sqlite
 * sidecars).
 */
export async function freshCheck(name) {
  await mkdir(CHECK_DATA, { recursive: true });
  const path = join(CHECK_DATA, name);
  for (const suffix of ["", "-wal", "-shm", "-journal"])
    await rm(path + suffix, { recursive: true, force: true });
  return path;
}

export const quiet = () => {
  process.removeAllListeners("warning");
  process.on("warning", () => {});
};

export async function attempt(label, fn) {
  const started = performance.now();
  try {
    const value = await fn();
    console.log(
      `  ${label}: ok ${value === undefined ? "" : JSON.stringify(value)} (${(performance.now() - started).toFixed(0)} ms)`,
    );
    return { ok: true, value };
  } catch (error) {
    const cause = error?.cause
      ? ` <- cause: ${error.cause?.message ?? error.cause}`
      : "";
    console.log(
      `  ${label}: FAILED ${error?.name}: ${error?.message}${cause} (${(performance.now() - started).toFixed(0)} ms)`,
    );
    return { ok: false, error };
  }
}
