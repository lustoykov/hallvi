# Phase 3: Make launch-ready

Status: implemented on `codex/phase-three-conformance`, stacked on the Phase 2 branch. This document is the implementation contract for Phase 3: the transition, the conformance brief, Pi's staged changes and isolated previews, approval and publication, external returns, the exact candidate, the versioned check set and its runner, the Docker prerequisite, and the boundaries this slice deliberately leaves alone. The [journey](../user-journeys/01-application-launch.md#phase-3--make-launch-ready) owns the product behavior and gate definitions; [ROADMAP.md](../../ROADMAP.md#phase-3-conformance-result) owns build order and status; the [testing guide](../testing/phase-one-acceptance.md#phase-3-acceptance-make-launch-ready) owns acceptance cases and dated evidence.

## Outcome and boundary

Phase 3 produces a **Conformance Result**: one exact, eligible repository revision on the default branch plus Server Guy's own evidence that every required profile check passed for it. It makes the application's source ready for the later launch phases. It does not deploy the application, provision anything, run production migrations, verify a public hostname, or merge. Deployment, hosts, domains and runtime services are Phases 4 to 8.

```text
Retained Application Contract (Phase 2)
        ↓ explicit Continue
Conformance brief: base commit, required changes, scope, acceptance bar
        ↓ Continue with Server Guy (default)      ↓ export the same brief
Pi: read → stage change → propose behavior checks → isolated preview → fix
        ↓ final Run transaction                    ↓ external harness / manual work
Proposal saved (approved per policy) ←──── returned pull request, branch or commit
        ↓ explicit grant + policy
Server Guy publishes one branch and one pull request (never merges)
        ↓ the engineer merges on GitHub
Refresh: the observed default-branch head is the candidate; the reviewed
change is compared with it; scope is checked on the reviewed diff
        ↓ Verify candidate
Worker runs the check set over the exact commit in disposable containers
        ↓
P3.G1 candidate · P3.G2 changes resolved · P3.G3 checks passed
```

## Transition and retained evidence

**Continue to Make launch-ready** is offered when the four Application Contract checks pass. One immediate transaction re-evaluates them from current records, refuses while any Run is queued or running, retains on the completed Inspect app workspace the check results and the contract identity (`contractId`, `contractVersion`, profile identity and version, `commitSha`, the inspection Observation and the connection), and opens the Make launch-ready workspace with its primary Chat. No request starts automatically: the engineer chooses the working environment. Completed phases stay readable and read-only at every mutation boundary; the phase strip distinguishes the current phase from the viewed one; Phase 4 has no Continue.

Phase 3 works from the retained contract or its active revision. A revision proposed during Phase 3 (the existing `propose_application_contract` with `revises`) is committed in the same final transaction as the answer, appends and supersedes like any other revision, and invalidates by projection everything bound to the previous version: proposals cannot be approved against a newer version, and runs bound to an older version are stale. The one exception is the reply that makes the revision: a change or behavior checks staged in that same reply bind to the revision when it stays at the same commit and every field the change maps is still a required change; otherwise the attempt fails and nothing from it is saved, the revision included. A revision that reintroduces an unknown, contradictory or unsupported required value blocks all three checks with the correction path (a further revision) until it is resolved. The completed Phase 2 deliverable stays as recorded.

## The conformance brief

Derived deterministically on every read from the contract in force, never stored:

| Part | Source |
| --- | --- |
| Repository, default branch, base commit | Application record, latest inspection, the contract's `commitSha`. |
| Contract identity | id, version, profile id and version. |
| Required changes | The contract's conformance items: field, required value, what the repository does now, the change. |
| Blockers | Unresolved required values, listed as blockers and never converted into changes or choices. |
| Allowed scope | Application source under the repository root as needed; the sensitive path patterns that are never changed (workflows and repository automation, git internals and hooks, commit hooks, environment files, key material, secrets and credential files, SSH keys). |
| Acceptance bar | The versioned check set with what each check proves and its limits, the accepted or proposed application-behavior definition, and the runner configuration derived from the contract (port, health path, database, migration tool, required variables with synthetic values). |
| Exclusions | No deployment or infrastructure, no merge by Server Guy, no workflow/hook/credential changes, no F-8/U1/U15/U16 decisions, no change that resolves a blocker by choosing for the engineer. |

**Export** produces the same brief as text for Codex, Claude, another harness or manual work, with the return instruction. The export is recorded once per contract version as Activity; it does not start a handoff timer (G-HANDOFF-TIMEOUT stays open).

## Continue with Server Guy: staged changes and isolated previews

Phase 3 Runs keep the Phase 2 tools (the pinned inspection and reads at the base commit, the contract lookup and revision) and add five scoped tools:

| Tool | Effect |
| --- | --- |
| `get_conformance_brief` | The brief, the saved proposal, the behavior checks, what this request has staged, and whether the execution environment is available. Local records only. |
| `propose_source_changes` | Stages the complete change: full contents per file or a deletion, and a mapping from every required change to the paths that resolve it. Validated: safe paths, no denied or sensitive paths, text only, bounded count and size, credential shapes rejected by JSON path before any reason could echo them, existing files must have been read first (so the change is reviewable as a diff), every required change mapped. A second proposal in the same Run replaces the first and makes the preview stale. |
| `propose_acceptance_checks` | Stages the application-behavior definition: HTTP steps with expected status and body substrings, grounded in cited snippets of saved reads at the base commit; a step whose route no cited snippet declares is rejected, as is a set of unasserted GET requests. |
| `run_conformance_preview` | Executes the full check set in the isolated runner over the base commit plus the staged changes (the base alone when nothing is staged) and returns bounded per-check results; the run is recorded as a preview bound to the Run. |
| `run_repository_command` | One command in the same runner after installation, for investigation; recorded as a command run. |

Previews and command runs are **worker evidence**: recorded, inspectable, never a gate input. Editing the staged change after a preview makes it untested again, and the Record says "untested since last edit" whenever no preview matches the exact staged files. When the execution environment is unavailable, the preview tool fails with the prerequisite named; Pi still proposes the change and the checks and must say they are untested.

The final Run transaction saves the staged change as a **proposal** (origin `server-guy`) and the staged checks as a **behavior-check definition**, guarded against a contract that changed underneath them (a stale proposal fails the Run with the reason in chat and rolls everything back, like a stale contract). A saved proposal supersedes the workspace's previous active proposal. Approval follows the Approval Mode at commit time:

| Mode | Publication |
| --- | --- |
| Always ask | The engineer approves the change in the Record, then publishes. |
| Let Server Guy decide | Pi states whether publication should wait (`requestApproval`, default true); with no request, the change is approved by the policy and published after the commit. |
| Full autonomy | Approved by the policy and published after the commit. |

Behavior-check definitions are accepted by the engineer, except under Full autonomy where a definition that does not weaken the accepted one is accepted at commit. A weaker definition (fewer steps, fewer writes or fewer body assertions) always needs the engineer. Accepted definitions are versioned and executed beside the profile checks; they cannot be weakened unilaterally.

## Publication, authority and the exact candidate

The GitHub connection stays read-only until the engineer chooses **Allow publishing** for one application. That verifies the minimum for the connection's mechanism (push permission for a CLI login; `contents: write` and `pull_requests: write` for the App installation), records what was observed with the connection id, and ends when the connection is replaced. A broadly scoped token is not a grant.

Publication is a controller-side effect outside any Run: inputs are rechecked immediately before it (proposal state and digest, the approval's digest, the contract version, the grant and connection), then one commit is created from the staged files on the base commit through the Git Data API, one branch named after the proposal, and one pull request against the default branch. Every retry reconciles first: a branch whose commit carries this proposal's trailer, or an existing pull request for the branch, is adopted; a branch of the same name made by someone else is refused, never overwritten. Receipts and failures land on the proposal; Activity records the publication or its failure. **Server Guy never merges**: the pull request is reviewable on GitHub and the engineer merges it, in every Approval Mode, and the UI says so.

**Refresh from GitHub** observes the pull request and the default branch. An open pull request keeps P3.G1 and P3.G2 unsatisfied (preview results only). Once merged, the candidate is the **observed default-branch head**, whatever the merge method (merge, squash or rebase, classified from the merge commit when visible); the reviewed change is then compared with that exact commit file by file, and the reviewed diff is checked against the scope rules. Differences, out-of-scope files or unexpected files keep P3.G2 blocked until a reviewed replacement. A later push to the default branch moves the candidate and makes the previous run's evidence history.

**External returns** accept a pull request URL or number, a branch, or a commit against this repository only; the diff from the brief's base is fetched independently and the same scope rules apply. The worker's own report is displayed at most and never counted; the mapping for a returned change is established by the conformance run. **No change required** selects the contract commit as the candidate; it still needs a current conformance run.

## The check set and its runner

Check set `fastapi-uv/conformance` v1, executed by Server Guy over an exact tree (the archive at the commit, plus the staged overlay for previews; nothing is ever reconstructed from Phase 2's redacted or truncated Observations):

| Check | Proves | Limits |
| --- | --- | --- |
| Locked dependency installation | `uv sync --locked` succeeds in a fresh container. | Downloads only through the allowlisting proxy; a broken package is caught later. |
| Required configuration is enforced | Without the contract's secret variables the application refuses to start and names a missing variable. | Only recorded secrets are withheld; name match on bounded output. |
| Disposable PostgreSQL is reachable | A fresh PostgreSQL with synthetic credentials accepts connections on the internal network. | The runner's database, never production; not applicable without PostgreSQL in the contract. |
| Migrations apply to an empty database | `alembic upgrade head` succeeds against it. | Forward only (U16 open); other tools are explicit failures, not passes. |
| Application starts | The tree's start command (Dockerfile CMD, else the contract's) loads the ASGI application and keeps running. | Runs in Server Guy's runner image, not the repository's Dockerfile image (F-8 open). |
| Health endpoint answers from outside the process | A sibling container receives HTTP 200 from the contract's health path on the contract's port. | Private-network probe; the public hostname is P8.G4. |
| Accepted application behavior | The accepted steps receive their expected statuses and bodies through the running application and its database. | Only the accepted definition; not run until one is accepted. |
| Repository tests pass | pytest passes with the disposable database available. | Authors' choice of coverage; never a substitute. |

Outcomes are `passed`, `failed`, `not-run` (a prerequisite failed, the run was cancelled or timed out) and `not-applicable` with the record that proves it. A required check that is not run cannot satisfy the gate; an unsupported configuration is an explicit failure.

Runner boundary, enforced and tested with real containers: the exact tree is copied into a fresh workspace volume owned by the workload user; every step is its own container with `User 1000:1000`, all capabilities dropped, `no-new-privileges`, a read-only root, a tmpfs `/tmp`, bounded memory, CPU, processes, time and captured output; no bind mount of any host directory, no Docker socket, no host network, never privileged. Installation is the only step with a way out: an allowlisting CONNECT proxy in a sibling container (package index and interpreter downloads only) that is removed before any repository code runs; the application, its database and the probe share an internal network with no route out. The probe is Server Guy's own script in a sibling container; its captured output is the evidence, so neither the model nor the application can author a pass. Output is redacted with the same credential patterns as repository reads and bounded. Every resource carries the run's labels; the run's end, cancellation, timeout, failure and a worker restart remove them, and an interrupted attempt is recorded as interrupted, never passed. A rerun appends a new attempt.

Every run is bound to the exact commit or tree digest, the contract id and version, the profile version, the check-set version, the accepted behavior-check version, the runner image digest and the execution configuration. Any change makes the result history; the latest run over the current candidate with current bindings is the only input to P3.G3.

## The Docker prerequisite

Built-in execution needs a reachable Docker Engine on the controller host (the machine running Server Guy, not the browser and not the future Deployment Host). Discovery connects to the configured engine (DOCKER_HOST, then the active Docker context, then the standard sockets that Docker Desktop, OrbStack, Colima, Rancher Desktop, rootless and system engines create) and classifies what the evidence shows: `ready`, `not-found` (no socket exists), `unreachable` (a socket nobody answers on: installed but stopped), `permission-denied`, or `unsupported` (a remote endpoint, a non-Linux engine or an API older than 1.41). Finding a `docker` executable is not proof of anything and is not used. Docker Desktop is not required; any engine with the standard local socket works.

**Settings → Execution** and the Conformance Result show the state, the machine that was checked, one sentence on why it is needed, one recovery action with the official Docker instructions for the host, **Check again** with visible pending, success and failure states, and technical details. **Prepare execution environment** pulls the runner images and runs a constrained container, with progress visible; "engine reachable" and "execution environment verified" are distinct. Nothing is installed or changed on the host. Phases 1 and 2 never require it; after the environment becomes available the engineer resumes deliberately, and nothing pending is launched by the recovery.

## Gate Checks

| Check | Satisfied when | Otherwise |
| --- | --- | --- |
| P3.G1 Exact candidate revision identified | The active proposal has a candidate: the observed default-branch head after the merge, or the contract commit on the no-change path. | Not yet while nothing is proposed, a change waits for approval or publication, or a pull request is open; a closed pull request is named. |
| P3.G2 Required source changes resolved | Every conformance item is mapped, the reviewed diff is within scope, and the candidate contains the reviewed change exactly. | Blocked on unmapped items, out-of-scope or unexpected files, or a candidate that differs; not yet while unmerged. |
| P3.G3 Profile conformance checks pass | An accepted behavior definition exists and the latest run over the exact candidate with current bindings passed every required check. | Blocked without an accepted definition, on failure or an incomplete run; not yet with no run, a running run or stale bindings. |

All three are blocked when the contract in force reintroduced a blocker.

## Records, Activity and diagnostics

Schema v9 adds four tables: `conformance_proposals` (one row per proposal or returned change, superseded like Decisions, carrying approval, publication receipt, external return, candidate and verification as JSON), `conformance_runs` (one row per execution attempt with its bindings, configuration and per-check results), `acceptance_checks` (versioned behavior definitions) and `publication_grants`. `db:push` upgrades a v8 database in place after a backup; v6 still upgrades through the v8 columns; v7 stays refused.

Activity records the meaningful outcomes: Inspect app completed, Make launch-ready started, brief exported, change proposed / approved / published / publication failed / withdrawn / returned, publishing allowed or revoked, behavior checks proposed / accepted, candidate recorded, conformance checks requested / passed / failed / incomplete, and a contract revision made in Phase 3. Reads, tool calls, previews and execution steps stay in local diagnostics and spans; no telemetry dependency is added.

## Deliberately not in this slice

Deployment, provisioning, DNS, paid infrastructure, production migrations and public-hostname verification (later phases); merging (the engineer); remote Docker contexts and any file-transfer semantics they need; more than one runner image; migration tools other than alembic (explicit failure); a workflow-file proposal path (workflow changes are out of scope, not a separate approved item yet); a handoff timeout; the U1, U15, U16 and F-8 policies, which remain visible on the contract and are required at their later gates; Phase 4 and its Continue.

## Owning code

- [`phase-three.ts`](../../src/server/phase-three.ts): the brief, staged work inside Runs, the final-transaction commit, approval, publication, external returns, candidate refresh and verification, the no-change path, grants, the worker's candidate run.
- [`phase-transition.ts`](../../src/server/phase-transition.ts): the explicit Phase 2 → Phase 3 transition.
- [`phase-three-spec.ts`](../../src/server/phase-three-spec.ts): P3.G1–G3 as projections.
- [`conformance-brief.ts`](../../src/server/conformance-brief.ts), [`conformance-definition.ts`](../../src/server/conformance-definition.ts), [`source-proposal.ts`](../../src/server/source-proposal.ts), [`acceptance-checks.ts`](../../src/server/acceptance-checks.ts): the brief, the versioned check set and scope rules, the two validators.
- [`execution-tree.ts`](../../src/server/execution-tree.ts), [`tar.ts`](../../src/server/tar.ts): the exact tree, its digests and archive validation.
- [`docker.ts`](../../src/server/docker.ts), [`conformance-executor.ts`](../../src/server/conformance-executor.ts), [`runner-scripts.ts`](../../src/server/runner-scripts.ts), [`conformance-runs.ts`](../../src/server/conformance-runs.ts): engine discovery, the runner, the proxy and probe, durable attempts.
- [`github-publication.ts`](../../src/server/github-publication.ts): Git Data API publication with reconciliation, pull-request and branch observation, compare and content reads, permission verification.
- [`pi-conformance.ts`](../../src/server/pi-conformance.ts) and [`pi.ts`](../../src/server/pi.ts): the Phase 3 prompt and tools.
- [`conformance-record.tsx`](../../src/components/server-guy/conformance-record.tsx), [`execution-setup-screen.tsx`](../../src/components/server-guy/execution-setup-screen.tsx): the Record and Settings surfaces.
