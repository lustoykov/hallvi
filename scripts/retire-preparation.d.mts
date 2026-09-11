import type BetterSqlite3 from "better-sqlite3";
import type { NativeConfiguration } from "../src/server/deployment-release";

export const RETIRED_TABLES: string[];
export const ATTESTATION_INPUT: string;
export function legacyReleaseId(
  repository: string,
  revision: string,
  plan: unknown,
): string;
export function convertPlan(
  plan: unknown,
  release: { deploymentId: string; repository: string; revision: string },
): NativeConfiguration;
export function needsRetirement(database: BetterSqlite3.Database): boolean;
export function retirePreparationWorkflow(
  database: BetterSqlite3.Database,
  options?: { now?: string; pidAlive?: (pid: number) => boolean },
): {
  changed: boolean;
  archived?: number;
  heldOperations?: number;
  summaries?: number;
};
