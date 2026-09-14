# Development resource lifecycle

Real Hetzner resources created for Server Guy development must have an owner and
a bounded lifetime. Prefer local provider stand-ins when a real provider is not
needed. This policy governs developer/agent work; it does not mark product users'
deployments disposable.

## Creation and continued use

Apply these labels to each temporary server and each separately created volume,
snapshot, primary/floating IP, load balancer, network, firewall or SSH key where
the provider supports labels. Preserve unrelated labels when updating them.

| Label | Value |
| --- | --- |
| `sg-project` | `server-guy` |
| `sg-environment` | `development` |
| `sg-lifecycle` | `temporary` |
| `sg-owner` | Unique task UUID, retained for the task's lifetime |
| `sg-branch` | Label-safe branch slug (maximum 63 characters); exact branch in the registry |
| `sg-expires-at` | UTC Unix timestamp in seconds; default now + 72 hours |
| `sg-cleanup` | `allowed` only for disposable fixtures; otherwise `retain` |

Record project/account identity, resource type and provider ID, owner UUID, exact
branch, worktree path, machine, task link, purpose, creation/expiry timestamps and
disposition in `~/.codex/server-guy-development-resources/<owner UUID>.json` on the
creating machine. Create this directory if needed. Keep credentials out of records.
Record resources immediately, including after uncertain creates by reconciling
provider state before retrying. The registry survives worktree removal; provider
labels allow audit discovery even when another machine's registry is unavailable.

Before resuming a task, renew its resource expiries to now + 72 hours. Extend them
before long tests. For a demo, shared service or valuable data, set
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
active task/worktree records, including other connected machines where available.
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
Keep a dated local audit record under `~/.codex/server-guy-development-resources/`.
Notify on newly actionable findings, verified deletions, failures or needed input;
stay quiet when findings are unchanged and non-actionable.

## Local development resources

The daily audit also covers Server Guy worktrees, local and GitHub branches, Docker
containers/images/networks/volumes/build cache, development databases, build
outputs, logs and temporary artifacts. Scope is this project's resources on
accessible development machines, not arbitrary personal files or other projects.
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
- GitHub branches: scope deletion to the verified Server Guy repository remote and
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
The initial Hetzner server IDs are 165619823, 165694537, 165697333, 165702693 and
165706272. Their names, lack of local application matches and age are insufficient
to establish that they are disposable.

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
