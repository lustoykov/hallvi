import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { journeyStates, phases, statesByPhase } from "../src/journeyStates.js";
import { buildScript, defaultChoices, defaultOutcomes } from "../src/journey-one/fixture.js";
import { journeyOneCheckCount, journeyOnePhases } from "../src/journey-one/journeyOneModel.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const canonicalPath = path.resolve(scriptDir, "../../../docs/user-journeys/01-application-launch.md");
const markdown = await readFile(canonicalPath, "utf8");
const mappedIds = [...markdown.matchAll(/^\| (L\d+\.(?:\d+|W\d+)) \|/gm)].map((match) => match[1]);
const legacyMappedIds = mappedIds.filter((id) => !id.includes(".W"));
const legacyPrototypeIds = journeyStates.map((item) => item.id);

const duplicateValues = (values) => values.filter((value, index) => values.indexOf(value) !== index);
const duplicates = [...new Set([...duplicateValues(mappedIds), ...duplicateValues(legacyPrototypeIds)])];
const missingFromLegacyPrototype = legacyMappedIds.filter((id) => !legacyPrototypeIds.includes(id));
const missingFromCanonical = legacyPrototypeIds.filter((id) => !legacyMappedIds.includes(id));
const incompleteLegacyStates = journeyStates.flatMap((item) => {
  const required = ["id", "phase", "name", "status", "objective", "summary", "intent", "pi", "primary", "source"];
  return required.filter((field) => !item[field]).map((field) => `${item.id}:${field}`);
});
const underMappedPhases = phases.filter((phase) => statesByPhase[phase.id].length < 3).map((phase) => phase.id);

const expectedCheckCounts = [5, 4, 3, 4, 4, 5, 5, 6, 4];
const invalidCanonicalPhases = journeyOnePhases.flatMap((phase, index) => {
  const errors = [];
  if (phase.id !== index + 1) errors.push(`phase-${phase.id}:order`);
  if (!phase.deliverable || !phase.meaning) errors.push(`phase-${phase.id}:contract`);
  if (phase.checks.length !== expectedCheckCounts[index]) errors.push(`phase-${phase.id}:checks-${phase.checks.length}`);
  return errors;
});
const checks = journeyOnePhases.flatMap((phase) => phase.checks);
const duplicateChecks = [...new Set(duplicateValues(checks.map((check) => check.id)))];
const incompleteChecks = checks.flatMap((check) =>
  ["id", "label", "satisfies", "evidence", "observe"].filter((field) => !check[field]).map((field) => `${check.id}:${field}`),
);

const codeScenario = buildScript({
  mode: "Pi Decides",
  choices: { ...defaultChoices, worker: "server-guy" },
  outcomes: { ...defaultOutcomes, conformance: "needs-code" },
});
const canonicalBeatIds = new Set(codeScenario.map((beat) => beat.id));
const missingRepositoryHandoffStates = ["conform-choose", "conform-working", "conform-returned"].filter((id) => !canonicalBeatIds.has(id));

const errors = {
  mappedStateCount: mappedIds.length === 39 ? [] : [`expected-39-got-${mappedIds.length}`],
  duplicates,
  missingFromLegacyPrototype,
  missingFromCanonical,
  incompleteLegacyStates,
  underMappedPhases,
  invalidCanonicalPhases,
  canonicalCheckCount: journeyOneCheckCount === 40 ? [] : [`expected-40-got-${journeyOneCheckCount}`],
  duplicateChecks,
  incompleteChecks,
  missingRepositoryHandoffStates,
};

if (Object.values(errors).some((items) => items.length)) {
  console.error(JSON.stringify(errors, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  canonicalPresentationStates: mappedIds.length,
  legacyStoryboardStates: legacyPrototypeIds.length,
  canonicalPhases: journeyOnePhases.length,
  canonicalGateChecks: journeyOneCheckCount,
  perPhaseChecks: Object.fromEntries(journeyOnePhases.map((phase) => [phase.id, phase.checks.length])),
  source: canonicalPath,
  result: "passed",
}, null, 2));
