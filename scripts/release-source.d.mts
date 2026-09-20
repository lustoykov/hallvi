import type {
  ReleaseManifest,
  ReleasePackage,
  ReleasePlatform,
} from "./release-trust.mjs";

export {
  ReleaseRefusal,
  currentPlatform,
  MAX_PACKAGE_BYTES,
} from "./release-trust.mjs";
export type { ReleaseManifest, ReleasePackage, ReleasePlatform };

export const DEFAULT_RELEASE_SOURCE: string;
export const DEFAULT_CHANNEL: string;

export interface InstalledRelease {
  version: string;
  revision: string;
  platform: ReleasePlatform | null;
  nodeVersion: string | null;
}

export interface ReleaseCandidate {
  manifest: ReleaseManifest;
  /** The manifest's own bytes, base64, so it can be verified again. */
  document: string;
  signature: string;
  tag: string | null;
  /** False when this installation trusts a key from its own settings. */
  ownKey: boolean;
}

export function installedRelease(program: string): InstalledRelease | null;
export function programSchemaVersion(program: string): number | null;
export function installation(
  program: string,
  home?: string,
):
  | { kind: "installed"; program: string; release: InstalledRelease }
  | {
      kind: "development";
      program: string;
      release?: InstalledRelease;
      reason: string;
    };
export function compareVersions(left: string, right: string): number;
export function discover(options?: {
  channel?: string;
  source?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
}): Promise<ReleaseCandidate | null>;
export function reopen(options: {
  document: string;
  signature: string;
  channel?: string;
  env?: NodeJS.ProcessEnv;
}): ReleaseManifest;
export function packageFor(
  manifest: ReleaseManifest,
  platform?: ReleasePlatform | null,
): ReleasePackage & { platform: ReleasePlatform };
export function downloadPackage(
  entry: ReleasePackage,
  file: string,
  options?: {
    fetch?: typeof fetch;
    onProgress?: (read: number, size: number) => void;
  },
): Promise<{ file: string; bytes: number; sha256: string }>;
