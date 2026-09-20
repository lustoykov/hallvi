# Development resource lifecycle

Development resources must have an owner, a retention decision and a completion
condition. This policy covers local worktrees, branches, processes, Docker, test
data and real Hetzner fixtures. It does not make product users' deployments
disposable. The [cleanup decision flow](architecture/development-cleanup-decision.html)
summarizes the gates; the resource-specific rules below also apply.

## Scope: development resources, not user systems

This policy applies to agents developing Hallvi and its development cleanup
task. It grants no housekeeping authority to Pi operating a user's application,
whether Hallvi was launched with a development or production command.
User deployments and local product data are not development fixtures.

Local cleanup starts from exact Hallvi-owned paths in the inventory and
registered worktrees. Do not scan the user's home directory, Desktop, Documents,
Downloads, other repositories or shared temporary/cache roots for things to
remove. An individually registered disposable fixture may live outside the
repository; that authorizes only that exact fixture, not its parent or siblings.
Resolve symlinks and inspect mounts before deletion; ownership of a directory
entry does not establish ownership of its target or mounted contents.

Even inside Hallvi folders, preserve user files, product databases, backup
copies, credentials, conversation history and retained evidence. Creating or
managing a resource does not make its data disposable. Shared Docker and cloud
accounts are not project cleanup scopes: use exact, verified resource IDs and
keep the ownership, dependency and retention checks below. Uncertain targets
remain untouched.

Pi's operational boundary is defined in [Product](../PRODUCT.md#operating-boundary)
and its runtime prompt. Automatic disposal of Pi's repository workspaces and agreed
backup retention are separate, narrowly scoped product behavior; they do not
inherit this development policy.

## Discarding development data, except where keeping it is the point

Disposable development data stays disposable. In a test fixture, a scratch
checkout or a worktree's own `.hallvi`, start a new schema empty: do not build
migrations, legacy readers, archive or import features, or compatibility
adapters to carry an old prototype forward, and remove obsolete workflows and
their recovery machinery outright as the new path replaces them. Git retains
source history, and keeping old runtime data there is not an acceptance
requirement.

**One registered environment is the exception, and being the exception is what
it is for.** The [persistent development environment](development-environment.md)
keeps its applications, conversations, records and the deployed applications'
own data across restarts, code upgrades and supported schema changes. Starting
it empty would destroy the only thing it can prove. So a change to how Hallvi
stores anything arrives with the migration for the supported schemas, and with
evidence that its applications still open, still show their history and still
hold their data.

That is a supported upgrade path, not compatibility with every version that
ever existed. A schema nobody registered still needs no reader.

The authorization covers this development installation and nothing else. It is
not a default operational policy for the applications Pi manages through the
product, and it does not reach the user files, product databases, credentials,
conversation history or retained evidence the rest of this document protects.
[Cleanup scope](architecture/cleanup-scope.md) draws the same line as a
picture.

## Development host and cleanup owner

Development runs locally on the owner's MacBook. The Mac mini is a retired
development host: do not create new development tasks, previews or verifier
services there. Retiring that host does not make its files or servers disposable.
Audit its remaining work once, preserve unique work and configuration, stop only
verified obsolete development processes, and record unresolved resources locally.

The local **Dev Cleanup** scheduled task owns recurring Hallvi cleanup,
including GitHub branches and authorized Hetzner development resources. Do not
rely on a cloud audit on another machine or create a second cloud cleanup owner.
The separate **Disk Audit** remains read-only and covers the wider Mac. Local
**RAM Care** may manage preview memory under its own narrow authorization; all
cleanup must recheck active use immediately before acting.

Use local provider stand-ins when a real provider adds nothing — a stand-in is
faster and free, and everything above the provider API behaves identically. Use
a real host when the step is about deployment itself, where a stand-in cannot
establish the result.

On 14 September 2026 the owner standing-authorized creating billed development
resources in the authorized project whenever the work needs them, replacing the
earlier per-task authorization. It is an authorization to create and use, not to
delete: resources you did not create stay, and the labelling, registration and
retirement rules below apply unchanged to everything you do create.

Use only existing authorized provider projects (currently Default); do not create
projects or infrastructure just to audit it. Verify account/project identity and
access before any provider mutation. Inaccessible resources are a coverage gap.

## Ownership and durable records

Keep one inventory and dated audit records outside all worktrees at
`~/Library/Application Support/Server Guy/development-cleanup/` on the local Mac
(named before the rename to Hallvi; the Dev Cleanup task reads it there).
Use owner-only permissions (directory 0700, files 0600), with no secret values.
Record resource identity, machine/project, task UUID/link, exact branch and tip,
worktree, purpose, lifetime, retention decision and verification evidence.

### Planned Hallvi inventory-path migration

The target canonical path is
`~/Library/Application Support/Hallvi/development-cleanup/`, but the Server Guy
path above remains authoritative until one coordinated implementation change has
completed. Do not rename or move the live directory ahead of the scheduled-task
prompt, and do not merge documentation that calls the Hallvi path canonical while
the task still reads the old path.

That implementation must use one pull request and one bounded maintenance window:

1. Confirm that Dev Cleanup is not running, record its current schedule, status
   and target task, and inventory the old directory without exposing record
   contents or credentials.
2. Copy the directory to a new owner-only staging directory, preserving file
   metadata. Compare the complete relative-path list, file sizes and hashes, and
   verify directory mode 0700 and file mode 0600 before promoting the staged copy
   to the Hallvi path. A partial copy is a failure; keep the old directory
   authoritative.
3. Update the existing Dev Cleanup automation in place to read and write only the
   Hallvi path. Preserve its schedule, status and target task. Record the prompt
   change and verification in the same pull request; do not create a replacement
   automation or competing owner.
4. Change this section's canonical path in that pull request only after the copied
   records and updated prompt agree. Run one read-only audit from the existing
   target task and verify that new audit output lands under the Hallvi path.
5. Keep the old Server Guy directory as a read-only rollback source until the new
   path has completed a successful scheduled run and all current records and
   unresolved decisions are present. Retiring the old copy is a separate exact
   cleanup action requiring fresh ownership, dependency and retention evidence;
   never delete it merely because the new copy exists.

If validation fails, restore the automation prompt to the old path and leave both
directories untouched for review. The path change does not authorize renaming any
product runtime data or compatibility identifiers.

Reconcile any legacy `~/.codex/server-guy-development-resources/` records from
accessible machines into this inventory by exact resource ID, retaining their
provenance. Do not erase originals until the transfer is verified. Conflicting
records mean retain and report, not that the newest timestamp wins.

Classify resources explicitly: **persistent** resources remain; **shared-development**
hosts remain while isolated completed fixtures can be cleaned; **disposable**
fixtures are eligible only after the checks below. Unclassified resources remain.
An expired lease makes a resource a candidate, never sufficient deletion proof.

## Creation and continued use

Apply these labels to each temporary server and each separately created volume,
snapshot, primary/floating IP, load balancer, network, firewall or SSH key where
the provider supports labels. Preserve unrelated labels when updating them.

| Label | Value |
| --- | --- |
| `sg-project` | `hallvi` |
| `sg-environment` | `development` |
| `sg-lifecycle` | `temporary` |
| `sg-owner` | Unique task UUID, retained for the task's lifetime |
| `sg-branch` | Label-safe branch slug (maximum 63 characters); exact branch in the registry |
| `sg-expires-at` | UTC Unix timestamp in seconds; default now + 72 hours |
| `sg-cleanup` | `allowed` only for disposable fixtures; otherwise `retain` |

Record project/account identity, resource type and provider ID, owner UUID, exact
branch, worktree path, machine, task link, purpose, creation/expiry timestamps and
disposition in `<owner UUID>.json` in the canonical inventory above. Keep credentials out of records.
Record resources immediately, including after uncertain creates by reconciling
provider state before retrying. The registry survives worktree removal; provider
labels allow audit discovery even when another machine's registry is unavailable.

Before resuming a task, renew its resource expiries to now + 72 hours. Extend them
before long tests. Do not relabel persistent or shared resources as temporary. For a demo, shared service or valuable data, set
`sg-cleanup=retain`, record why and name the new owner if transferring ownership.
Never use these disposable labels on existing resources based only on their name
or age. Existing resources need evidence of ownership and disposable purpose.

## Completion and branch/worktree removal

Before finishing a task or removing its branch/worktree, inventory the owner's
resources. For disposable fixtures with the full label contract, verify ownership,
check that no other task/deployment depends on them, then delete them by exact ID.
Immediate task-owned cleanup need not wait for expiry. Retain useful test evidence
without keeping the host running solely as evidence. Follow up server deletion by
checking for separately billed storage, snapshots and IPs; never assume cascading
cleanup or that attached resources are disposable.

Check provider completion and re-list resources to verify absence. Record UTC time,
deleted IDs, retained IDs/reasons and failures in the registry and task handoff.
Do not mark an uncertain deletion complete. If blocked, leave labels/records intact
for the daily audit and report the remaining resource. Removing a worktree is not
itself proof that a cloud resource is unused.

## Daily audit and expired cleanup

Inventory all pages of servers, volumes, snapshots/backups, primary and floating
IPs, load balancers, networks, firewalls and SSH keys in each configured authorized
Hetzner project. Use existing credentials without printing them. Report inaccessible
projects or resource types as coverage gaps, never as an empty account.

Correlate IDs and labels with the durable registry, saved application hosts and
active task/worktree records, including the retirement inventory from the Mac mini when relevant.
Report unlabelled/legacy resources for classification; do not automatically adopt
them into cleanup. Estimate recurring cost from current provider prices where
available, clearly identifying estimates and unknowns.

Automatic deletion requires **all** of the following:

- Exact project/environment/lifecycle labels above, nonempty owner and branch,
  `sg-cleanup=allowed`, and a valid expired Unix timestamp.
- Evidence that the resource is a disposable development fixture; no conflicting
  registry, active task, saved deployment, retention request or provider protection.
- No dependencies outside the same eligible cleanup set. Inspect each resource's
  relationships; a server's labels do not authorize deleting its attached storage.
- Fresh re-read of labels, expiry, protection and dependencies immediately before
  deleting the exact provider ID. If ownership, activity or dependencies cannot be
  established, report it instead. Never disable deletion protection automatically.

Use the completion verification above. Expiry makes a resource a cleanup candidate;
low usage, old age, a merged branch or an absent local worktree alone does not.
Resources without provider label support are report-only during scheduled audits.
Keep a dated audit record in the canonical local inventory.
Notify on newly actionable findings, verified deletions, failures or needed input;
stay quiet when findings are unchanged and non-actionable.

## Local development resources

The daily audit also covers Hallvi worktrees, local and GitHub branches, Docker
containers/images/networks/volumes/build cache, development databases, build
outputs, logs and temporary artifacts. Scope is this project's resources on
the local development Mac and explicitly scoped retirement audits, not arbitrary
personal files or other projects.
Record exact paths/IDs, machine, task, branch, purpose, expiry and cleanup permission
in the same durable registry. For Docker, apply the same labels where supported;
for Git and files, use registry entries. Renew the default 72-hour lease during
active work. Completion cleanup precedes worktree and branch removal.

- Worktrees: require confirmed task completion, no active agent/process using the
  path, and no modified, staged, untracked or valuable ignored files. Inspect
  ignored databases/configuration before removal. Preserve the main checkout and
  locked worktrees. Use normal `git worktree remove`, never force removal.
  Include Claude-created worktrees, including `.claude/worktrees/` and custom
  locations registered with this repository's `git worktree list`. Check Claude
  session/task evidence and running processes as well as Codex activity; an idle
  or absent process alone does not establish task completion. Apply the same
  dirty/untracked/ignored-file, data-retention and branch-preservation checks.
  Legacy Claude worktrees without ownership records need evidence-based adoption
  before removal. Do not delete Claude settings, credentials, session history or
  other repositories' worktrees. Unregistered directories are report-only unless
  their ownership and disposable contents can be independently established.
- Local branches: require confirmed task completion, no checked-out worktree and
  proof all commits are preserved in the intended integration branch. Keep default,
  protected and unmerged branches. Use `git branch -d`; do not force-delete.
  A squash merge needs explicit preservation verification;
  if normal deletion refuses, report it.
- GitHub branches: scope deletion to the verified Hallvi repository remote and
  task-owned development branches. Require confirmed task completion, no active
  task/worktree or open pull request using the branch (as head or base), and proof
  the current tip is preserved in the intended integration branch. For squash or
  rebase merges, verify the merged PR covers the current head and that no commits
  were added afterwards; if preservation remains uncertain, report it. Preserve
  default, protected, release/shared and unmerged branches; never bypass rulesets
  or protection. Re-read the remote tip and PR/protection state before deletion,
  and use an exact expected-tip lease when deleting the ref so concurrent pushes
  prevent deletion. Verify remote absence and record repository, branch, last SHA
  and merge evidence. Missing legacy registry entries require the same evidence
  and documented adoption as other legacy resources; a branch name or age alone
  does not authorize deletion.
- Docker: inspect exact IDs, ownership, mounts and dependencies. Remove only
  task-owned disposable containers after task completion and inactivity. Remove
  networks/images only when no retained container or active build depends on them.
  Volumes require positive evidence of disposable test data, even when dangling.
  Never run broad system/volume prune. Shared build caches are report-only unless
  the disposable portion can be isolated without affecting other projects.
- Databases: delete only explicitly disposable test fixtures with no live process,
  container, controller or retained application referencing them. Treat SQLite
  databases and WAL/SHM companions as one unit after clean shutdown. Preserve
  controller state, credentials, backups, restore evidence still needed and any
  data of uncertain value. Staleness and a backup's existence are not authorization.
- Build outputs, logs and temporary files: require project ownership, known
  regenerability, expired lease/completed task and no active reader/writer. Preserve
  source, user files, secrets and evidence needed for an unresolved issue.

Recheck eligibility immediately before each mutation, verify the result, and record
exact removals, reclaimed space where measurable, retained items and failures.
If permissions prevent cleanup, record the gap; never describe it as completed.

## Resources created before this policy

Missing labels do not permanently exempt legacy resources from cleanup. First
classify them using creation/deployment evidence, the owning task and current use.
Keep live resource IDs in the private inventory, not in this policy. Names, lack
of local application matches and age are insufficient to establish disposability.

When evidence establishes a completed disposable development fixture with no
valuable data, active owner or external dependency, record that evidence and exact
resource identity in the durable registry, apply the development labels preserving
existing labels, and mark the lease expired for cleanup. Do not invent an original
branch/task: record a clearly identified audit adoption owner/branch and retain the
original identity as unknown when unavailable. Follow the same fresh-state and
dependency checks as other cleanup. Classify attached resources independently.
For local legacy resources, create the equivalent registry record before cleanup.
If evidence is insufficient, present the exact resource and unresolved retention
question to the user; do not silently classify it as disposable.


## Audit completion and remaining work

Before mutations, record the exact proposed removal set and supporting evidence.
Use a single active cleanup run; if another run or task may own a candidate,
retain it until ownership is resolved. A review of PRs does not authorize blindly
merging code: review the current diff and required checks before integration.

Record exact removed paths, resource IDs and branch tips; verification time;
retained resources with reasons, owner or the specific decision needed; failures;
and coverage gaps. Keep a current unresolved inventory so each audit can revisit
it without rediscovering everything. A report-only candidate must not silently
become disposable in a later run.

Measure disk usage before and after where useful. Moving files to Trash is
recoverable relocation, not reclaimed disk space. Do not empty unrelated Trash.
Verify cloud deletions with a fresh inventory including separately billed
resources. Report only meaningful changes, actionable findings, failures or
needed decisions; remain quiet when nothing actionable has changed.

Before deleting anything in a shared provider project, snapshot **every**
collection it holds, not the kinds you are about to delete: servers, primary
and floating IPs, volumes, snapshots, load balancers, networks, firewalls and
SSH keys. A snapshot that omits a collection cannot establish what was in it
afterwards, and providers do not all keep an audit log to fall back on —
Hetzner keeps none for SSH keys. On 14 September 2026 this task deleted 17 SSH
keys it had not captured and could not subsequently attribute; see the
[resource scope audit](testing/2026-09-14-resource-scope-audit.md).

Credential-shaped resources — SSH keys, tokens, registry logins — are retained
by default even inside a broad instruction to clean up. That a key authorises
no current resource says nothing about whose it is: unused is not unowned, and
an unattributable credential is exactly the case the retain rule exists for.
Match each one to an owner by label, by a local record, or by asking, and
delete only the ones you can name.

A model-selected paid add-on on a resource you were authorized to create —
provider backups, extra storage, a larger plan — is a separate billing
decision from the resource. Decline it, or raise it with the owner while it can
still be declined, rather than reporting the cost after it has accrued.
