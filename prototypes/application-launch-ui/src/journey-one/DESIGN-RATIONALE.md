# Journey 1 UI — design rationale

Status: clickable planning prototype. It has no backend, providers, or persistence and is not evidence that Server Guy exists.

Canonical product source: [Journey 1: Application Launch](../../../../docs/user-journeys/01-application-launch.md).

## Run it

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
# open http://127.0.0.1:4173/journey-1.html
```

The dark top bar is prototype-only: branch outcome switches, click count, and Reset.

## Product model rendered here

- One fixed journey: Start → Inspect app → Make launch-ready → Review launch plan → Set up server → Connect domain → Configure and protect → Go live → Handoff.
- One named Phase Deliverable and one variable-size Exit Gate per phase.
- Forty Gate Checks total, distributed 5/4/3/4/4/5/5/6/4.
- One Phase Workspace per phase, with a visible list of one or more chats sharing its Record and Exit Gate.
- Passing a Gate makes every chat in that phase read-only and opens the next Phase Workspace seeded from the Operator Record, not sibling transcripts.
- Phase 9 makes its chats read-only and enters the normal application workspace.
- Chat with Pi is the primary flow.
- The default Record contains only the current Gate Checks and decisions recognized across the phase's chats.
- Activity, Changes, and Evidence are fixed deeper destinations.
- Every Gate Check Details view states what satisfies it, what evidence proves it, how a human verifies it, and exposes Ask Pi, open source/evidence, and re-run paths.
- Gate results are computed; the mock contains no manual pass control.
- U1–U16 remain visible and unresolved. The prototype may demonstrate branches but cannot turn a branch into product policy.

## Two-speed interaction

The passive lane stays in chat: one current Pi message, an optional typed card, and one primary action. Inputs, consequential consent, external waits, blockers, and failed verification interrupt that lane.

The engineer lane is the Inspector:

- **Record** — current Gate Checks and current-phase decisions.
- **Activity** — timestamped actions and observations from this Phase Workspace, with chat origin when applicable.
- **Changes** — repository, provider, configuration, and Release effects.
- **Evidence** — source, method, time, raw result, artifact, and limits.

The layout stays fixed. Pi selects typed content and reasons inside the phase; it does not invent panes or move controls.

## Prototype branches

The fixture exercises:

- clean or repository-change conformance, including the L3.W1–L3.W3 worker handoff;
- three domain starting paths;
- DNS propagation waits and conflicts;
- Approval Mode differences;
- verified or unproven restore evidence;
- verified launch or reachable-but-not-Verified remediation;
- evidence destinations for GitHub, Hetzner, server sessions, Cloudflare DNS, and raw probes.

## QA record

- Canonical coverage check: 39 presentation states, 9 phases, and 40 complete Gate Check definitions.
- Golden path: 13 clicks to the Operations Handoff, then one explicit transition into the normal workspace.
- Multiple chats: a focused phase chat can be created, titled from its first message, switched from the persistent chat list, and contributes decisions to the shared Record without importing sibling transcripts.
- Phase transition: every chat in the completed phase becomes inspectable read-only and the next Phase Workspace starts from the shared Operator Record.
- Gate detail: definition, evidence, human verification, Ask Pi, source/evidence destination, and re-run are available without a manual override.
- DNS conflict: Gate remains blocked and only bounded conflict choices are shown; there is no generic Next bypass.
- Unproven restore: P7.G3 remains blocked. Accepting the visible gap cannot advance while U1 is unresolved.
- Provider proof path: P5.G1 opens the exact mocked Hetzner object; host readiness opens the server session.
- Browser console: no application errors during the verified paths above.
- Desktop only for this prototype.
