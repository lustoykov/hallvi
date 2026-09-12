# Implementation plan

The active delivery sequence for the application operator redesign. [Product](PRODUCT.md) owns product direction and scope; [operator design](docs/operator-design.md) owns design decisions and open questions; [current architecture](docs/architecture.md) describes the existing implementation. Dated audits and old acceptance rubrics do not create additional work commitments.

## Current priority and sequencing boundary

The first general-execution checkpoint is implemented; see [current evidence](docs/testing/2026-09-12-operator-execution.md). Continue delivering the main deployment journey in small stages the user can try and review. Do not scope every sidebar view or build monitoring/error detection ahead of a working deployment path. View interiors may change wherever the main journey needs them; preserve the sidebar's guiding purpose.

| Checkpoint | Reviewable result |
| --- | --- |
| 1. Execution loop — ready for review | Main conversation, existing-host Bash, three permission modes, live approval and execution history. Side chats have read-only tools. |
| 2. Interact during work | Integrate native queue/steer and concurrent read-only side conversations with the operator lifecycle. |
| 3. Lightweight deployment | A repository becomes a working application through that operator, with meaningful verification and shared records surfaced in the UI. |
| 4a. Medium application | The same path handles a database, private configuration, migrations and persistent data. Review before expanding again. |
| 4b. More complicated application | The same path handles multiple services and a useful background task involving stored data. |

Stop at the first implementation checkpoint for user review, then use feedback to shape the next increment. Each checkpoint includes a focused diff, a concrete way to try it, verification and limitations, and obsolete machinery removed. Exact example repositories and remaining details are settled in the relevant stage. See the [three complexity tiers](docs/operator-design.md#three-application-complexity-tiers) and [draft journey](docs/operator-design.md#draft-deployment-happy-path).

After the deployment journey works, review every sidebar view individually and decide what it can usefully show and do. Broaden hardening after the architecture is established. Always-on care remains a direction; log-error detection, Pi-authored monitors, detailed care cadences and per-vertical policies are deferred.

## Verification and deletion

Exercise actual Pi behavior and the user journey, inspect execution evidence and check the resulting application. Use focused tests for consequential changed behavior. A passing mock, completed command or dated proof is not a verified current deployment. Keep claims explicit about real models, simulated providers, local Docker and real hosts.

Delete unnecessary code, tests, validators, workflow branches and hardening cases that enforce retired requirements. The user explicitly authorizes discarding the existing development data. Start the new schema empty; remove obsolete migrations, readers and parallel workflows. Use Codex-style pending-call approvals and exactly three modes without provider exceptions. Do not build durable approval replay or dedicated recovery tools; Pi investigates and corrects failures with general tools. Do not build exhaustive compatibility matrices or speculative fault suites while architecture decisions are still being tested.

The owner does not use CI as a merge gate. Relevant local checks and concrete execution evidence still apply; broad coverage and additional model runs need a reason. [Test runners](tests/README.md) owns commands.

## Current state

Implementation baseline: merged `2a1258a` (PR #49), reviewed for this redesign on 12 September 2026. The [BookStack follow-ups](docs/testing/2026-09-11-bookstack-followups.md) are merged; their proofs remain dated evidence. These are implementation/evidence statements, not a claim that a particular local dashboard or remote application is currently running this revision.

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

Update status only with evidence and its date/candidate. Replace superseded priorities rather than retaining competing plans. Do not store live spending authorization, credentials or temporary machine availability as product requirements. The operator design records the reasoning; this document owns the delivery sequence.
