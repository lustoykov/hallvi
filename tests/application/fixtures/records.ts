// Building records by hand, for the projection tests.
//
// Every destination's tests need the same three shapes — a record that states
// a subject, the application's map, and a release — so they are written once.
// Nothing here defaults a value that a test might want to be missing: a
// record with no `establishedAt` established nothing, and that is a case the
// projections have to get right.

import type { Ref, SavedInformation } from "@/server/operator-data";

export const APP = "app-1";
export const NOW = Date.parse("2026-09-13T12:00:00.000Z");
const DEFAULT_AT = "2026-09-13T11:55:00.000Z";

type Presentation = NonNullable<SavedInformation["presentation"]>;

let counter = 0;
export function resetRecordIds() {
  counter = 0;
}

export function record(
  input: Partial<Presentation> & {
    at?: string | null;
    title?: string;
    retiredAt?: string;
  },
): SavedInformation {
  const { at, title, retiredAt, ...presentation } = input;
  return {
    id: `r${++counter}`,
    applicationId: APP,
    title: title ?? "A record",
    body: "",
    evidence: [],
    establishedAt: at === undefined ? DEFAULT_AT : at,
    createdAt: DEFAULT_AT,
    updatedAt: DEFAULT_AT,
    retiredAt: retiredAt ?? null,
    presentation: {
      views: ["overview"],
      role: "status",
      status: "verified",
      checks: [],
      ...presentation,
    },
  } as SavedInformation;
}

/** A record that speaks for a subject. */
export function states(
  ref: Ref,
  input: Partial<Presentation> & {
    at?: string | null;
    title?: string;
    presence?: "present" | "absent";
    retiredAt?: string;
  } = {},
) {
  const { presence, ...rest } = input;
  return record({
    states: { ref, presence: presence ?? "present" },
    ...rest,
  });
}

export const fact = (
  key: string,
  value: string,
  claim: Presentation["facts"] extends (infer F)[] | undefined
    ? F extends { claim?: infer C }
      ? C
      : never
    : never = "configuration",
  basis: "observed" | "reported" | "planned" = "observed",
) => ({ key, label: key, value, claim, basis });

export const check = (
  key: string,
  status: "passed" | "failed" | "info",
  claim: Parameters<typeof fact>[2] = "reachability",
  extra: object = {},
) => ({
  key,
  label: key,
  status,
  claim,
  basis: "observed" as const,
  ...extra,
});

/** The application's map. Composition only: it names shapes, never state. */
export function topology(
  parts: { id: string; kind: string; name?: string }[],
  edges: { from: string; to: string; network: string; label?: string }[] = [],
  input: { at?: string | null } = {},
) {
  return states({ kind: "application", id: APP }, {
    ...input,
    content: {
      kind: "topology",
      from: "observed",
      parts: parts.map((part) => ({
        name: part.id,
        role: "a part",
        plain: "a part",
        ...part,
      })),
      edges,
    },
  } as Partial<Presentation> & { at?: string | null });
}

/** A release. `image` for one, `services` for more than one. */
export function release(
  content: { image?: string; services?: object[] },
  input: { at?: string | null } = {},
) {
  return record({
    ...input,
    about: [{ kind: "application", id: APP }],
    content: {
      kind: "deployment",
      repositoryUrl: "https://github.com/owner/repo",
      revision: "a1b2c3d",
      server: "host-1",
      changes: [],
      ...content,
    },
  } as Partial<Presentation> & { at?: string | null });
}
