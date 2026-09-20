export type ReleasePlatform = "darwin-arm64" | "linux-x64";

export interface ReleasePackage {
  file: string;
  url: string;
  size: number;
  sha256: string;
}

export interface ReleaseManifest {
  channel: string;
  version: string;
  revision: string;
  schemaVersion: number;
  migratesFrom: number[];
  releasedAt: string;
  notes: string;
  packages: Partial<Record<ReleasePlatform, ReleasePackage>>;
}

export const PLATFORMS: ReleasePlatform[];
export const CHANNELS: string[];
export const MAX_PACKAGE_BYTES: number;

export class ReleaseRefusal extends Error {}

export function trustedKeys(env?: NodeJS.ProcessEnv): {
  own: boolean;
  keys: unknown[];
};
export function currentPlatform(
  platform?: string,
  arch?: string,
): ReleasePlatform | null;
export function verifyManifest(options: {
  bytes: Buffer;
  signature: string;
  channel: string;
  keys: unknown[];
}): ReleaseManifest;
