// PROTOTYPE · opus-ui-improvements · chosen for Domains and Security.
// What both pages read: what a visitor meets when they knock — the address,
// the name and certificate in front of it, and what the record says each
// kind of caller would get — and every way in the record can account for:
// the ports the deployment asked the provider to open, who they were opened
// to, what listens behind them and what protects the server without being a
// way in. Built on the story the Processes page reads (stack-model.ts).
// Nothing here contacts a host: the firewall read-back is the one the
// shipped Security view makes, and the scenarios that invent one say so.

import type { DomainFacts } from "@/server/application-facts";

import { ago } from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { when, type StackStory } from "../stack-prototype/stack-model";

export { when };

/** How far a way in reaches. */
// The five the Callers and Rings designs draw are shared with the records
// path, so they live beside those designs rather than inside this builder.
export type { Caller, Door, Guard, Hole, Reach, Told } from "./reach-story";
import type { Caller, Door, Guard, Hole, Told } from "./reach-story";

export interface ReachStory extends StackStory {
  address: string | null;
  domain: DomainFacts["domain"];
  tls: DomainFacts["tls"];
  /** Who the deployment opened HTTP to. */
  audience: "public" | "controller";
  controllerIp: string | null;
  callers: Caller[];
  doors: Door[];
  ssh: { word: string; tone: Tone; detail: string; told: Told };
  firewall: {
    state: "read" | "asked" | "none";
    provider: string;
    name: string | null;
    at: string | null;
    detail: string;
  };
  guards: Guard[];
  holes: Hole[];
  /** The scenario that invented part of this, in words. */
  invented: string | null;
}

/** The web process, which is what a visitor reaches. */

/** "3 days ago", as the other pages say it. */
export { ago };
