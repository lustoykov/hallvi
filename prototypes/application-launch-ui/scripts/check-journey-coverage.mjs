import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { gateProgressByState, journeyStates, phases, statesByPhase } from "../src/journeyStates.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const mapPath = path.resolve(scriptDir, "../../../docs/user-journeys/01-application-launch-ui-map.md");
const markdown = await readFile(mapPath, "utf8");
const mappedIds = [...markdown.matchAll(/^\| (L\d+\.\d+) \|/gm)].map((match) => match[1]);
const prototypeIds = journeyStates.map((item) => item.id);

const duplicateValues = (values) => values.filter((value, index) => values.indexOf(value) !== index);
const duplicates = [...new Set([...duplicateValues(mappedIds), ...duplicateValues(prototypeIds)])];
const missingFromPrototype = mappedIds.filter((id) => !prototypeIds.includes(id));
const missingFromMap = prototypeIds.filter((id) => !mappedIds.includes(id));
const incompleteStates = journeyStates.flatMap((item) => {
  const required = ["id", "phase", "name", "status", "objective", "summary", "intent", "pi", "primary", "source"];
  return required.filter((field) => !item[field]).map((field) => `${item.id}:${field}`);
});
const underMappedPhases = phases.filter((phase) => statesByPhase[phase.id].length < 3).map((phase) => phase.id);
const invalidPhaseContracts = phases.filter((phase) => !phase.deliverable || !phase.outcome || !phase.meaning || !phase.source || !phase.takeover || phase.gate?.length !== 3).map((phase) => phase.id);
const invalidGateProgress = journeyStates.filter((item) => !Number.isInteger(gateProgressByState[item.id]) || gateProgressByState[item.id] < 0 || gateProgressByState[item.id] > 3).map((item) => item.id);
const incompletePhaseExits = phases.filter((phase) => {
  const states = statesByPhase[phase.id];
  return gateProgressByState[states.at(-1)?.id] !== phase.gate.length;
}).map((phase) => phase.id);

if (duplicates.length || missingFromPrototype.length || missingFromMap.length || incompleteStates.length || underMappedPhases.length || invalidPhaseContracts.length || invalidGateProgress.length || incompletePhaseExits.length) {
  console.error(JSON.stringify({ duplicates, missingFromPrototype, missingFromMap, incompleteStates, underMappedPhases, invalidPhaseContracts, invalidGateProgress, incompletePhaseExits }, null, 2));
  process.exit(1);
}

const perPhase = Object.fromEntries(phases.map((phase) => [phase.id, statesByPhase[phase.id].length]));
const phaseContracts = Object.fromEntries(phases.map((phase) => [phase.id, { deliverable: phase.deliverable, exitChecks: phase.gate.length }]));
console.log(JSON.stringify({ states: journeyStates.length, perPhase, phaseContracts, source: mapPath, result: "passed" }, null, 2));
