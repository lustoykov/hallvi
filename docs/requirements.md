# Required outcomes

[Product](../PRODUCT.md) owns scope, [operator design](operator-design.md) owns the redesign, and [Roadmap](../ROADMAP.md) owns delivery order. These outcomes guide Pi and the experience; they do not prescribe fixed execution workflows or a table for every concept. [Current architecture](architecture.md) describes the implementation being replaced.

## Deployment journey first

| User need | Required outcome |
| --- | --- |
| Deploy this repository | Pi inspects the actual source, available connections and saved preferences; determines the required services and setup; asks only for genuinely missing inputs or decisions. |
| Understand what will happen | A concrete, concise explanation of the recommended setup and any new cost. Authority follows the selected permission mode, not a mandatory release-proposal stage. |
| Let Pi do the work | The main operator prepares the target, configures and deploys through general tools, and uses native errors to correct its work. Actual execution and outcomes are recorded automatically. |
| Talk while Pi works | Queue a follow-up, steer at Pi's native delivery boundary, or open a read-only side conversation. Side conversations do not become competing writers. |
| Know whether it works | Pi checks the intended application and useful behavior, explains the evidence and limitations, and supplies a usable entry point where applicable. A process starting is not sufficient proof. |
| Return later and understand it | Views immediately show saved knowledge and relevant outcomes, with timestamps and evidence. The user need not reconstruct a transcript or invoke the model just to open a view. |

## Shared behavior

One main operator owns changes per application. Native session history provides conversational continuity; automatic execution logs record what ran; shared application knowledge preserves what Pi considers important. Pi can search, save, update and retire knowledge, with optional presentation in one or more views. The same record may serve Pi's future work and several UI sections without duplication.

Keep the existing sidebar as the starting structure. It guides users on what deserves care while Pi decides how. Pi selects what to surface; designed components control layout, interaction and animation. Exact presentation fields and roles remain proposals. Missing evidence means [unassessed, not healthy or absent](../PRODUCT.md#empty-means-unassessed-never-healthy).

Permissions are independent of workflow categories; the three modes are defined in [Product](../PRODUCT.md#permission-modes). Credentials and automatically recorded outcomes belong at the tool boundary. A lost connection does not prove an action stopped. Approval uses a pending call that waits for the UI decision and continues or declines. Cross-process restoration of pending approvals is not required, and Bypass has no special provider/spending exception.

The existing Server Guy development data may be discarded; use a fresh schema without legacy migration or history readers. Do not add dedicated recovery tools: return errors and execution evidence to Pi so it can inspect and correct through general tools. Distinguish recorded observations from Pi's interpretations and from claims about current health. User-supplied private values need an appropriate input experience rather than inclusion in public records.

## Proving reuse

Use one representative application per [complexity tier](operator-design.md#three-application-complexity-tiers), progressively:

| Tier | Evidence sought |
| --- | --- |
| Lightweight | One web service: inspect, prepare, deploy and verify useful behavior. |
| Medium | Database, migrations and private configuration: meaningful write/read behavior and persistence through an ordinary application restart. |
| More complicated | Multiple services, worker and stored data: a complete useful background task. |

Exact repositories remain to be selected. The tiers are development examples, not user-facing classifications, separate deployment engines or an exhaustive compatibility matrix. Existing notes/shared-build fixtures and dated upstream trials are reusable evidence, not a required list of apps to certify.

Verify the actual path as it is developed. Use focused tests and representative runs, remove obsolete cases, and report concrete limitations. Broad lifecycle/failure matrices, backup/restore coverage for every application and speculative hardening are deferred. Claim only the behavior actually demonstrated for the candidate under review; deferred tests do not establish broader support.

## Later, decided view by view

Once deployment works well, review every sidebar view individually and define its useful capabilities and presentation. The following are concerns to revisit, not an acceptance checklist for the initial redesign:

- Protection: discover what data needs a backup and establish capture, transfer and restoration evidence. A schedule or uploaded file alone does not prove recoverability.
- Updates and recovery: understand current state, configuration and data compatibility. Returning to old code does not undo migrations.
- Background work: reuse the application's commands, scheduler and queue library. Record observed results rather than infer useful work from a running process.
- Ongoing care: visible schedules and follow-ups, with meaningful findings and next steps. Application-error detection and monitoring scripts are explicitly deferred.
- Coding-agent collaboration: share a useful explanation and evidence when application code needs changing, within the existing product boundary; eventual agent access goes through the same operator.

When ongoing care is introduced, Pi's commitments must be visible in the relevant views. Routine success may update those views quietly; meaningful changes and decisions warrant attention. Show observation times and coverage gaps rather than equating silence with health. Detailed mechanisms and per-view policies are chosen when that work is in scope.
