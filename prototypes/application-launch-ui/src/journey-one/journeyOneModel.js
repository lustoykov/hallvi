const check = (id, label, satisfies, evidence, observe, hero = null) => ({
  id,
  label,
  satisfies,
  evidence,
  observe,
  hero,
});

export const journeyOnePhases = [
  {
    id: 1,
    short: "Start",
    deliverable: "Launch Brief",
    meaning: "The application, repository, environment, authority, intent, and prerequisites are explicit.",
    checks: [
      check("P1.G1", "Application identity recorded", "One stable Application record names the engineer-recognized application and ownership context.", "Application-record creation receipt and originating decision.", "Open Launch Brief → Application identity and its originating chat decision."),
      check("P1.G2", "Repository readable at a recorded identity", "Server Guy can read the selected repository and records provider, owner, default branch, and inspected revision.", "Repository-access observation, metadata, commit SHA, and observed credential scope.", "Open the exact GitHub revision, raw access probe, or GitHub integration scope.", "pr"),
      check("P1.G3", "Target environment explicit", "The intended Environment and its purpose are recorded and distinguishable from other environments.", "Environment record and originating Decision Record.", "Open Launch Brief → Environment and jump to its chat origin."),
      check("P1.G4", "Approval Mode and authority explicit", "Approval Mode, effective scope, and currently available capabilities are recorded without implying broader authority.", "Approval decision, authority snapshot, and redacted integration-scope observations.", "Open the approval decision, effective integration scopes, and provider authorization pages."),
      check("P1.G5", "Intent and prerequisites explicit", "Material operating intent is recorded; every known prerequisite is available or a precise owned Blocker.", "Launch Brief, decisions, prerequisite observations, and Blockers.", "Open the Launch Brief and each affected integration or source."),
    ],
  },
  {
    id: 2,
    short: "Inspect app",
    deliverable: "Application Contract",
    meaning: "Build, runtime, health, persistence, configuration, observability, and verification requirements are explicit and sourced.",
    checks: [
      check("P2.G1", "Application Profile resolution is conclusive", "One supported, versioned Application Profile matches; ambiguity or mismatch remains blocked.", "Profile-resolution report, matched/rejected criteria, and repository observations.", "Open the profile report, profile specification, and cited repository files.", "pr"),
      check("P2.G2", "Every material contract field represented", "Every profile-required field exists, including explicit unknowns instead of silent omission.", "Versioned Application Contract and profile schema-validation result.", "Open the contract grouped by responsibility and the governing profile field."),
      check("P2.G3", "Every material field has provenance", "Each material value is repository-declared, profile-derived, user-confirmed, provider-observed, or unresolved.", "Contract provenance map, Evidence References, and user Decision Records.", "Open any field to its repository line, profile rule, observation, or chat decision.", "pr"),
      check("P2.G4", "No required contract gap unresolved", "Every required field is valid and every incompatibility is resolved; unknowns stay blocked.", "Contract validation report and bounded gap list.", "Open the gap, affected contract field, and authoritative repository source.", "pr"),
    ],
  },
  {
    id: 3,
    short: "Make launch-ready",
    deliverable: "Conformance Result",
    meaning: "One exact eligible repository revision passes every required profile check.",
    checks: [
      check("P3.G1", "Exact candidate revision identified", "One immutable commit is the candidate; after a PR this is the merged target revision.", "Commit identity, branch observation, and merge receipt when applicable.", "Open the exact GitHub commit and originating pull request.", "pr"),
      check("P3.G2", "Required source changes resolved", "Every required change is in the candidate, merged where required, and within the bounded worker brief.", "Gap-to-diff map, PR state, complete diff, scope check, and merge result.", "Open the PR, full diff, changed files, discussion, and worker evidence.", "pr"),
      check("P3.G3", "Profile checks pass for the candidate", "Every selected-profile conformance check passes against that exact revision.", "Check-run identity, per-check output, logs, timestamps, and candidate SHA.", "Open the GitHub or Server Guy check run and raw output.", "pr"),
    ],
  },
  {
    id: 4,
    short: "Review launch plan",
    deliverable: "Launch Plan",
    meaning: "Topology, cost, actors, effects, verification, and material risks are visible before external effects.",
    checks: [
      check("P4.G1", "Target topology explicit", "Public route, host, runtime, persistence, and supporting services are represented without pretending proposed resources exist.", "Versioned Launch Plan derived from current contract and observations.", "Open the topology and every referenced contract/provider source."),
      check("P4.G2", "Expected external cost sourced", "Recurring and one-time provider costs are explicit with source, currency, and pricing time.", "Provider pricing observation and plan cost calculation.", "Open the source pricing page or provider estimate and calculation."),
      check("P4.G3", "Provider, Pi, and engineer actions separated", "Every material action names its actor, effect, authority requirement, and user-owned step.", "Operation proposals, actor assignments, and authority context.", "Open each proposed Operation and its actor/authority record."),
      check("P4.G4", "Verification bar and risks explicit", "Launch checks, evidence required, material risks, and unresolved policy dependencies are visible.", "Verification section, risk list, and linked contract requirements.", "Open each verification definition and the source of every risk."),
    ],
  },
  {
    id: 5,
    short: "Set up server",
    deliverable: "Host Record",
    meaning: "Exactly one intended Hetzner host exists with recorded identity, cost, access, and readiness evidence.",
    checks: [
      check("P5.G1", "Hetzner access observed", "Server Guy can inspect the intended Hetzner account/project with the recorded effective scope.", "Fresh provider access observation and redacted scope snapshot.", "Open the Hetzner project, integration scope, and raw access result.", "hetzner"),
      check("P5.G2", "Authority for host effect satisfied", "The intended host effect is permitted by the current Approval Mode and authority context.", "Operation proposal, authority evaluation, and Approval Record when required.", "Open the proposed Operation and originating approval or mode decision."),
      check("P5.G3", "Exactly one intended host recorded", "One intended host exists and its provider ID, name, IP, type, region, image, and actual cost are recorded.", "Provider create/adopt receipt plus fresh object readback.", "Open the exact host in the Hetzner console and provider receipt.", "hetzner"),
      check("P5.G4", "Host readiness verified", "The host is reachable through the supported path and passes profile-independent readiness checks.", "Host reachability, OS, capacity, time, disk, and access observations.", "Open the scoped server session and raw readiness output.", "terminal"),
    ],
  },
  {
    id: 6,
    short: "Connect domain",
    deliverable: "Domain Route",
    meaning: "The intended hostname is under observed control, resolves correctly, serves valid HTTPS, and has no unresolved wait or conflict.",
    checks: [
      check("P6.G1", "Intended public hostname recorded", "One canonical public hostname is recorded for this Environment.", "Hostname Decision Record and Domain Route draft.", "Open the hostname decision and Domain Route."),
      check("P6.G2", "Authoritative domain control observed", "Current NS/SOA observations prove control of the relevant zone; instructions alone do not.", "External NS/SOA observations from multiple resolvers.", "Open the Cloudflare zone and raw authoritative DNS answers.", "dns"),
      check("P6.G3", "Public DNS resolves to intended route", "External resolvers return the intended route with no unresolved conflicting record.", "External A/AAAA/CNAME observations and Cloudflare change receipt.", "Open Cloudflare DNS records and raw resolver results.", "dns"),
      check("P6.G4", "Valid HTTPS observed externally", "The intended hostname completes TLS with a valid certificate and serves the expected route.", "External TLS and HTTP probe with certificate and response details.", "Open the raw public probe and certificate details.", "probe"),
      check("P6.G5", "No conflict or propagation wait remains", "No material DNS conflict, delegation wait, or certificate propagation wait is unresolved.", "Conflict scan and current multi-resolver propagation observations.", "Open the conflicting provider objects or propagation observations.", "dns"),
    ],
  },
  {
    id: 7,
    short: "Configure and protect",
    deliverable: "Operational Baseline",
    meaning: "Runtime, configuration, persistence, logs/telemetry, and external observation responsibilities are established and inspectable.",
    checks: [
      check("P7.G1", "Required runtime services managed", "Profile-required services are installed, configured, supervised, enabled, and healthy on the intended host.", "Service-manager, process, port, and profile readiness observations.", "Open the scoped host session and service status output.", "terminal"),
      check("P7.G2", "Configuration and secrets resolved", "Every required value has an owner and source; secrets are referenced without unsafe disclosure.", "Configuration inventory, secret-reference validation, and ownership records.", "Open the redacted inventory and authoritative configuration source."),
      check("P7.G3", "Persistence protection satisfied", "Required backup and restore responsibilities meet the still-explicit product policy for this application.", "Backup configuration, fresh backup observation, retention, owner, and restore evidence when policy requires it.", "Open backup storage/provider state, latest artifact, and restore evidence.", "terminal"),
      check("P7.G4", "Logs and telemetry reporting", "Profile-required structured logs and telemetry arrive with application, environment, release, severity, and time context.", "Ingestion observations and representative redacted events/traces.", "Open the live query or retained artifact and inspect raw events."),
      check("P7.G5", "External observation active", "An outside observer checks the intended public contract with explicit ownership and notification path.", "Observer configuration and fresh observation from outside the host.", "Open the observer configuration and latest raw public probe.", "probe"),
    ],
  },
  {
    id: 8,
    short: "Go live",
    deliverable: "Verified Release",
    meaning: "One exact candidate is deployed and supported as live by current public contract and semantic evidence.",
    checks: [
      check("P8.G1", "Exact Release candidate eligible", "Commit, immutable artifact, configuration identity, and Application Contract/profile identities form one eligible candidate.", "Candidate manifest, digests, commit, configuration, and conformance references.", "Open the commit, artifact, configuration, and candidate manifest.", "pr"),
      check("P8.G2", "Migration and rollout preconditions resolved", "Required migration, compatibility, sequencing, and predecessor/recovery information is explicit.", "Migration/rollout plan and preflight observations.", "Open migration source, schema/compatibility evidence, and predecessor record."),
      check("P8.G3", "Candidate deployed and reconciled", "The intended host runs the exact artifact/configuration and provider/runtime state matches intent.", "Deployment receipt, service/container identity, digest readback, and reconciliation result.", "Open the server session and exact runtime identity.", "terminal"),
      check("P8.G4", "Contract checks pass publicly", "Required health/readiness checks pass through the intended HTTPS hostname from outside the host.", "Fresh external probes tied to the exact candidate and hostname.", "Open every raw public contract probe.", "probe"),
      check("P8.G5", "Required semantic checks pass", "The profile/contract-required user-visible behaviors pass through the public route.", "Semantic check run, inputs, outputs, timestamps, and candidate identity.", "Open raw semantic-check artifacts and relevant traces/logs.", "probe"),
      check("P8.G6", "Current Release and drift recorded honestly", "The verified candidate is the current Release and any launch-time out-of-band change remains visible.", "Release record, verification bundle, runtime readback, and drift scan.", "Open the Release, runtime identity, and every drift item."),
    ],
  },
  {
    id: 9,
    short: "Handoff",
    deliverable: "Operations Handoff",
    meaning: "Topology, Release, evidence, gaps, ownership, costs, drift, and ongoing observation are durable and current.",
    checks: [
      check("P9.G1", "Topology and resources assembled", "Current route, host, runtime, persistence, observer, and resource identities are linked in one record.", "Fresh provider/runtime observations and resource references.", "Open each real provider object, host session, and route."),
      check("P9.G2", "Launch and Release evidence assembled", "The evidence bundle connects candidate, operations, changes, public checks, and current Release.", "Versioned evidence bundle with source identities, times, methods, raw artifacts, and limits.", "Open the evidence bundle and every original artifact."),
      check("P9.G3", "Gaps, ownership, costs, and drift visible", "Every accepted/unresolved gap, recurring cost, responsibility owner, and drift item is explicit.", "Gap, cost, ownership, and drift records with provenance.", "Open each gap, source estimate or actual charge, and drift diff."),
      check("P9.G4", "Ongoing observation currently verifiable", "The normal workspace can show a current outside observation and its owner without reading launch chat.", "Observer configuration and fresh external observation linked to the current Release.", "Open observer state and latest raw probe.", "probe"),
    ],
  },
];

export const unresolvedProductDecisions = {
  U1: "Minimum operational baseline before Server Guy may say live.",
  U2: "Whether V1 supports one Application Profile or both initial profiles.",
  U3: "Whether the initial Application Contract needs explicit confirmation before paid work.",
  U4: "Which account actions remain user-only in Full Autonomy.",
  U5: "Approval Mode scope, freshness, and override semantics.",
  U6: "Always-on observation and notification owner.",
  U7: "Offline recovery behavior and authority.",
  U8: "How External Agent Clients reach Server Guy Control Points.",
  U9: "Which external actors may alter provider or configuration state.",
  U10: "How later candidate Releases are created.",
  U11: "Merge, deploy, repair, and rollback authority.",
  U12: "Rollback representation and predecessor semantics.",
  U13: "Whether MCP remediation is required in the V1 demonstration.",
  U14: "Incident Case closure policy.",
  U15: "Exact healthy and Verified evidence bar.",
  U16: "Migration compatibility and rollback requirements.",
};

const decisionsByPhase = {
  1: ["U5"],
  2: ["U2", "U3", "U16"],
  3: ["U13"],
  4: ["U15"],
  5: ["U3", "U4", "U5"],
  6: ["U4"],
  7: ["U1", "U6", "U15", "U16"],
  8: ["U10", "U11", "U12", "U15", "U16"],
  9: ["U1", "U6", "U8", "U9"],
};

export function productDecisionsForPhase(phaseId) {
  return (decisionsByPhase[phaseId] || []).map((id) => ({ id, text: unresolvedProductDecisions[id] }));
}

const allPass = (count) => Array.from({ length: count }, () => "pass");
const gate = (count, passed = 0, current = passed, blocked = []) =>
  Array.from({ length: count }, (_, index) => {
    if (blocked.includes(index)) return "blocked";
    if (index < passed) return "pass";
    if (index === current) return "current";
    return "required";
  });

const gateByBeat = {
  "start-input": gate(5, 0, 0),
  "workspace-ready": allPass(5),
  contract: allPass(4),
  "conform-clean": allPass(3),
  "conform-choose": gate(3, 0, 0),
  "conform-working": gate(3, 1, 1),
  "conform-returned": gate(3, 1, 1),
  "conform-merged": allPass(3),
  plan: allPass(4),
  "hetzner-connect": gate(4, 0, 0),
  "vps-notice": gate(4, 1, 1),
  "vps-approve": gate(4, 1, 1),
  "host-ready": allPass(4),
  "domain-choose": gate(5, 0, 0),
  "ns-task": gate(5, 1, 1),
  "ns-wait-1": gate(5, 1, -1, [1]),
  "ns-wait-2": gate(5, 1, -1, [1]),
  "ns-observed": gate(5, 2, 2),
  "acquire-task": gate(5, 1, 1),
  "dns-conflict": gate(5, 2, -1, [2, 4]),
  "dns-approve": gate(5, 2, 2),
  "route-verified": allPass(5),
  "ops-approve": gate(5, 0, 0),
  baseline: allPass(5),
  "restore-verified": allPass(5),
  "restore-accepted": gate(5, 2, -1, [2]),
  candidate: gate(6, 2, 2),
  "verified-live": allPass(6),
  "reachable-not-verified": gate(6, 4, -1, [4]),
  remediation: gate(6, 4, -1, [4]),
  reverified: allPass(6),
  handoff: allPass(4),
  workspace: allPass(4),
};

export function gateForBeat(beatId, phaseId, outcomes = {}) {
  if (beatId === "baseline" && outcomes.restore !== "verified") return gate(5, 2, -1, [2]);
  return gateByBeat[beatId] || gate(journeyOnePhases[phaseId - 1].checks.length, 0, 0);
}

export function isGateSatisfied(states) {
  return states.every((state) => state === "pass");
}

export const blockingDecisionByBeat = {
  "restore-accepted": "U1",
};

export const journeyOneCheckCount = journeyOnePhases.reduce((sum, phase) => sum + phase.checks.length, 0);
