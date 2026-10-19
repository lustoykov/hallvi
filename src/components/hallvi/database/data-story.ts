// What the Timeline design draws, and nothing else.

import type { ProtectionSummary } from "../backups/protect-story";

export type Lane = "health" | "copies" | "restores";

export interface Mark {
  id: string;
  lane: Lane;
  at: string;
  tone: "pass" | "fail" | "set";
  title: string;
  detail: string;
}

export interface DataStore {
  kind: "sqlite" | "postgres";
  label: string;
  owner: string;
  ownerName: string;
  file: string | null;
  volume: { name: string; docker: string | null; mount: string } | null;
  /** The check that read the database, when one has been run. */
  probe: {
    name: string;
    probe: string;
    inside: boolean;
    at: string | null;
  } | null;
  firstFailure: { at: string; detail: string } | null;
}

export interface DataView {
  tone: "verified" | "stale" | "planned" | "failed" | "checking";
  database: DataStore | null;
  marks: Mark[];
  newestCopyAt: string | null;
  protection: ProtectionSummary;
}
