# Fable review: combined PR #21 and deployment slice

> Historical review of the stated snapshot. The original verdict and line references below are preserved; the linked hardening report records subsequent fixes. Use [Roadmap](../../ROADMAP.md) for the remaining current acceptance work.

Date: 2026-09-08. Requested by the owner. Completed through the installed Claude CLI with `claude-fable-5-1`, high effort. Session `f273eaf8-f56f-41b6-86e0-a79ebecf4b66`.

The reviewer inspected a separate source snapshot of the integration tree: PR #21 at `c7ed574ce3053a2bf7f0be72e85c0ee2f1b39df5` plus the uncommitted shell, schema and real deployment implementation. The comparison base was `c692998771ad158ee2c9616391587cbf927dd414`. Tracked diffs against main and #21 accompanied the complete relevant source, including new files. The snapshot excluded runtime state and credentials. Only Read, Glob and Grep tools were enabled; no shell, edit, browser or MCP tools. Fable ran no tests and performed no provider operations. No review was posted to GitHub.

This is a review of the candidate we intend to put in the PR, not a claim that GitHub PR #21 already contains these changes. Line references identify the review snapshot. The [roadmap](../../ROADMAP.md) remains the implementation plan.

## Follow-up implementation

The owner accepted a bounded hardening pass. [Implementation and verification](../testing/2026-09-08-deployment-hardening.md) records the fixes and their current acceptance status. The assessment and raw reviewer response below describe the original snapshot; they are retained for traceability, not presented as a second review of the revised code.

## Codex assessment

**Do not merge the candidate yet.** The verified happy path remains valid; review identified recovery, provenance and acceptance gaps outside that single successful run.

Confirmed by source inspection after the review:

- Provisioning persists `serverCreateAttempted` before POST and never clears it for a known rejection. With no matching server, retry always stops. Application removal/source replacement are also blocked by the record. Recover a documented, definite non-creation outcome without weakening uncertain-outcome reconciliation; provide a deliberate way to abandon a failed intent when no billable server exists.
- `prepare_deployment` calls the same store function as the UI, which inserts a `user`/`user` message. Tool initiation must retain its actual origin. A model call does not become a user-authored instruction. The explicit purchase card is still required; this finding does not mean the tool alone can buy a server.
- The old browser specs target controls removed or renamed by the shell. Their failure count is not measured here. PR CI runs the small smoke selection; the new application-shell tests are outside it. Migrate applicable tests, deliberately retire obsolete expectations and include the functioning shell/deployment flow in CI.
- Purchase-time code compares saved offer and authority values. Approval re-prices, but a delayed worker or retry does not. Refresh the exact approved offer immediately before an actual purchase and re-request approval if its terms exceed authority.
- The deployment planner resolves repository HEAD separately from the older preparation/contract evidence and omits repository and GitHub connection IDs. Preserve fresh identity and make any revision difference explicit; this does not require every deployment to traverse the legacy contract stages.
- Plan validation allows a health-like check with empty expected content. Strengthen the verified-result contract and expose reviewable checks. A failed later check can also leave a synthetic object from an earlier successful create.
- New deployment writes replace the whole record without conditional transition guards. Tighten current races and enforce legal transitions before expanding lifecycle operations.

Findings requiring narrower interpretation or further verification:

- Do **not** clear provisioning uncertainty for every non-2xx response as the reviewer suggests. A server error can leave effects uncertain. Use documented provider outcomes, preserve response classification and reconcile before a new purchase where necessary. A token rejection on the initial read occurs before the create-attempt flag, so not every invalid-token case triggers the lock-out.
- The host private key is embedded in cloud-init user data. The reported unprivileged/container metadata access path was not exercised in this review. Treat it as a security finding to investigate and close; do not claim host impersonation was demonstrated. A metadata firewall alone also needs host-user and persistent cloud-init-file exposure considered.
- The Host-based same-origin guard lacks a controller host allowlist. No browser DNS-rebinding exploit was run; surrounding browser/runtime mitigations were not assessed. Test and harden the request boundary rather than claiming loopback binding is sufficient authentication.
- A separate creation-request column, generic attempt tables, host entities and copying milestones into observations are design proposals, not automatically required fixes. Preserve one owner for each fact and introduce only the structure needed by the implemented lifecycle. Reusing an explicit UUID request key as application identity is not, by itself, a demonstrated correctness bug.
- The assertion that worker state transitions prevent simultaneous writers is not a proof. Conditional writes and targeted race tests should settle the actual cases. The reported alias-path lock issue also needs testing with the combined Pi/deployment worker process, not only the deployment lock in isolation.
- The reviewer calls the leading fixes small; effort has not been established. Full legacy acceptance reconciliation may be substantial.

## Database answer

The migration is incremental: schema v10 to v11 adds direct application ownership to chats and removes repository uniqueness; v12 adds the initial `deployments` table. No permanent domain table was retired. The migration rebuilds the chat table while preserving IDs, rows, references and native-session identity.

Decisions, observations, contracts, conformance/publication records, activity, phase workspaces and the legacy operation guards still have callers. The Record is a UI projection over this evidence, and its inspector still renders in the new dashboard. The `environment` column also remains despite removing Production from the interface. The new deployment path bypasses manual phase navigation but does not complete the backend phase migration. Its one-record-per-application constraint is an initial-deployment limitation, not a routine-release history model.

## Reviewer response

**Verdict: not mergeable yet.** The live happy path is real, the v10 to v12 chat-ownership migration is careful and well tested, and the model cannot shape Compose beyond image, port, env and command. But the deployment path has one lock-out bug that can strand both the deployment and the application, one provenance bug in the new model tool, and the retained shell acceptance is demonstrably unverified. All three are small fixes. Below, "observed" means I traced it in code; "uncertain" means I could not confirm without running.

## Prioritized findings

**P1. A definitive provider rejection permanently strands the deployment and the application (observed).**
`src/server/deployment-executor.ts:280` sets `serverCreateAttempted` before the create call, and `src/server/hetzner.ts:42-50` throws the same kind of error for "no response" and for an HTTP 4xx that proves nothing was created. On retry, `deployment-executor.ts:225-228` refuses forever because no labelled server exists. Retry is the only action in `src/app/api/applications/[applicationId]/deployment/route.ts:79-84`. Deletion is blocked at `src/server/phase-one.ts:384-387` and repository change at `src/server/setup-correction.ts:144-147`. Trigger: Hetzner capacity error for the chosen type in the chosen location, quota exceeded, invalid token, or a name collision since server, SSH key and firewall all use the 8-character prefix at lines 235, 241 and 255. Impact: the user sees "outcome unresolved", every retry fails, and the only recovery is SQLite surgery. The same trap applies when the owner deletes the server in the Hetzner console at lines 221-224, where the "separate decision" does not exist anywhere. Fix: return a typed outcome from the provider client and clear the flag on a definitive non-2xx response for the create call. Add an explicit "abandon deployment" action that re-queries by label, requires a typed confirmation, and records the decision as an event.

**P1. The model tool fabricates a user-authored message (observed).**
`src/server/deployment-store.ts:81-86` inserts a message with role and source "user" whenever a record is created. `src/server/pi.ts:492-503` exposes `prepare_deployment` in every phase per `pi.ts:150-155` and calls that function from inside a model turn. Trigger: the user asks "what would hosting cost?", the model calls the tool, and the transcript now shows the user demanding a deployment. This breaks PR #21's own rule that Server Guy-initiated requests carry source "server-guy" at `src/server/pi-runs.ts:129-133`, and this message is the recorded intent behind a purchase flow. Fix: pass an origin to the store and write the request as a server-guy message when triggered by the tool. Also note the tool commits a durable side effect mid-run rather than in the run's final transaction. That is tolerable for an intent record but should be stated in the spec.

**P1. The legacy browser suite is broken by the shell change, and PR CI will not notice (observed selectors, uncertain behaviour).**
The shell moves the step bar into a collapsed disclosure and removes the phase rail and Record toggle in the `operator-shell.tsx` hunk of `changes-vs-pr21.diff` lines 487-622, and `current-step.ts` renames the continue action. Specs still target the old names: `tests/browser/phase-two.spec.ts:37,44,270,278,290,300`, `tests/browser/phase-three.spec.ts:27,51,58,350,355,417,422`, `tests/browser/phase23-followups.spec.ts:17,24,67,84,100` and `tests/browser/workspace-navigation.spec.ts:36,40,75,125,157`. `.github/workflows/checks.yml:43-47` runs only the two smoke journeys from `tests/browser/journeys.ts:12-24` on pull requests, neither of which touches the new shell. Increment 1's "existing flows work in the new shell" is therefore unproved. Fix: run the full suite before merge, update or retire each spec deliberately, and tag at least one application-shell journey as smoke.

**P2. Purchase authority is checked against the recorded offer, never the live price at purchase time (observed).**
The route re-prices at approval in `route.ts:53-64`, but `deployment-executor.ts:205-210` compares the stored offer with the stored cap, and retry re-queues the same authority with no expiry. A retry days after approval buys at whatever Hetzner charges then. Fix: re-run the offer lookup inside `provision` before the create call, require the same type and location and a monthly price at or under the cap, and give authority a validity window.

**P2. Deployment source identity is looser than the evidence chain it sits beside (observed).**
`src/server/deployment-planner.ts:26-36` resolves the default branch head by owner and name only. It does not bind the repository ID the way `phase-one.ts:146-160` does, does not record the GitHub connection ID, and has no relation to the Application Contract commit or any verified candidate. A transferred repository whose name is reused, or a HEAD that differs from the inspected commit, deploys a tree the Record never described. Fix: derive the revision from the retained repository observation, store repository ID and connection ID on the record, and surface a mismatch against the contract commit before approval.

**P2. "Verified" can be earned by trivial model-authored checks (observed).**
`src/server/deployment-types.ts:39-58` allows an empty `contains` and any 2xx status, and the marker token is optional. `src/components/server-guy/deployment-panel.tsx:179-182` shows only check names before approval. Fix: require at least one check with non-empty content matching or a capture, and show method, path and expected status in the review disclosure. Related: retries re-run mutating checks with a fresh marker at `deployment-executor.ts:572-604`, so a failure after the create step leaves synthetic objects in the user's database with no cleanup.

**P2. The host SSH private key travels through cloud-init user data (observed design weakness).**
`deployment-executor.ts:266-275,292` inject the generated host private key into user data. Any process on the VM, including application containers, can read the metadata endpoint and obtain that key, which allows impersonating the host to the controller that later ships the Compose file with the database password and supplied secrets. Fix: add a cloud-init `runcmd` that blocks 169.254.169.254 from Docker networks, or let cloud-init generate host keys and pin them via a controlled first-connection path. Port 22 open to the world with root login at lines 258-263 is acceptable for this slice but worth restricting to the controller address when known.

**P2. Deployment state has no guarded transitions or revision counter (observed, low impact today).**
`deployment-store.ts:22-29` overwrites the whole body unconditionally. `route.ts:65-74` re-reads the latest row but then saves the stale copy. `deployment-store.ts:69-71` uses a deferred transaction, so a genuine race produces a UNIQUE error instead of the existing record. Two concurrent log refreshes lose output. The current state machine keeps web and worker from writing simultaneously, but releases and retirement will race. Fix: add a revision column and expected-status guards like `updateConformanceRun` in `src/server/db.ts:842-873`, and use immediate transactions.

**P3. Smaller items.**
- `src/server/deployment-store.ts:34-36` writes into the recorded chat without a writability check, so archived chats receive messages. The pi path refuses this.
- `src/server/operator-view.ts:306-313` still tells the model that Hetzner access is an upcoming requirement before "Set up server" via `phase-one-spec.ts:108-113`, in the same tool result that reports a live deployment. Contradictory guidance.
- `src/server/deployment-worker.ts:17` does not canonicalise the lock path while `src/server/pi-worker.ts:45` does, so alias paths permit two deployment workers.
- `deployment-executor.ts:89-93` miscounts parent segments for a context like "./api" or with a trailing slash. Normalise the plan context.
- `src/worker.ts:16` reports "The Pi worker could not start" for any worker failure.
- The shell polls every 2.5 seconds and replaces the whole view in the `operator-shell.tsx` hunk at diff lines 363-396. Uncertain whether this clobbers in-flight optimistic chat state.
- Inherited from PR #21: `src/server/schemas.ts:52-63` trusts the Host header, so DNS rebinding passes the same-origin check. The new Hetzner route raises the stakes: swapping the token before an approval deploys source and secrets into an attacker's project. A loopback host allowlist would close this.

**Migration assessment (observed, no data-loss bug found).** `scripts/migrate-chat-ownership.mjs` disables foreign keys outside the transaction, verifies row counts and set equality, rebuilds indexes, checks references, and rolls back on orphans. `scripts/prepare-db.mjs` backs up first and the resume and orphan tests in `tests/application/integration/chat-ownership-migration.test.ts` cover interruption. Gaps: only a v10 fixture exercises the chat rewrite, version 11 is accepted without a fixture, and `README.md:83,110` still describe version 10 and `.pre-v10` backups, which is the operator guidance a data-preserving upgrade depends on. Drizzle push with force remains the step that could rebuild a table; the tests are the only guard.

## Database design assessment

- **Keep** decisions, observations, contracts, conformance proposals and runs, acceptance checks, publication grants and activity. They are live through `phase-one.ts:444`, `phase-two.ts:776`, `phase-three.ts:798,860,1868`, setup and revision correction, and they hold the only source-write authority. The deployment path never touches them, which is correct.
- **Retain internally** phase workspaces. Still the run context, tool scope and activity owner, and the phase routes remain reachable from the collapsed step bar. Two pieces are now dead: the "Phase N is complete" branch in `src/server/workspaces.ts:78-79` is unreachable except when the last phase completes because `loadChat` always substitutes the current workspace, and `chat-list.tsx` and `phase-rail.tsx` have no importers but keep unit tests.
- **Adapt** applications. The client-supplied request key becomes the primary key at `phase-one.ts:72,97`. Add a separate unique creation-request column so IDs stay server-minted.
- **Keep** chats as migrated, and application previews and preparation branches.
- **Retire later** application operations. Still live for preview, preparation and phase-three work at `phase-three.ts:963,1225,1486,1843` and `preparation.ts:92,160,287`. The deployment path ignores it and relies on the worker lock plus status.
- **Adapt** deployments. Add a revision column and guarded updates, an attempt or receipt history separate from the single record, host identity separate from deployment identity, a foreign key or removal of the embedded chat ID, and observation rows for milestones so the Record and the deployment agree.

## Essential missing tests

- Create-call definitive rejection followed by a successful retry, and the abandon action, once P1 is fixed.
- Crash after the create call returned but before the server ID was saved, reconciled by label with a fake provider returning the server. Only the "no server" branch is covered at `tests/application/unit/deployment-executor.test.ts:124-137`.
- Route tests: approval re-pricing mismatch, approval after status change, retry only from failed, prepare idempotency, cross-origin rejection.
- Worker tests: interruption marking on start, lock exclusivity, attempt timeout.
- Planner tests with a fake SDK: existing Dockerfile reuse, secret rejection, read budget, no plan submitted.
- Tool test that `prepare_deployment` never writes a user-sourced message and returns the existing record.
- Migration: a v11 fixture, and a v10 fixture with three workspaces and three primary chats to prove default chat selection and completion semantics after ownership moves.
- Verification: origin escape via a backslash path, and no retry on a 4xx health response.
- A browser journey for the deployment panel with a fake provider, plus the legacy journeys re-run.

Explicit deferrals I did not count against merge: HTTPS, backups, monitoring, routine releases, BYOM, host retirement and non-loopback controller auth. Host retirement nevertheless needs at least a documented recovery procedure now because of the P1 trap.
