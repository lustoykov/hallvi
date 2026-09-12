# Implementation plan

The active delivery sequence for the application operator redesign. [Product](PRODUCT.md) owns product direction and scope; [operator design](docs/operator-design.md) owns design decisions and open questions; [current architecture](docs/architecture.md) describes the existing implementation. Dated audits and old acceptance rubrics do not create additional work commitments.

## Current priority and sequencing boundary

**Current priority: make the simple deployment experience beautiful, understandable and delightful before expanding application complexity.** On 12 September 2026, the owner confirmed that application deployment has been demonstrated and asked to focus next on the database-to-UI mapping and the happy path. Opus is working on this stage, as reported by the owner; this is work in progress, not a completion claim.

Connect real saved records and execution evidence to the accepted reference designs through the [presentation contract](docs/presentation-contract.md). Pi supplies structured observations; deterministic view projections and components own the layout and visual hierarchy. Polish the journey from adding a repository through permissions, visible progress and a verified result to opening the application from the user's PC. The next gate is the owner accepting this complete experience on a fresh run, including refresh and return visits.

Keep the scope on the views and interactions needed by that journey. Medium and more complicated applications, broader ongoing care, and speculative hardening follow this UI/UX checkpoint.

## Sprint TODO

This is the single implementation checklist. Completed means merged into `main`; distinguish local work from shipped work. Update the remaining items as implementation and user reviews teach us more.

- [x] **Execution loop** — merged as [5426bbc](https://github.com/lustoykov/server-guy/commit/5426bbc7da15ac3e779d6bb2270785c01bc232db), 12 September 2026. Main conversation, general host Bash, three permission modes, live approval and execution history; side chats have read-only tools. [Verification](docs/testing/2026-09-12-operator-execution.md).
- [x] **Finish checkpoint cleanup** — remove the premature server-attachment form and duplicate conversation headings, and clarify server setup in the design. Merged in [PR #55](https://github.com/lustoykov/server-guy/pull/55), 12 September 2026.
- [x] **Remove the fake test application** from the normal workspace. Done locally with the schema 15 reset; keep test fixtures separate from applications the user manages.
- [x] **Data model — merged in [PR #55](https://github.com/lustoykov/server-guy/pull/55) as [95b3829](https://github.com/lustoykov/server-guy/commit/95b382964e50c96fbb0c828bc8a6a02fca40976c), 12 September 2026.** [Verification](docs/testing/2026-09-12-operator-storage.md). The owner reported the UI works perfectly on 12 September using Docker’s getting-started app. [Main-PC handoff](docs/handoffs/2026-09-12-operator-storage.md). Four tables: applications, conversations, messages and saved information. Put current operator state on the conversation and response; keep native Pi history and execution files. Support text and shared-record/execution references in messages. Delete the replaced workflow tables and callers, initialize fresh development SQLite, and preserve account credentials and `.env.local`. Verify creation, refresh, conversation execution and shared information before review. No provider provisioning in this checkpoint.
- [x] **Hetzner provisioning — merged in [PR #56](https://github.com/lustoykov/server-guy/pull/56), 12 September 2026.** [Verification and trial](docs/testing/2026-09-12-hetzner-provisioning.md). General provider requests, controller-owned SSH access, verified connection persistence and shared outcomes. The linked report records the earlier read-only Pi/catalog proof; the owner subsequently confirmed a successful application deployment on 12 September. That dated deployment demonstrates capability, while the UI/UX acceptance checkpoint below remains open. Pi inspects a real repository, determines its needs, arranges a host through general tools and saves its connection. Review server selection within the deployment journey; no standalone SSH attachment form. Existing-machine setup uses a public key and a trusted host fingerprint within the main conversation.
- [ ] **Map real data to the designed UI — current stage, Opus working on it.** Implement the agreed first slice of the [presentation contract](docs/presentation-contract.md): map persisted observations and controller evidence into shared view models and the accepted components. Review the existing deployment records against the reference screens, then verify fresh Pi output uses the same path. Keep observed, planned, absent, unassessed and stale information truthful; visual quality must not depend on fabricated evidence or a separately maintained demo dataset.
- [ ] **Polish and accept the lightweight deployment happy path.** Deployment capability has been demonstrated, as confirmed by the owner on 12 September; the remaining gate is the complete UI/UX. Make repository intake, access requests, permissions, progress, the saved result and the usable local application link clear and pleasant. Chat and application views must agree, and refresh must preserve the explanation and result. Review typography, spacing, hierarchy, wording, transitions and the next action against the reference design. Finish with a fresh real deployment and owner acceptance before moving to the medium example.
- [ ] **Medium application.** Prove the same path with a database, private configuration, migrations and persistent data. Review before expanding again.
- [ ] **More complicated application.** Prove multiple services and a useful background task involving stored data.
- [ ] **After the deployment journey:** review each sidebar view and define useful capabilities; then broaden hardening and ongoing care.

Stop after each reviewable increment and use the user's feedback to shape the next. Each checkpoint includes a focused diff, a concrete way to try it, verification and limitations, and obsolete machinery removed. Exact example repositories and remaining details are settled in the relevant stage. See the [three complexity tiers](docs/operator-design.md#three-application-complexity-tiers) and [draft journey](docs/operator-design.md#draft-deployment-happy-path).

After the simple deployment UI/UX is accepted, expand application complexity in the order above and review further sidebar capabilities individually and decide what it can usefully show and do. Broaden hardening after the architecture is established. Always-on care remains a direction; log-error detection, Pi-authored monitors, detailed care cadences and per-vertical policies are deferred.

## Later milestone: conversation controls

- [ ] **Queue, steer and side chats — deferred.** Revisit native queue/steer, opening contextual side chats and concurrent read-only explanations after the core deployment experience works well. Existing read-only tool restrictions remain, but expanding side-chat behavior is outside the current sprint. Do not make these controls prerequisites for provisioning or first deployment.

## Later milestone: Pi heartbeat and state synchronization

- [ ] **Pi heartbeat — deferred until after the simple deployment UI/UX checkpoint.** Periodically review whether saved application observations still match reality, refresh the evidence each view needs, and wake Pi for interpretation or follow-up when appropriate. Define checks and refresh needs view by view; deterministic checks can save their results without a model call. Keep last-checked times and failed checks visible, and surface meaningful changes rather than repetitive status messages. Cadence and scheduling details remain open. See [operator design](docs/operator-design.md#always-on-care-and-visible-commitments).

## Integrated terminal and Pi activity

- [x] **Browser terminal — merged in [PR #58](https://github.com/lustoykov/server-guy/pull/58), with integration fixes in [PR #60](https://github.com/lustoykov/server-guy/pull/60), 12 September 2026.** The [browser terminal contract](docs/browser-terminal.md) describes the implemented separate stage. A Terminal action opens an optional bottom panel with a separate user shell on the connected application server through managed SSH. Keep Pi’s execution stream in chat; show when Pi is also working without taking over either session. Selected output can become an editable, unsent question to Pi. Minimize preserves the shell; disconnect or page departure ends it. Workspace targets, shared sessions and persistent recovery stay deferred.

- [x] **Pi activity transcript — merged in [PR #59](https://github.com/lustoykov/server-guy/pull/59) and [PR #60](https://github.com/lustoykov/server-guy/pull/60), 12 September 2026.** Tool calls, intermediate messages and linked approvals keep their order across streaming and reload. Quiet call groups expand for arguments/results; workspace commands stream through the Docker bridge. Declined and stopped outcomes remain distinct. [Integration evidence and limits](docs/testing/2026-09-12-transcript-terminal-integration.md).

Pi login and model preferences use a persistent machine account directory across default development previews; application data remains separate. Explicit controller directories stay isolated unless a shared Pi directory is selected. See [setup](README.md).

## Verification and deletion

Exercise actual Pi behavior and the user journey, inspect execution evidence and check the resulting application. Use focused tests for consequential changed behavior. A passing mock, completed command or dated proof is not a verified current deployment. Keep claims explicit about real models, simulated providers, local Docker and real hosts.

Delete unnecessary code, tests, validators, workflow branches and hardening cases that enforce retired requirements. The user explicitly authorizes discarding the existing development data. Start the new schema empty; remove obsolete migrations, readers and parallel workflows. Use Codex-style pending-call approvals and exactly three modes without provider exceptions. Do not build durable approval replay or dedicated recovery tools; Pi investigates and corrects failures with general tools. Do not build exhaustive compatibility matrices or speculative fault suites while architecture decisions are still being tested.

The owner does not use CI as a merge gate. Relevant local checks and concrete execution evidence still apply; broad coverage and additional model runs need a reason. [Test runners](tests/README.md) owns commands.

## Previous architecture evidence

The following describes the pre-redesign baseline, not completion of the sprint above. Its old workflows are being replaced; their historical proofs do not establish the new deployment journey.

Previous baseline: merged `2a1258a` (PR #49), reviewed for this redesign on 12 September 2026. The [BookStack follow-ups](docs/testing/2026-09-11-bookstack-followups.md) are merged; their proofs remain dated evidence. These are implementation/evidence statements, not a claim that a particular local dashboard or remote application is currently running this revision.

| Area | Evidence and remaining limit |
| --- | --- |
| Native deployment | PRs #43–#44 let Pi author native Compose and use the same managed execution/feedback loop for first deployments and updates. Schema 14 converted retained custom primary/companion plans once into native Compose under their recorded release IDs; no plan reader remains. See [current deployment architecture](docs/architecture.md). |
| Reuse proof | Real configured Pi installed and updated PostgreSQL/private-input notes and independently built web/worker services with shared files and SQLite. State survived; the first app demonstrated host-feedback correction. The [second proof](docs/testing/README.md#dated-evidence) needed no production changes. These were local Docker proofs with provider/SSH stand-ins. |
| Verification limit | Initial intake still requires HTTP behavior checks and the primary host port 80. PR #49 adds command checks that run inside services with private inputs, record every check on the attempt, hold the deployment while a command's outcome is unknown (under any operation, until the host's record resolves it, with verification resuming from recorded receipts), and run again inside a restored copy; background-only intake is still not implemented. |
| Lifecycle and rollback | Immutable releases, separate attempts, known versus unknown runtime observations, lost-result reconciliation and [compatible rollback](docs/architecture.md) are implemented. Rollback needs retained verified images and a data-compatibility assessment; it does not undo migrations. |
| Data protection | [Generalized capture](docs/architecture.md) uses data and writers for new schedules and has [Paperless/local restore evidence](docs/testing/README.md#dated-evidence). Legacy receipts remain readable. PR #49 removes the `app`/`postgres` naming assumptions: every database, the managed PostgreSQL included, is protected through its declared owner's dump procedure, capture pauses only the writers of captured data (mounters and the network writers Pi declares), a dump without a known writer set is taken online and proven by restoration, a failed procedure or stop is recorded with its reason, and the restore test boots the restored copy and checks it with commands; see its [evidence](docs/testing/2026-09-11-bookstack-followups.md). |
| Live-host evidence | The [8 September deployment](docs/testing/README.md#dated-evidence) and [9 September scheduled-backup report](docs/testing/README.md#dated-evidence) retain dated Hetzner/R2 evidence. They do not certify all subsequent native deployment changes on a real provider. |
| UI and persistence | Conversation-first receipts and stable views read shared operation records. Schema v14 retains serialized changes, queues, cancellation and native conversation history; releases have their own evidence. [UI integration](docs/testing/README.md#dated-evidence) is dated coverage, not a current browser acceptance claim. |
| Controller recovery | [Isolated Linux recovery and a recovered Pi request](docs/testing/README.md#dated-evidence) passed. Second-device recovery access, credential rotation and full multi-loop takeover remain unproved. |
| Broader gaps | BYOM adoption, additional public endpoints, authenticated controller bootstrap, migration orchestration, replacement-host cutover and broader ongoing care remain incomplete. A plugin runtime is not a prerequisite to finishing reusable core tools. |

## Deferred capability areas

These longer-term product areas are not another ordered implementation checklist: additional intake/compute options including BYOM, domains and HTTPS, backup/restore automation, recovery, ongoing care, and integrations for other agents. Revisit them through the relevant user journey or sidebar view once deployment is established. Existing implementations and historical gaps do not automatically become redesign gates.

Optional plugins, a marketplace, external notifications, automatic-on-push releases, previews, dedicated build servers and richer teams have no committed delivery order. Multi-host orchestration, replicas/clusters and automatic failover remain outside the product boundary. A manual replacement host is distinct from failover.

## Updating this plan

Review this checklist in every implementation PR. Include needed updates in that same PR: completed work, remaining gaps, changed priorities and new findings that affect delivery. If nothing changes, say so briefly in the PR. On merge, confirm the checklist reflects what actually landed and add its PR or commit reference. Apply the same rule to direct commits to `main`.

Keep local/in-review work unchecked until merged. Do not create a separate sprint checklist in another document; the PR template and review guide point here.

Update status only with evidence and its date/candidate. Replace superseded priorities rather than retaining competing plans. Do not store live spending authorization, credentials or temporary machine availability as product requirements. The operator design records the reasoning; this document owns the delivery sequence.
