const phaseOperations = {
  1: [
    ["identify", "Identify", "Identify application", "Server Guy", "Record application identity", "Launch request", "Application identity and repository source"],
    ["prereqs", "Access", "Resolve prerequisites", "Pi with engineer", "Read or connect scoped integrations", "Application identity", "Integration checks and missing-access evidence"],
    ["brief", "Brief", "Record Launch Brief", "Server Guy", "Append Operator Record", "Resolved launch intent", "Launch Brief with provenance"],
  ],
  2: [
    ["inspect", "Inspect", "Inspect repository", "Server Guy", "Read-only repository access", "Launch Brief", "Repository snapshot and detected facts"],
    ["profile", "Profile", "Resolve Application Profile", "Pi", "No external effect", "Repository evidence", "Profile match or named gap"],
    ["contract", "Contract", "Record Application Contract", "Server Guy", "Append Operator Record", "Profile plus confirmed intent", "Source-attributed Application Contract"],
  ],
  3: [
    ["scope", "Scope", "Scope conformance work", "Pi", "No external effect", "Application Contract gaps", "Bounded repository brief"],
    ["handoff", "Change", "Prepare repository change", "Coding agent", "Reviewable repository write", "Bounded brief and evidence", "Branch, diff, tests, and pull request"],
    ["checks", "Check", "Run Server Guy checks", "Server Guy", "Read-only verification", "Returned revision", "Profile and contract check results"],
    ["revision", "Record", "Record eligible revision", "Server Guy", "Append Operator Record", "Passing exact revision", "Conformance Result"],
  ],
  4: [
    ["inputs", "Inputs", "Read accepted contract", "Server Guy", "Read-only", "Conformance Result", "Current contract and provider facts"],
    ["compute", "Compute", "Compute launch topology", "Pi", "No external effect", "Contract and cost intent", "Proposed topology, cost, and risks"],
    ["review", "Review", "Review plan delta", "Pi with engineer", "Decision Record only", "Proposed Launch Plan", "Accepted or corrected plan"],
    ["freeze", "Ready", "Record Launch Plan", "Server Guy", "Append Operator Record", "Accepted launch intent", "Launch Plan ready for operations"],
  ],
  5: [
    ["connect", "Access", "Validate Hetzner access", "Hetzner adapter", "Read-only provider access", "Scoped credential", "Account, scope, and price observations"],
    ["plan", "Plan", "Plan host operation", "Server Guy", "No external effect", "Launch Plan", "Exact resource request and cost boundary"],
    ["create", "Create", "Create or adopt host", "Hetzner adapter", "Paid provider write", "Accepted host operation", "Provider receipt and host identity"],
    ["verify", "Verify", "Verify host readiness", "Server Guy", "Read-only host checks", "Observed host identity", "Host Record with readiness evidence"],
  ],
  6: [
    ["ownership", "Own", "Resolve domain ownership", "Pi with engineer", "Decision or guided account action", "Intended hostname", "Registrar, zone, and authority evidence"],
    ["configure", "DNS", "Configure public route", "Cloudflare adapter", "DNS and certificate writes", "Observed authority and host identity", "Provider receipts for intended route"],
    ["observe", "Observe", "Observe propagation or conflict", "Server Guy", "Read-only external probes", "Submitted DNS operation", "Resolver, TLS, and route observations"],
    ["verify", "Verify", "Verify HTTPS route", "Verification runner", "Read-only external checks", "Converged DNS and certificate", "Domain Route evidence"],
  ],
  7: [
    ["scope", "Scope", "Resolve operational baseline", "Pi with engineer", "Decision Record only", "Launch policy and Application Contract", "Required responsibilities and accepted gaps"],
    ["runtime", "Runtime", "Configure runtime and data", "Host runner", "Host and database writes", "Host Record and Application Contract", "Service, database, secrets, and backup receipts"],
    ["observe", "Observe", "Connect evidence channels", "Server Guy", "Telemetry, log, and sentinel configuration", "Running services", "Logs, traces, metrics, and external observations"],
    ["verify", "Verify", "Verify operational baseline", "Verification runner", "Read-only checks", "Configured responsibilities", "Operational Baseline evidence"],
  ],
  8: [
    ["candidate", "Candidate", "Select exact candidate", "Server Guy", "No external effect", "Eligible revision and immutable artifact", "Pinned Release candidate"],
    ["deploy", "Deploy", "Apply Release", "Release runner", "Production mutation", "Pinned candidate and Operational Baseline", "Deployment, migration, and service receipts"],
    ["verify", "Verify", "Run external and semantic checks", "Verification runner", "Read-only external checks", "Reachable candidate", "Health, route, and semantic evidence"],
    ["promote", "Promote", "Record current Release", "Server Guy", "Append Operator Record", "Passing exact candidate", "Verified Release"],
  ],
  9: [
    ["assemble", "Assemble", "Assemble launch evidence", "Evidence store", "Record append", "Verified Release and provider records", "Linked launch evidence bundle"],
    ["gaps", "Gaps", "Record gaps and ownership", "Pi with engineer", "Decision Record only", "Operational Baseline and evidence", "Visible gaps, owners, and follow-up"],
    ["observe", "Observe", "Activate ongoing observation", "Sentinel", "Monitoring configuration", "Verified public route", "Fresh health, log, and telemetry path"],
    ["operate", "Operate", "Enter application operations", "Server Guy", "Workspace state transition", "Complete handoff", "Operations Handoff"],
  ],
};

export const presentationByState = {
  "L1.1": "decision", "L1.2": "decision", "L1.3": "outcome",
  "L2.1": "operation", "L2.2": "decision", "L2.3": "intervention",
  "L3.1": "review", "L3.2": "handoff", "L3.3": "outcome",
  "L4.1": "review", "L4.2": "review", "L4.3": "outcome",
  "L5.1": "decision", "L5.2": "approval", "L5.3": "operation", "L5.4": "outcome",
  "L6.1": "decision", "L6.2": "outcome", "L6.3": "decision", "L6.4": "decision",
  "L6.5": "operation", "L6.6": "intervention", "L6.7": "operation", "L6.8": "outcome",
  "L7.1": "decision", "L7.2": "operation", "L7.3": "intervention", "L7.4": "outcome",
  "L8.1": "review", "L8.2": "operation", "L8.3": "intervention", "L8.4": "intervention", "L8.5": "outcome",
  "L9.1": "outcome", "L9.2": "evidence", "L9.3": "outcome",
};

const operationIndexByState = {
  "L1.1": 0, "L1.2": 1, "L1.3": 2,
  "L2.1": 0, "L2.2": 2, "L2.3": 1,
  "L3.1": 0, "L3.2": 1, "L3.3": 3,
  "L4.1": 2, "L4.2": 2, "L4.3": 3,
  "L5.1": 0, "L5.2": 2, "L5.3": 2, "L5.4": 3,
  "L6.1": 0, "L6.2": 1, "L6.3": 0, "L6.4": 0, "L6.5": 2, "L6.6": 2, "L6.7": 1, "L6.8": 3,
  "L7.1": 0, "L7.2": 1, "L7.3": 3, "L7.4": 3,
  "L8.1": 0, "L8.2": 1, "L8.3": 2, "L8.4": 2, "L8.5": 3,
  "L9.1": 0, "L9.2": 1, "L9.3": 3,
};

const completeStatuses = new Set(["passed", "complete", "completed", "good", "ready", "recorded", "stable", "verified", "allowed", "none"]);

function selectedStatus(state) {
  const value = state.status.toLowerCase();
  if (state.tone === "danger" || value.includes("blocked")) return "blocked";
  if (value.includes("approval")) return "approval";
  if (value.includes("input") || value.includes("review") || value.includes("decision")) return "needs-input";
  if (value.includes("acting") || value.includes("inspect") || value.includes("waiting")) return "running";
  if (state.tone === "success" || value.includes("complete") || value.includes("verified") || value.includes("operational") || value.includes("ready") || value.includes("recorded")) return "done";
  return "planned";
}

function selectedKind(state, nodeId) {
  if (state.phase === 3 && nodeId === "handoff") return "external-agent";
  const value = state.status.toLowerCase();
  if (state.tone === "danger" || value.includes("input") || value.includes("decision") || value.includes("review")) return "judgment";
  return "deterministic";
}

function deltaAction(state) {
  const value = state.status.toLowerCase();
  if (state.tone === "danger" || value.includes("blocked")) return "blocked";
  if (value.includes("input") || value.includes("review") || value.includes("approval") || value.includes("decision")) return "decision";
  if (value.includes("waiting")) return "wait";
  if (state.tone === "success" || value.includes("complete") || value.includes("verified") || value.includes("operational")) return "none";
  return "apply";
}

function buildDesired(state, phase, gateProgress) {
  return [
    ["Phase deliverable", phase.deliverable, phase.source],
    ["Current target", state.name, state.source],
    ["Exit condition", phase.gate[Math.min(gateProgress, phase.gate.length - 1)], `${gateProgress}/${phase.gate.length} checks passed`],
  ];
}

function buildObserved(state) {
  const rows = state.facts.slice(0, 2).map(([label, value, source]) => [label, value, source]);
  if (state.events[0]) rows.push(["Latest observation", state.events[0][0], state.events[0][1]]);
  else rows.push(["Current status", state.status, "Operator state"]);
  return rows;
}

function buildDeltas(state) {
  const rows = [[deltaAction(state), state.primary, "Primary next action"]];
  if (state.decision) rows.push(["decision", "Resolve product policy", state.decision]);
  const unresolved = state.groups.flatMap((group) => group.items || []).find((item) => !completeStatuses.has(String(item[2]).toLowerCase()));
  if (unresolved && rows.length < 3) rows.push(["configure", unresolved[0], `${unresolved[1]} · ${unresolved[2]}`]);
  if (state.secondary && rows.length < 3) rows.push(["review", state.secondary, "Engineer-controlled alternative"]);
  return rows;
}

function buildNodes(state) {
  const selectedIndex = operationIndexByState[state.id] ?? 0;
  return phaseOperations[state.phase].map(([id, short, title, owner, effect, dependencies, evidence], index) => {
    const kind = index === selectedIndex ? selectedKind(state, id) : (state.phase === 3 && id === "handoff" ? "external-agent" : "deterministic");
    return {
      id,
      number: String(index + 1).padStart(2, "0"),
      short,
      title,
      owner: index === selectedIndex && kind === "judgment" ? "Pi with engineer" : owner,
      effect: index === selectedIndex && kind === "judgment" ? "Decision Record only" : effect,
      dependencies,
      evidence,
      kind,
      status: index < selectedIndex ? "done" : index > selectedIndex ? "queued" : selectedStatus(state),
      summary: index === selectedIndex ? state.summary : `A phase-local operation contributing to ${state.name}.`,
    };
  });
}

export function getJourneyV2Scenario(state, phase, gateProgress) {
  const nodes = buildNodes(state);
  const selectedNode = nodes[operationIndexByState[state.id] ?? 0];
  return {
    presentation: presentationByState[state.id],
    desired: buildDesired(state, phase, gateProgress),
    observed: buildObserved(state),
    deltas: buildDeltas(state),
    nodes,
    selectedNodeId: selectedNode.id,
  };
}

export function validateJourneyV2Coverage(journeyStates) {
  return journeyStates.filter((state) => !presentationByState[state.id] || operationIndexByState[state.id] === undefined).map((state) => state.id);
}
