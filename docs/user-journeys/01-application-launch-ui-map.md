# Journey 01 Operator UI state map

Status: workshop draft. This is the source map for UI mockups, not evidence that the product exists.

Canonical journey: [Journey 01: Launch an application](./01-application-launch.md)

## Purpose

The Application Launch mockups must render the product journey exactly enough that we can evaluate what the engineer sees, what Pi explains, what is authoritative state, and what action is available at every meaningful stage.

This document prevents two forms of drift:

- a chat transcript that fails to reflect operational state into a durable record;
- a polished dashboard that invents product decisions not present in the journey.

## Persistent workspace grammar

Every mockup uses the same application workspace:

1. **Application sidebar** — one workspace per application, with launch or health state.
2. **Application header** — application identity, environment, Approval Mode, and one concise current application status.
3. **Launch map** — an always-visible, low-text map of the nine user-facing phases with an explicit “you are here” phase, current Phase Deliverable, and Exit Gate progress. Storyboard state IDs and counts are prototype coordinates and do not belong in product chrome.
4. **Operator Sessions** — an application-scoped list of active and archived chats, with controls to start, switch, archive, and resume a session.
5. **Chat with Pi** — the primary interaction surface containing Pi's intent, explanations, questions, decisions, and embedded tool/activity events. It always names the current Phase Deliverable Pi is working toward.
6. **Operator Record** — a compact persistent summary containing only the current Phase Deliverable, its Exit Gate, and decisions recognized across Operator Sessions.
7. **Current state details** — opened on demand from the Operator Record or chat activity; this contains authoritative facts, provenance, resource identities, approvals, waits, and evidence without duplicating them in the default workspace.

Conversation is the primary surface but is not, by itself, the durable source of truth. When Pi recognizes a decision, correction, constraint, or operational fact in chat, it records the structured result in the Operator Record with provenance. The user can then track and correct it there. A chat claim does not change phase status, permission, resource identity, or verification state until the reflected record carries supporting evidence.

## Phase deliverables and exit gates

| Phase | Deliverable | Exit Gate conditions |
| --- | --- | --- |
| 1. Start | Launch Brief | Application identity recorded; repository readable; environment, authority, and intent explicit. |
| 2. Understand | Application Contract | Profile match or explicit mismatch recorded; material fields carry provenance; unknowns resolved or named as blockers. |
| 3. Conform | Conformance Result | Required changes merged; exact revision passes profile checks; no required gap remains. |
| 4. See the launch | Launch Plan | Topology and cost explicit; provider/user actions separated; verification and material risks named. |
| 5. Establish the VPS | Host Record | Host exists; identity and actual cost recorded; readiness checks pass. |
| 6. Establish the domain | Domain Route | Control observed; intended DNS and valid HTTPS observed externally; no unresolved conflict or propagation wait. |
| 7. Establish operations | Operational Baseline | Required responsibilities explicit; required services ready; evidence channels reporting. |
| 8. Go live | Verified Release | Exact candidate deployed; contract checks pass publicly; semantic checks pass and Release is current. |
| 9. Handoff | Operations Handoff | Evidence assembled; gaps and ownership visible; ongoing observation active. |

The prototype shows three levels deliberately: the map names the deliverable, Chat with Pi says what Pi is doing and hosts the next action, and the Operator Record shows only the check-level Exit Gate and recorded decisions. Pi may still loop, investigate, or request input inside the phase. Detailed current state remains one click away instead of occupying the persistent right panel.

## Predetermined UI versus free text

| Product information | Presentation | Why |
| --- | --- | --- |
| Phase, status, blockers, resource identity, cost, provenance, approval state, exact revision, domain state, verification result, and evidence | Predetermined structured UI | These facts must remain scannable, comparable, and durable. |
| Paid or account-level action | Predetermined approval or guided-operation UI | The expected effect, cost, and actor must be explicit before the action. |
| External wait such as DNS propagation | Predetermined waiting UI with observed state and next check | A spinner cannot communicate what was observed or how work resumes. |
| Pi's current intent, interpretation, risk explanation, and proposed next step | Pi-authored free text in the primary Chat with Pi surface | These require context-sensitive judgment and explanation. |
| Engineer corrections, constraints, questions, requested changes, and decisions | Free-text composer, with structured controls offered when useful; recognized decisions are reflected into the Operator Record | The engineer must be able to collaborate without learning a command language and still retain a reviewable operational record. |
| Tool calls and observations | Structured activity embedded in chat and linked to evidence | The engineer can follow Pi's work without confusing narration with evidence. |

## Shared visual states

The storyboard may use these statuses without redefining them per phase:

- **Not started** — no work in the phase has begun.
- **Inspecting** — read-only work is producing observations.
- **Needs input** — the engineer must answer or correct something before Pi can form a credible next step.
- **Awaiting approval** — a state-changing action is ready and Approval Mode requires a decision.
- **Acting** — Pi is using a permitted capability and activity is visible.
- **Waiting externally** — Server Guy is not changing state; it is waiting for an external condition and will re-check.
- **Blocked** — a precise unresolved condition prevents the phase exit.
- **Reachable** — the application answers somewhere; this is not equivalent to Verified.
- **Verified** — required checks through the intended public route support the claim.
- **Complete with gaps** — the phase can exit, but explicitly accepted gaps remain visible.

## Phase-by-phase screen inventory

Each row is a distinct mockup state. `Operator View` is predetermined UI. `Chat with Pi` is model-authored unless the row names an embedded activity event.

| ID | Mockup state | Operator View must show | Chat with Pi must show | Engineer action | Journey source |
| --- | --- | --- | --- | --- | --- |
| L1.1 | Start launch | Repository selector, production environment, Approval Mode, short operating-intent fields | Why these inputs matter and any ambiguity Pi notices | Select and describe | §User journey phase 1; §Starting state |
| L1.2 | Prerequisites visible | GitHub, Hetzner, Cloudflare, and domain starting-state checks with missing/available provenance | The smallest next prerequisite and what can still be inspected now | Connect, defer, or correct | §Starting state; §Important alternate paths |
| L1.3 | Workspace created | Application identity, authority context, durable Operator Session, next phase | Pi's initial understanding and intent to inspect | Continue or correct identity | §User journey phase 1 |
| L2.1 | Repository inspection | Live inspection activity, detected stack facts, unknowns, and provenance badges | Pi narrates its current hypothesis without claiming certainty | Ask or correct while inspection runs | §User journey phase 2; §Operator UI bullets 1–2 |
| L2.2 | Contract review | Application Profile match, Application Contract fields grouped as repository-declared, inferred, user-confirmed, or unknown | Pi explains the proposed contract and the material unknowns | Confirm or correct fields | §User journey phase 2; §Evidence produced |
| L2.3 | Profile gap or unsupported repository | Bounded conformance gaps or an explicit unmatched-contract result; no deploy action | Why the repository is outside the supported contract and what would make it eligible | Choose conformance or stop | §Important alternate paths: unsupported repository |
| L3.1 | Conformance plan | Required health, configuration, logging, and deployment-file changes, separated into source-controlled and operational work | Pi explains why each gap blocks a supported launch | Ask for change preparation | §User journey phase 3 |
| L3.2 | Reviewable repository change | Branch/PR identity, exact files, tests, checks, and approval status | Pi summarizes the change and highlights application-code versus operational configuration | Review or open the PR | §User journey phase 3; §Important alternate paths: conformance needs code |
| L3.3 | Conformance outcome | Merged revision or explicit unresolved gaps; supported/not-yet-supported status | Pi states what changed in its application understanding | Continue or resolve a named gap | §User journey phase 3 exit |
| L4.1 | Launch intent review | Target topology, expected cost, provider actions, engineer actions, verification, risks, and separate VPS/domain operations | Pi explains the plan and the most consequential assumption | Correct plan or proceed | §User journey phase 4; §Operator UI bullets 3–5 |
| L4.2 | Launch intent revised by evidence | A visible plan diff, changed evidence, resulting cost/risk/action changes | Pi explains why it adapted the plan | Accept, correct, or investigate | §User journey phase 4 behavior |
| L4.3 | Ready to establish infrastructure | Credible launch intent, participation checklist, next operation, unresolved items | Pi states what will happen first and what will not happen yet | Begin VPS operation | §User journey phase 4 exit |
| L5.1 | Hetzner access | Connection state, granted scope, read-only validation results, and missing permissions | Pi explains the access it tested and the intended resource | Connect or repair access | §User journey phase 5; §Approval and trust behavior |
| L5.2 | VPS action gate | Planned machine, region, image, estimated recurring cost, expected effect, and Approval Mode decision | Pi explains why this machine matches the launch intent | Approve, reject, or modify | §User journey phase 5; §Product requirements: paid operations |
| L5.3 | VPS provisioning | Visible provider activity and observations; no generic spinner | Pi narrates progress and exceptions with embedded provider events | Intervene only when needed | §User journey phase 5 behavior |
| L5.4 | Owned host ready | Hetzner resource identity, IP, region, machine state, actual cost, and next phase | Pi summarizes what exists and what remains unconfigured | Continue to domain | §User journey phase 5 exit; §Evidence produced |
| L6.1 | Choose hostname and path | Intended hostname plus two starting paths: domain already owned or domain needs acquisition | Pi asks only the material questions needed to choose the path | Choose path and hostname | §Settled decisions for this journey |
| L6.2 | Existing Cloudflare-controlled domain | Zone and control evidence, intended DNS route, HTTPS plan, and any conflicts | Pi explains what it can now automate | Continue according to Approval Mode | §User journey phase 6; §Settled decisions |
| L6.3 | Domain registered elsewhere | Registrar, Cloudflare zone state, exact nameserver delegation instructions, and control not observed | Pi explains the guided account step and embeds its latest checks | Update nameservers | §Important alternate paths: registered elsewhere |
| L6.4 | No domain owned | Guided acquisition/addition checklist, user-owned checkout boundary, and resumable return condition | Pi helps the engineer choose and complete the account step without pretending it owns checkout | Acquire/add domain, then return | §Important alternate paths: no domain; §Outside this journey |
| L6.5 | Waiting for control or propagation | Observed NS/SOA, last check, next check, elapsed time, and no-change waiting state | Pi explains what is pending and why it cannot continue | Check now or keep waiting | §User journey phase 6; §Important alternate paths: propagation pending |
| L6.6 | Existing DNS conflict | Conflicting records, expected impact, proposed resolution, and no silent overwrite | Pi interprets the conflict and offers bounded choices | Choose or correct resolution | §Important alternate paths: existing DNS conflicts |
| L6.7 | Configure route and HTTPS | Cloudflare control observed, DNS changes, TLS work, and live activity | Pi explains selected records and any adaptive decision | Intervene according to Approval Mode | §User journey phase 6 behavior; §Settled decisions |
| L6.8 | Public hostname verified | Intended hostname, DNS result, valid HTTPS, external response, and phase evidence | Pi distinguishes Verified from merely reachable | Continue to operations | §User journey phase 6 exit; §Successful outcome |
| L7.1 | Operational baseline scope | Host, database, runtime, secrets, backups, telemetry, logs, and sentinel responsibilities with required/optional/unresolved status | Pi explains the proposed baseline and calls out the unresolved launch-policy decision | Review baseline | §User journey phase 7; §Unresolved choice 1 |
| L7.2 | Establish operations | Inspectable activity for each responsibility, current status, and evidence links | Pi narrates current objective and embeds tool/observation events | Ask, correct, or approve when needed | §User journey phase 7 behavior |
| L7.3 | Operational responsibility incomplete | Exact missing responsibility, impact on launch claim, accepted-gap state, and retry path | Pi explains the risk without hiding the gap | Resolve, accept if policy permits, or stop | §Successful outcome bullet 4; §Product requirements |
| L7.4 | Environment ready for Release | Runtime endpoint, database readiness, secret references, backup/log/telemetry/sentinel status, and remaining gaps | Pi summarizes readiness and what verification will test | Continue to Release | §User journey phase 7 exit |
| L8.1 | First Release candidate | Exact repository revision, deployment configuration identity, candidate image/artifact, and migration plan | Pi explains why this candidate is eligible | Start or modify Release | §User journey phase 8; §Evidence produced |
| L8.2 | Deploying | Build, migration, deployment, and external-check Observations as separate visible activities | Pi explains what it is doing and any adaptive response | Intervene according to Approval Mode | §User journey phase 8 behavior |
| L8.3 | Reachable, not Verified | Reachability result separated from contract health and semantic verification | Pi explains why Server Guy cannot yet say live | Continue investigation or inspect evidence | §Operator UI bullet 9; §Successful outcome |
| L8.4 | Verification failed | Failed check, evidence, current candidate status, predecessor availability, and investigation state | Pi diagnoses adaptively without presenting the candidate as healthy | Collaborate, approve remediation, or stop | §Important alternate paths: verification fails |
| L8.5 | Verified live | Exact Release, intended HTTPS hostname, contract checks, Pi-selected semantic checks, and supporting evidence | Pi explains the live claim and remaining gaps | Complete launch | §User journey phase 8 exit; §Successful outcome |
| L9.1 | Operational handoff overview | Current Release, domain, health, costs, backups, telemetry, logs, sentinel, and recent work | Pi summarizes the application's current operational posture | Ask or inspect a subsystem | §User journey phase 9 |
| L9.2 | Evidence and outstanding gaps | Topology, resource identities, domain state, Release identity, launch evidence, gaps, and Pi-authored notes kept distinct | Pi interprets the record and offers next work | Open evidence or address a gap | §User journey phase 9 behavior; §Evidence produced |
| L9.3 | Ongoing application workspace | Health and observation status, current Release, recent activity, and persistent Chat with Pi | Pi is ready for ongoing operational collaboration | Begin normal operations | §User journey phase 9 exit |

## Workshop choices the mockups must not settle silently

1. The minimum required operational baseline before the word **live** can be used.
2. Whether V1 claims one fully supported Application Profile or both initial profiles.
3. Whether the initial Application Contract needs explicit confirmation before paid work in every Approval Mode.
4. Which account actions remain user-only in Full Autonomy.

Where one of these affects a screen, the storyboard must label it as a workshop decision or show explicit alternatives. It must not turn a convenient mockup default into product policy.

## Coverage rule

A phase is not considered mapped merely because it has one happy-path dashboard. It needs at least:

- an entry or decision state;
- an active collaboration or execution state;
- an exit, waiting, blocked, or verified state;
- every journey-specific alternate path that materially changes the engineer's experience.
