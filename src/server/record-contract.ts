// What a record must carry to be readable, checked when it is written.
//
// Zod settles shape. This settles the part of the contract that shape cannot:
// a check with no claim has no horizon, so no view can say whether it still
// holds; two facts sharing a key mean a later observation silently erases
// one; a record that says a thing is absent and then describes it says two
// things at once. None of that fails to parse, and all of it produces a page
// that either lies or renders nothing.
//
// Every finding is written for Pi: what is wrong, where, and what to write
// instead. It arrives as a tool error, which Pi can act on and retry — the
// same loop a type error gives a compiler, and the reason the vocabulary can
// be adopted without anyone hand-checking records.
//
// This is deliberately only the mechanical floor. Whether a body is
// meaning-first, or a title states something rather than labelling it, is a
// judgement about prose and is not decided here.

import type { InformationInput } from "./operator-data";
import { basisKinds, claimKinds } from "./operator-data";

const claimList = claimKinds.join(", ");
const basisList = basisKinds.join(", ");

/** A short, stable, machine-safe key suggestion from a human label. */
function suggestKey(label: string) {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .split("-")
      .slice(0, 3)
      .join("-") || "key"
  );
}

function missing(
  item: { key?: string; claim?: string; basis?: string },
  what: "Check" | "Fact",
  index: number,
  label: string,
) {
  const absent = [
    item.key ? null : "key",
    item.claim ? null : "claim",
    item.basis ? null : "basis",
  ].filter((name): name is string => name !== null);
  if (!absent.length) return null;
  return (
    `${what} ${index + 1} ("${label}") is missing ${absent.join(", ")}. ` +
    `key is a short stable identifier such as "${suggestKey(label)}", so a ` +
    `later observation of the same thing replaces this one instead of ` +
    `sitting beside it. claim is one of ${claimList}, and says how fast the ` +
    `${what.toLowerCase()} stops being worth trusting. basis is one of ` +
    `${basisList}: whether you saw it, were told it, or only intend it.`
  );
}

function duplicates(keys: (string | undefined)[], what: "checks" | "facts") {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const key of keys) {
    if (!key) continue;
    if (seen.has(key)) repeated.add(key);
    seen.add(key);
  }
  return [...repeated].map(
    (key) =>
      `Two ${what} share the key "${key}". A key names one claim so that a ` +
      `later record can replace it; give each its own key, or write one ` +
      `${what === "checks" ? "check" : "fact"} instead of two.`,
  );
}

/**
 * Reads a record the way the views will and reports what would make it
 * unreadable. An empty list means it can be drawn.
 */
export function reviewRecord(value: InformationInput): string[] {
  const found: string[] = [];
  const presentation = value.presentation;
  if (!presentation) return found;

  presentation.checks.forEach((check, index) => {
    const gap = missing(check, "Check", index, check.label);
    if (gap) found.push(gap);
    if (check.subject)
      found.push(
        `Check ${index + 1} ("${check.label}") uses subject, which is no ` +
          `longer read. Name the thing you checked instead: ` +
          `about: {kind, id} — for example {kind:"process", id:"app"} or ` +
          `{kind:"host", id:"hetzner-165600952"}. That is what places the ` +
          `check on Overview, Architecture and History alike.`,
      );
    if (check.basis === "planned" && check.status !== "info")
      found.push(
        `Check ${index + 1} ("${check.label}") is planned, so it cannot have ` +
          `${check.status}. A planned check has not run: give it status ` +
          `"info", or record what actually happened.`,
      );
  });
  found.push(...duplicates(presentation.checks.map((c) => c.key), "checks"));

  (presentation.facts ?? []).forEach((fact, index) => {
    const gap = missing(fact, "Fact", index, fact.label);
    if (gap) found.push(gap);
  });
  found.push(
    ...duplicates((presentation.facts ?? []).map((f) => f.key), "facts"),
  );

  if (presentation.status === "verified" && !value.establishedAt)
    found.push(
      `status is "verified" but establishedAt is missing. Set it to when you ` +
        `gathered the evidence; without a time nothing was established, and ` +
        `the record can only be shown as recorded.`,
    );

  if (value.states?.presence === "absent" && (presentation.facts ?? []).length)
    found.push(
      `This record says ${value.states.ref.kind} "${value.states.ref.id}" is ` +
        `absent and then carries facts about it. An absence states that there ` +
        `is nothing there: write it on its own, and keep what you observed ` +
        `while it existed on the earlier record.`,
    );

  const content = presentation.content;
  if (content?.kind === "topology") {
    if (value.states?.ref.kind !== "application")
      found.push(
        `A topology is the application's own map, so the record has to speak ` +
          `for it: states: {ref: {kind:"application", id:"<the application ` +
          `id>"}, presence:"present"}. Without that the map is never read.`,
      );
    const known = new Set([
      ...content.parts.map((part) => part.id),
      ...content.absent.map((part) => part.id),
    ]);
    for (const edge of content.edges)
      for (const end of [edge.from, edge.to])
        if (!known.has(end))
          found.push(
            `Edge ${edge.from} → ${edge.to} names "${end}", which is not in ` +
              `parts or absent. Every edge has to join two pieces the map ` +
              `draws; add the piece, or drop the edge.`,
          );
  }

  return found;
}

/** Throws a numbered list Pi can act on, or returns quietly. */
export function requireReadableRecord(value: InformationInput) {
  const found = reviewRecord(value);
  if (!found.length) return;
  throw new Error(
    `This record cannot be drawn yet. ${found.length === 1 ? "One thing" : `${found.length} things`} to fix:\n` +
      found.map((item, index) => `${index + 1}. ${item}`).join("\n"),
  );
}
