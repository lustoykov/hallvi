// PROTOTYPE · opus-ui-improvements · throwaway.
// What the four remaining pages say: the configuration this application was
// given (Variables), the one machine that answers every request (CDN), the
// cache and queue it does not have (Cache & queue), and what recurs on this
// server (Jobs). Three of the four are about something the application does
// not have, which is the honest answer for most applications: each says why
// it is absent from the record, and what it would take. Built on the story
// the Processes page reads (stack-model.ts). Nothing here contacts a host.

import { ago } from "../architecture-prototype/model";
import { when, type StackStory } from "../stack-prototype/stack-model";

export { when, ago };

/** Who decided a value. */
// The seven the Manifest, Origin, Queue and Rota designs draw are shared
// with the records path, so they live beside those designs.
export type {
  Broker,
  ConfigFile,
  Decider,
  JobLine,
  QueueLine,
  Recurring,
  Value,
  Waiting,
} from "./supply-story";
import type {
  Broker,
  ConfigFile,
  JobLine,
  QueueLine,
  Recurring,
  Value,
  Waiting,
} from "./supply-story";

export interface SupplyStory extends StackStory {
  revision: string | null;
  appliedAt: string | null;
  values: Value[];
  files: ConfigFile[];
  waiting: Waiting[];
  /** Where the one machine is. */
  place: string | null;
  machine: string | null;
  address: string | null;
  cdn: {
    on: boolean;
    provider: string | null;
    detail: string;
  };
  brokers: Broker[];
  queues: QueueLine[];
  workers: string[];
  jobs: JobLine[];
  runs: { id: string; jobName: string; outcome: string; at: string }[];
  recurring: Recurring[];
  /** The scenario that invented part of this, in words. */
  invented: string | null;
}

/** "0600", as the host writes it. */
/** The exact size of base64 content, without decoding it. */
export const sizeWords = (bytes: number) =>
  bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} kB`;
export const waitWords = (seconds: number) =>
  seconds < 90 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`;
