# Application operator design

Design discussion started 12 September 2026. This is the living record of the agreed direction and remaining questions. The current priority is to get the design right, not to start implementation.

This document describes the intended architecture. [Architecture](architecture.md) describes the shipped implementation at schema 14; its fixed workflows and effect-specific approval rules are not requirements for this redesign. No runtime or schema changes have been made as part of this discussion.

## Documentation alignment

The repository documentation was reconciled with this design on 12 September 2026, before implementation. [Product](../PRODUCT.md) states the new direction, [Roadmap](../ROADMAP.md) owns staged delivery, [requirements](requirements.md) describes the deployment outcomes, and [UI guidance](design/screens.md), [test guidance](../tests/README.md) and [review guidance](../REVIEW.md) follow the same scope and deletion policy.

[Architecture](architecture.md) remains an explicit account of the existing implementation. Runner/setup instructions, fixture documentation and dated proof reports describe the systems they actually exercise; they do not impose old workflow gates, data preservation or a broader acceptance matrix on the redesign. This alignment does not mark any redesign feature as implemented.

## Product premise

Server Guy gives a capable model general tools to operate an application and relies on its intelligence to investigate, execute, verify and recommend next steps. Improved models should improve the operator without requiring an expanding catalog of application-specific workflows and rules.

The product's differentiation belongs in:

- A carefully designed user experience: clear explanations, coherent interactions, delightful animations and useful presentation of the agent's work.
- Always-on care: monitoring, follow-through, keeping applications reliable, updated and backed up.
- Operational practices and timely nudges that help users care for their applications.
- Eventually, access for other agents to request work and consume useful outcomes and evidence through the same operator.

The product guides users on **what deserves care**. Pi decides **how to provide that care**.

## Agreed direction

### Current focus: the main deployment journey

Get the main deployment journey right before expanding ongoing care across all sidebar views. Continue designing first; this priority does not authorize starting implementation yet. Walk through the happy path from the user's deployment request to a working application, deciding how Pi acts, what the user sees and which information is saved and resurfaced.

UI changes are welcome wherever this journey reveals a need. Preserve the sidebar's guiding purpose and use its existing structure as the starting point; do not freeze view interiors or interactions to match the old implementation.

Application-error detection is explicitly deferred. Interpreting arbitrary application errors and designing useful monitors is not understood well enough to include in the initial scope. After the main deployment experience works well, review the sidebar views individually and decide what care is genuinely useful and how to present it simply. Do not build a generic monitoring framework or detailed per-vertical policies ahead of that work.

### Sequencing boundary and working plan

1. **Design the main deployment happy path.** Work from a concrete deployment request through a verified, usable application. Settle the interactions and minimum architecture needed for that journey before implementation.
2. **Implement and prove that journey once its design is agreed.** Adapt the UI wherever the main path needs it. Verify real behavior throughout development and remove obsolete machinery as its replacement works.
4. **Then review every sidebar view individually.** Decide what each view can usefully show and do from the experience of a working deployment path. Define its capabilities and care practices at that point rather than committing to all verticals in advance.
5. **Broaden hardening after the architecture and journey are established.** Let actual use and community feedback inform additional cases and refinements.

This is a sequencing boundary, not a promise to implement every example elsewhere in this document. Broader monitoring, per-view actions, detailed care policies and speculative extensibility are not prerequisites for the deployment path. Add supporting capability only when the main journey demonstrates a concrete need.

### Verification during development

Architecture-first does not mean unverified. Exercise the actual user journey with Pi and a representative application, inspect tool results and the resulting deployment, and verify that the UI accurately reflects what happened. A successful command alone is not sufficient evidence that the application works.

Use focused automated checks for consequential behavior introduced or changed, and fix concrete failures that prevent the path from working. Keep checks proportional to the current design; do not build exhaustive application matrices, speculative fault-injection suites or extensive defensive infrastructure while the architecture may still change. Retain checks that protect behavior the new design still needs; delete or rewrite tests that enforce retired workflows, redundant gates or obsolete hardening requirements. Investigate failures against the intended design rather than treating every old test as a requirement to preserve.

Record what was actually verified and material limitations. Defer broad edge-case coverage and resilience work until the main journey is established. Basic correctness, the chosen permission behavior and truthful execution outcomes remain part of making that journey work, rather than a separate hardening project.

### Delete what the new design no longer needs

Explicitly prefer a minimal implementation. Remove unnecessary code, tests, validators, workflow branches and hardening cases when their purpose no longer belongs in the agreed architecture. Existing code and test coverage are not reasons to preserve an obsolete product constraint. Do not retain parallel old and new execution paths or compatibility machinery without a concrete need.

Deletion is part of the redesign. The user explicitly authorized discarding existing Server Guy development data as well as code and tests. Start the new schema empty; do not build migrations, legacy readers, archive/import features or compatibility adapters to carry the old application forward. Remove obsolete workflows and their recovery machinery outright as the new path replaces them. Git retains source history; keeping old runtime data is not an acceptance requirement.

This authorization concerns the current Server Guy development installation. It does not turn deletion into a default operational policy for applications Pi will manage through the new product.

### Three application complexity tiers

Validate the same deployment journey progressively against three representative application shapes. These are development examples, not user-facing application stages, new database classifications or separate execution workflows. Complexity means operational dependencies, not just CPU or memory usage.

| Tier | Representative shape | What the deployment should demonstrate |
| --- | --- | --- |
| Lightweight | One web service with a straightforward build/start process and no external database. | Pi can inspect, configure, deploy and verify a useful response, with clear progress and a usable result in the UI. |
| Medium | A web application with a database, migrations, private configuration and persistent data. | Pi can establish dependencies and configuration and verify a meaningful write/read interaction, including persistence across an ordinary application restart. |
| More complicated | A multi-service application with a web/API service, background worker, database, queue or cache where needed, and persistent uploads. | Pi can discover service relationships, start the stack and verify one useful end-to-end behavior involving background work and stored data. |

Start with one concrete application per tier. Prove the lightweight path first, then use the medium and more complicated examples to expose necessary generalization. The same operator, general tools and presentation primitives should serve all three. Do not build three deployment engines or expand this into an exhaustive feature matrix. Exact repositories remain to be selected; backup automation and ongoing error detection are not added to deployment scope by these tiers.

## Draft deployment happy path

### Proposed implementation checkpoints

The architectural direction is sufficiently clear to begin bounded implementation after agreeing the first stage. Resolve remaining details inside the smallest relevant stage rather than planning every vertical up front. Each stage should produce a coherent diff, something the user can try, a short account of verification and limitations, and a list of obsolete machinery removed. Offer review between stages rather than accumulating one large redesign.

1. **Main operator, execution and permissions — first slice implemented.** One conversation owns changes and has general host commands, the three permission modes and execution history. This proved execution; it did not complete the new database model or deployment onboarding.
2. **Four-table storage and presentation references.** Implement the agreed storage checkpoint below, remove replaced workflow code and reset disposable application data. Verify refresh, approvals, native conversation continuity and rich saved-information cards. Review separately.
3. **Hetzner provisioning.** Pi inspects a real repository and arranges a host within the deployment journey. Save its identity and connection using the new application model; review the interaction before deployment.
4. **Complete the lightweight deployment journey.** Deploy one selected lightweight application through the main operator's general tools, verify useful behavior, and surface the result using minimum shared-record and presentation capabilities. Adapt the UI to this journey and remove replaced planning/workflow code and tests.
5. **Prove generalization progressively.** Review the lightweight journey before moving to the medium example, then the more complicated example. Add capabilities those deployments actually need. These remain separate reviewable increments.

**Queue, steer and side-chat work is deferred to a later milestone.** Get the core deployment experience right first. Existing read-only tool restrictions remain in effect; native queue/steer, contextual side-chat opening and concurrent side explanations are not part of the provisioning milestone.

After those checkpoints establish the deployment journey, begin the view-by-view design work described above. Detailed care features and broad hardening remain deferred. Exact application repositories, final record fields and visual details can be settled at the relevant checkpoint; they do not require another comprehensive architecture exercise.

This walkthrough is a proposal to refine with the user, not a fixed workflow or new set of state-machine stages. Start with a repository-backed application on one server; use the existing provider as the initial concrete example. Do not design every source, provider and topology variant at once. Use Pi decides for the illustrative interaction; it does not settle the product's default permission mode.

| Moment | Pi's responsibility | User experience |
| --- | --- | --- |
| “Deploy this repository” | Inspect available source, existing connections and saved preferences. | Enter or select the repository and a request; enter the main conversation without an infrastructure questionnaire. |
| Understand what is needed | Determine how the application runs, its dependencies, configuration and persistent data. | A concise explanation of the intended setup; ask only for access, private inputs or consequential choices that are actually missing. |
| Establish the target | Recommend an appropriate server using available context, explain any new cost, and obtain authority when needed under the permission mode. | A concrete recommendation or decision in the conversation, not a mandatory release-proposal workflow. |
| Prepare and deploy | Use general tools to prepare the host and configuration and start the application; respond to native tool feedback. | Legible progress and expandable execution logs. Queue/steer/side-chat controls follow in a later milestone. |
| Verify useful behavior | Choose and execute checks appropriate to the actual application, including reachability and meaningful behavior. | Explain what was actually verified and any remaining limitation. |
| Hand over a working application | Preserve useful configuration and consequential knowledge and publish the relevant outcome. | An application link where applicable, an understandable deployment result and evidence available in the relevant existing views. |

Only save and surface information that earns its place in this journey. UI components, exact tool contracts and storage changes should follow the walkthrough. Recommendations for later care may appear where useful, but configuring every care feature is not a condition of completing the first deployment.

## Operator and presentation principles

### One main operator per application

One main conversation owns commands and changes for an application. Side conversations are read-only places to understand the application, inspect available evidence and explore alternatives. Two conversations must not independently deploy or modify the same application at once.

The current separate deployment planning session is an implementation choice, not a requirement to preserve. Deployment, investigation, backup and recovery should be things the operator accomplishes using general tools, rather than separate workflows controlling which commands it may execute.

Background work and, eventually, requests from other agents must coordinate with that same owner of operational work. The exact wakeup, scheduling and continuation mechanics remain to be designed. Always-on availability does not require a continuously generating model call or an unbounded active context.

### Interaction while Pi is busy

For the deferred conversation-controls milestone, use the familiar queue/steer/side-chat interaction described by the user, reusing Pi's native session capabilities rather than building another conversation scheduler:

| Interaction | Intended behavior |
| --- | --- |
| Queue | Retain a follow-up for Pi to process after its current work finishes. |
| Steer | Deliver direction into the active conversation at the runtime's next steering boundary. |
| Open in side chat | Discuss a message and relevant context in a separate read-only conversation without redirecting the main operator. |

Verified against the locally installed `@earendil-works/pi-coding-agent` version `0.84.4`: `AgentSession.followUp()` waits until there are no more tool calls or steering messages; `AgentSession.steer()` delivers after the current assistant turn's tool calls finish, before the next model call. `prompt()` also accepts either behavior while streaming. The runtime exposes queue state and queue-update events for UI integration. Steering does not itself cancel an already-running server command.

Pi's `SessionManager` also provides session branching/forking primitives. These are possible building blocks for side-chat context, not a built-in guarantee of read-only behavior or a finished side-chat UI. Server Guy supplies the read-only tool set and chooses what context to include.

Source for this check: installed `dist/core/agent-session.d.ts`, `dist/core/agent-session.js` and `dist/core/session-manager.d.ts`. This establishes available runtime primitives, not that Server Guy has wired them into its current per-request run lifecycle. Keep application integration small: route messages to the live session, expose pending/delivered state, using its existing queue state. Cross-process restoration of pending messages is not a prerequisite for the first slice; normal session history still provides conversational continuity.

### General tools and independent permissions

Pi should have general tools for working on the application server, including shell execution. A request such as “fix this application” authorizes ordinary operational work within that request; Pi should choose individual commands without mandatory command-by-command approval except when the selected mode requires it.

| Mode | Behavior |
| --- | --- |
| Always ask | Every code execution requires approval through the UI. |
| Pi decides | Pi judges when permission is needed and asks through a tool. |
| Bypass | Commands execute without approval prompts. |

Permissions govern execution independently of deployment, backup or other workflow categories. Workspace execution must be accounted for alongside server execution. An important published record is not automatically an approval request, and permission does not require manufacturing a release proposal.

The executor runs tools, handles credentials and records execution output and known outcomes. Errors and incomplete results return to Pi, which investigates and corrects through the same general tools. Do not add dedicated recovery tools, reconciliation workflows, cleanup journals or a framework of pending-effect holds. A lost connection is reported honestly; Pi can inspect the host to determine what happened.

Use a simple Codex-style approval interaction: a pending tool call asks the UI, waits asynchronously for a decision, and continues or declines within the active turn. Keep exactly three modes, with no special provider/spending exception to Bypass. Do not require an approval table, ending/restarting a turn, replay logic or restoration of pending approval after a worker restart. The chosen permission mode must still actually prevent an unapproved call from executing.

Read-only side conversations require an appropriate tool boundary; unrestricted server shell access cannot be made read-only merely by naming the conversation that way. The exact inspection capabilities remain open.

### Stable navigation, model-curated content

Keep the existing sidebar as the starting information architecture. Its sections teach users the recurring responsibilities of operating their application. The interiors of those views can change as the architecture changes.

**Pi decides what matters and what to surface. The product provides a stable, carefully designed way to communicate it.**

Pi can choose that a failed backup deserves prominence, connect it to an investigation and recommend a next step. The interface provides consistent components, placement options, interactions and animations.

**Views share evidence and records. Navigation reflects user concerns; storage does not need to mirror the sidebar.**

One investigation may contribute to the overview, logs and backup view. These views should reference the same records and execution evidence, not create separate copies of the operational result. Users should not have to interpret logs or reconstruct a chat transcript to understand their application.

Releases, upgrades and backups may be important information to preserve and resurface. They do not need mandatory proposal entities or dedicated workflow engines merely to be possible. Pi decides which consequential information deserves a record.

### Session history, execution logs and saved knowledge

Use three complementary sources of continuity:

| Source | Purpose |
| --- | --- |
| Native Pi session history | Resume conversations using the messages and tool interactions retained by the runtime. |
| Execution logs | Automatically retain what ran, its target, output, timing and known or uncertain outcome. |
| Saved application knowledge | Information Pi deliberately preserves for retrieval, with optional presentation to users. |

Restoring a session does not guarantee every historical detail remains in active model context. Conversations can be compacted, and side conversations have separate histories. Important knowledge needs to remain directly retrievable.

Start with **one kind of saved application record with optional presentation information**, rather than separate systems for Pi's memory and user-facing information.

- Without presentation information, a record is retained for retrieval by Pi.
- With presentation information, the same record also appears in selected user views.
- Records without presentation remain inspectable; “for Pi” does not mean secret from the owner.
- Adding or removing presentation does not duplicate or delete the underlying knowledge.

Example: Pi learns that uploads live outside PostgreSQL and must be included in backups. It saves that discovery once. The same record can later appear in the backup view with a short explanation and next step.

Provide simple capabilities to **search, save, update and retire** records. Pi decides what deserves preservation. Guidance can encourage saving discoveries costly to rediscover, user preferences, ongoing concerns and consequential outcomes without requiring a database entry for every thought.

A modest common record structure should support content, application identity, recorded/last-checked times and evidence links, plus optional presentation. This is a conceptual structure, not a finalized schema or a commitment to a new table for each concept. Credentials and executable schedules may need dedicated storage for their actual runtime responsibilities.

### Immediate views with recorded evidence

Views read saved information from the database immediately. Opening a section should not require a model call to reconstruct the application. The always-on operator updates saved information as it works.

Timestamps and evidence distinguish “last established” from “checked just now.” Automatic execution facts remain distinguishable from Pi's interpretations: a command's exit status is recorded automatically; whether it establishes a successful upgrade or warrants user attention is Pi's judgment.

### Always-on care and visible commitments

The following captures the longer-term direction. The application-error monitoring scenarios are exploratory and deferred, not requirements for the initial deployment journey. Specific care features will be revisited view by view after the main path is established.

Agreed wakeup sources are user messages, scheduled wakeups and incoming signals. They reach the same application operator. Ordinary installed processes such as backup jobs and lightweight monitors run independently of a model call. Pi can arrange ongoing checks and follow-ups within the selected permission mode.

Whenever Pi establishes or changes ongoing care, surface that commitment in the relevant views: what is watched or scheduled, its cadence, the last established result and the next expected check. Quiet care means avoiding repetitive attention demands, not hiding the automation. Important changes, failures, decisions and useful recommendations deserve prominence; routine results can update existing information.

Pi should know the sidebar verticals and their purposes. The product can provide opinionated guidance to assess backup coverage, install useful monitoring and check that monitoring still works. Pi chooses and may author the scripts and procedures appropriate to the actual application. Start with sensible defaults and improve them through use and community feedback; do not design a comprehensive policy engine for every vertical now.

Two complementary monitoring paths:

- Pi can write and install a lightweight script that examines relevant logs or health signals and sends an incoming signal when something appears wrong.
- A scheduled Pi check independently reviews recent evidence and checks that the monitoring script and its delivery path are functioning. A 15–30 minute interval is an initial example to evaluate, not a finalized universal cadence.

The periodic wakeup should originate from the always-on service independently of the monitored script. These paths provide complementary detection; they do not guarantee detection of every failure. A stopped script, broken signal delivery or unavailable host should be visible as a monitoring gap when established.

#### Scenario: database backups

1. Pi assesses the database and surfaces a backup recommendation in the database view, with other placements as useful.
2. When asked to establish backups, Pi configures a suitable recurring backup procedure using general tools and the chosen permission mode, then checks the result.
3. Pi arranges a daily check-in to establish whether an expected recent backup actually completed. The backup job and the Pi check-in are distinct schedules: one creates the copy; the other checks protection.
4. The view surfaces the installed backup cadence, daily check-in, last successful backup evidence and next expected check. Restore testing remains a separately stated observation or recommendation; a backup success does not imply a tested restoration.
5. A failure signal can wake Pi sooner. Pi investigates and updates the same records with what failed, what it did and anything the user needs to decide. Ordinary successful checks update existing information without generating a new prominent card every time.

#### Deferred scenario: application errors and monitoring failure

1. Pi installs an application-appropriate log/health monitor and arranges periodic independent reviews. It surfaces both as ongoing care in the relevant views.
2. The monitor detects a concerning signal and wakes the operator with evidence. Pi determines its meaning, investigates and acts within the permission mode.
3. A later periodic review checks recent application evidence and whether the monitor and delivery path are functioning, rather than treating silence as proof of health.
4. If the monitor stopped, Pi surfaces the coverage gap, repairs it where authorized and checks that it works again. The record distinguishes the last observed application condition from monitoring availability.

These are experience scenarios, not mandatory executable backup or monitoring workflows. Specific cadences, signal transport and detailed per-vertical defaults remain to be designed.

## Current proposal: assigning records to views

The latest proposal is for Pi to receive a catalog of existing sidebar sections and their purposes. When saving or updating a record, Pi chooses one or more placements. Views query those assignments and render them using designed components. No model call is needed when a view opens.

An illustrative presentation object:

```json
{
  "placements": [
    { "view": "backups", "role": "attention" },
    { "view": "overview", "role": "attention" }
  ],
  "summary": "Backups have failed since Tuesday.",
  "suggestedAction": "Investigate the backup failure"
}
```

The view identifiers and fields above are illustrative, not finalized API names. Candidate presentation roles are current information, attention, recommendation and update. The roles, ordering and component library should be tested against actual view designs before being settled.

The view owns its layout; Pi chooses content, placement and meaning. As circumstances change, Pi can update or retire records and adjust their presentation. A suggested action can route a request into the main conversation; its exact interaction and execution semantics remain open.

Views should remain useful before Pi has populated them. For example, “Backup protection hasn't been assessed” can offer an assessment action. Missing records must not imply that no backups exist or that everything is healthy.

## Open design questions

### Decisions after Fable's review

The user chose simplicity: use the Codex-style pending-call approval interaction, retain exactly three permission modes without exceptions, discard existing development data and obsolete code, and let Pi handle operational problems through general tools. These decisions replace earlier proposals for durable approval suspension, mandatory host receipts/reconciliation and preservation of old runtime records.

[Codex's documented approval interaction](https://learn.chatgpt.com/docs/app-server#approvals) is a pending command/file-change item, an approval request, a client decision and continuation or decline. We are following that interaction, not claiming that Codex guarantees restoration of pending approvals across process restarts.

The installed Pi 0.84.4 has native queue/steer and a tool-call blocking hook. Its `terminate` flag is only a batch-level hint, not a requirement to build turn suspension. The first execution checkpoint retains a native session per conversation, opened/disposed around each request. Tool wrappers await UI approval inside the live turn; there is no default conversation timeout while a person decides. Native queue/steer and concurrent side conversations still need lifecycle integration.

Use explicit host execution and controller-held credentials, with named private inputs and known-value redaction. Keep the minimum repository access needed before a host exists. Details of the saved-record index, revision history and output storage can follow the working slice rather than become prerequisites. Side chats can follow useful execution records. No dedicated recovery subsystem is planned.

- How scheduled checks and external requests use the operator's native queue/steer capabilities when ongoing care enters scope. User-facing queue, steer and read-only side-chat interactions are agreed above.
- What read-only side conversations can inspect, and how findings move into the main conversation when action is desired.
- Permission scope is per application, defaults to Pi decides and is saved in its operator settings. The first interaction is inline Approve/Decline on the pending tool call.
- The minimum saved-record structure, update/history behavior and evidence references; how stale or conflicting knowledge gets corrected.
- The exact view catalog, presentation roles, ordering, record lifecycle and suggested-action interactions.
- Which current records remain necessary for executable state, and which can become shared knowledge or execution history. Avoid adding a new Task entity alongside existing Runs and Operations without a demonstrated need.
- The eventual interface for other agents; it should share the operator and evidence rather than create competing execution paths.

The immediate next design exercise is the main deployment happy path. Monitoring mechanisms, error-detection scripts and detailed per-view care defaults are deferred until that journey is established.

## Design test

When adding an operational capability, can Pi accomplish it through general tools and explain it through existing presentation primitives? Requiring another workflow, approval type and database entity for each capability is a sign that the design is drifting from this direction.

The four-table checkpoint below is approved for implementation. Keep this document updated as decisions are made, and distinguish agreed principles from illustrative proposals.


## First implementation checkpoint — 12 September 2026

The first conversation is the main operator and cannot be archived. Other conversations receive only repository read/search and stored application/execution evidence tools. Only the main operator gets workspace mutations, server Bash and approval requests. The current worker still processes turns serially; concurrent side explanations and native queue/steer are deferred until the core deployment experience is established.

An existing server connection contains address, SSH user/port and controller-side paths to a key and verified known-hosts file. Pi sees the target and command, not those credential paths. Provider provisioning and named private-input injection are not implemented in this checkpoint.

In that first checkpoint, permission settings and per-call execution JSON files lived under the application’s operator directory. Schema 15 moves settings into the application row; executions remain files. Each execution retains target, input, mode, status, bounded output, exit code and any approval reference. A pending approval waits in the live tool call for the UI's decision. There is no approval replay after a worker restart. Cancelled/failed turns may have already produced effects; Pi reads the evidence and investigates through general tools.

The old deployment/operation workers, mutation endpoints and approval cards have been deleted. Remaining workflow modules and tables are transitional implementation to remove as the new deployment path replaces them; they are not constraints on that path. No compatibility migration is required.

Verification and limits are recorded in the [checkpoint evidence](testing/2026-09-12-operator-execution.md). This is an execution checkpoint, not a completed deployment journey.


### Server setup belongs in the deployment journey

The execution checkpoint proves that Pi can run commands on a selected host. It does not establish server onboarding. Its test ran against a temporary SSH server on the development Mac, not a Hetzner host. The standalone SSH attachment button and file-path form were premature and have been removed from the product UI.

The deployment journey should first let Pi inspect the application and determine its needs. When a host is needed, integrate Hetzner provisioning or bring-your-own-machine setup into that journey, using the chosen permission mode and designed input controls. Pi then executes on the selected host and verifies the application. Detailed provider and machine-connection interactions belong to that upcoming checkpoint.

Conversation identity appears in the page header and corresponding navigation entry. The permission control should not repeat the conversation title, and the chat body needs no second title header.


### Controller storage versus the deployed application's database

The controller currently uses SQLite and still has legacy `deployments` and `application_operations` tables. The execution checkpoint did not replace that schema. A separate storage checkpoint before provisioning replaces this storage and initializes fresh development application data; there is no requirement to provision a separate hosted database for Server Guy merely to use Hetzner.

A database needed by the deployed application is a separate concern. Pi determines that requirement from the repository and prepares the appropriate database on the target as part of deployment. A lightweight application may not need one at all.

## Agreed storage checkpoint — four tables

Implement and review storage before Hetzner provisioning, then review provisioning before the first lightweight deployment. Queue/steer and further side-chat interactions stay deferred. Old development application data is disposable; account credentials and `.env.local` are separate and must remain.

- **Applications:** repository identity and latest access check, permission mode (Pi decides by default), optional host connection with controller credential references and optional provider/server identity, timestamps.
- **Conversations:** application/title, one main conversation and read-only sides, native session reference, current status and response pointer, timestamps. The worker enforces one active turn; the main label alone is not a lock.
- **Messages:** user-facing text and structured references to saved information or executions, source, completion state and timestamps. Response delivery metadata belongs here; there is no separate runs table. An in-memory response projection may serve the worker/API without duplicating database records.
- **Saved information:** application, title/body, evidence references, establishment time, optional presentation (views, role, outcome, checks, next step and URL), creation/update/retirement times. Pi searches, saves, updates and retires it. Presentation is optional: private working knowledge and surfaced information use the same record. Saved preferences cannot override permission settings.

Native Pi JSONL holds full model/tool context. Executor-owned files automatically hold execution IDs, commands, targets, approvals, bounded output and outcomes. Approval waits on the original live call and uses a separate decision file; no reissued-command hash matching or replay framework. Refresh loads SQLite and file evidence and reconnects to streaming updates; worker restart marks unfinished replies interrupted and never replays commands.

Messages support a small product-owned block vocabulary, not arbitrary generated UI. A saved-information reference renders the same card in chat and its selected sidebar views. Pi chooses the content; components provide consistent badges, checks, links and expansion. A deployment outcome has a structured URL and evidence. Empty views never infer that a recorded host means a verified deployment.

Ordinary knowledge can update in place. Historical outcomes remain separate records for separate events; no universal superseding/version-history mechanism. Controller-managed secrets are named and application-scoped; database records hold references. Secret-generation and injection tools arrive with the deployment need.

Delete decisions, observations, activity events, deployment/operation records and chat-summary storage as their callers are replaced. Detailed vertical design and hardening follow the working deployment journey.
