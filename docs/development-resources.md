# Development resource lifecycle

Development resources must have an owner, a retention decision and a completion
condition. This policy covers branches, processes, Docker, test data and real
Hetzner fixtures. Worktrees are not on the list: archiving a session removes its
worktree, in both Claude Code and Codex, and Codex keeps a snapshot first. Never
remove one by hand. Nothing here makes product users' deployments disposable.

## Scope: development resources, not user systems

This policy applies to agents developing Hallvi. It grants no housekeeping
authority to Pi operating a user's application, whether Hallvi was launched with
a development or production command. User deployments and local product data
are not development fixtures. Pi's boundary is defined in
[Product](../PRODUCT.md#operating-boundary) and its runtime prompt; disposal of
Pi's repository workspaces and agreed backup retention are product behavior and
do not inherit this policy.

Cleanup starts from exact Hallvi-owned paths and IDs. Do not scan the home
directory, Desktop, Documents, Downloads, other repositories or shared
temporary/cache roots for things to remove. A registered fixture outside the
repository authorizes only that fixture, not its parent or siblings. Resolve
symlinks and inspect mounts before deleting: owning a directory entry does not
establish owning its target or mounted contents.

Even inside Hallvi folders, preserve user files, product databases, backups,
credentials, conversation history and retained evidence. Creating or managing a
resource does not make its data disposable. Shared Docker and cloud accounts are
not cleanup scopes: use exact, verified IDs. Uncertain targets remain untouched.

## Discarding development data

Disposable development data stays disposable. In a test fixture, a scratch
checkout or a worktree's own `.hallvi`, start a new schema empty: do not build
migrations, legacy readers, archive or import features, or compatibility
adapters to carry an old prototype forward, and remove obsolete workflows and
their recovery machinery outright as the new path replaces them. Git retains
source history.

**The [development environment](development-environment.md) is the one
exception, and being the exception is what it is for.** It keeps its
applications, conversations, records and the deployed applications' own data
across restarts, code upgrades and supported schema changes; starting it empty
would destroy the only thing it can prove. So a change to how Hallvi stores
anything arrives with the migration for the supported schemas, and with
evidence that its applications still open, still show their history and still
hold their data. That is a supported upgrade path, not compatibility with every
version that ever existed, and it covers this development installation only,
not the applications Pi manages. [Cleanup scope](architecture/cleanup-scope.md)
draws the same line as a picture.

## Development host and cleanup owner

Development runs locally on the owner's MacBook. The Mac mini is a retired
development host: do not create new development tasks, previews or verifier
services there. Retiring that host does not make its files or servers disposable.
Audit its remaining work once, preserve unique work and configuration, stop only
verified obsolete development processes, and record unresolved resources locally.

No scheduled task deletes development resources. Each task cleans up what it
created, as [finishing a task](#finishing-a-task) describes. The local **Disk
Audit** runs daily and only reports. Local **RAM Care** may manage preview
memory under its own narrow authorization. Hetzner is audited only when the
owner asks. Do not create a scheduled cleaner or a second cleanup owner unless
the owner asks for one.

Use a local provider stand-in when a real provider adds nothing, and a real host
when the step is about deployment itself. On 14 September 2026 the owner
standing-authorized creating billed development resources in the existing
authorized Hetzner project (currently Default) whenever the work needs them. It
authorizes creating and using, not deleting: resources you did not create stay,
and the rules below apply to everything you create. Do not create projects;
verify account and project identity before any provider mutation.

A model-selected paid add-on on a resource you were authorized to create —
provider backups, extra storage, a larger plan — is a separate billing decision.
Decline it, or raise it with the owner while it can still be declined.

## Ownership records

Keep one inventory and dated audit records outside all worktrees at
`~/Library/Application Support/Server Guy/development-cleanup/` on the local Mac
(named before the rename to Hallvi), owner-only (directory 0700, files 0600),
with no secret values. Record resource identity, machine and project, task
link, exact branch and tip, purpose, lifetime, retention decision and
verification evidence.

Classify resources explicitly: **persistent** resources remain;
**shared-development** hosts remain while isolated completed fixtures can be
cleaned; **disposable** fixtures are eligible only after the checks below.
Unclassified and unlabelled resources are report-only: present them to the
owner, never adopt them into cleanup by name, age or absence of a local match.
An expired lease makes a resource a candidate, never sufficient proof.

## Cloud fixtures

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

Record each one in `<owner UUID>.json` in the inventory above: project, resource
type and provider ID, owner UUID, exact branch, machine, task link, purpose,
creation and expiry timestamps and disposition. Record it immediately; after an
uncertain create, reconcile provider state before retrying.

Renew expiries to now + 72 hours when resuming a task and before long tests. Do
not relabel persistent or shared resources as temporary. For a demo, shared
service or valuable data, set `sg-cleanup=retain`, record why and name the owner.

## Finishing a task

**Cloud fixtures go when the task ends**, because they bill. For each disposable
fixture with the full label contract, verify ownership and that no other task or
deployment depends on it, then delete it by exact ID; it need not wait for
expiry. Check for separately billed storage, snapshots and IPs; never assume
cascading cleanup or that attached resources are disposable. Re-list to verify
absence, and record deleted IDs, retained IDs with reasons, and failures in the
registry and the handoff. Keep useful evidence without keeping a host running
for it. If blocked, leave labels and records intact and report the resource.

### Local preview processes

Record the PID and port of every preview a task starts. Stop previews used only
for your own checks before the handoff. Leave the preview the owner will review
running and put its link in the handoff; stop it when the owner's review ends,
and at the latest in the check [after your work merges](#after-your-work-merges).
Stop the exact processes the task started with `SIGTERM`, run
`node scripts/check-preview-processes.mjs` in that checkout to find any
remaining Next.js or local preview processes, and confirm their ports closed.
The check only reports PIDs; match each to its owner, command and port before
stopping it. Keep intentional SSH tunnels, installed Hallvi services and other
retained processes running, name their owner in the handoff, and make sure none
depends on files in a checkout that archiving will remove.

### After your work merges

Everything else the task created — local and GitHub branches, Docker
containers, images and volumes, development databases, build outputs and
temporary files — goes through the owner. For each exact resource, establish
that the task owns it and that nothing still depends on it. Check running
processes, open files and ports, `git status` including untracked and ignored
files, commits that are not on `main`, other worktrees, open pull requests, and
any data or test evidence. A merged pull request or an old modification date
alone does not show that deletion is safe.

Then give the owner a short GO/NO-GO list that names each exact target, says why
it is or is not safe to remove, and estimates the space it frees. Wait for fresh
approval before deleting anything under `~/biz/` or any Docker resource. These
instructions are not that approval, and neither is an approval given earlier
for a different target.

Once the owner approves:

- **Branches.** Delete one only when its exact tip is in `main` (for a squash or
  rebase merge, the merged pull request covers its current head), it is not a
  default, protected or shared branch, no worktree has it checked out and no
  open pull request uses it as head or base. Delete a local branch with
  `git branch -d`, never force. Delete a GitHub branch with an expected-SHA
  lease, so a concurrent push stops the deletion; never bypass protection.
- **Docker.** Remove only task-owned containers, networks and images nothing
  else depends on. A volume is persistent data: ask for separate, explicit
  approval for each one. Shared build caches are report-only.
- **Databases.** Delete only explicitly disposable fixtures that no process,
  container, controller or retained application references. Treat a SQLite
  database and its WAL/SHM companions as one unit, after a clean shutdown.
- **Build outputs, logs and temporary files.** Only regenerable, project-owned
  files that nothing is reading or writing.
- Never prune Docker resources or branches in bulk.

Recheck each target immediately before removing it, verify the result, and
report what you removed and what you kept, with the reason for each. Moving
files to Trash is relocation, not reclaimed space; do not empty unrelated Trash.
Keep task histories, the owner's outputs and evidence.

## Provider audit on request

When the owner asks for an audit, inventory all pages of servers, volumes,
snapshots/backups, primary and floating IPs, load balancers, networks, firewalls
and SSH keys in each authorized Hetzner project, using existing credentials
without printing them. Report inaccessible projects or resource types as
coverage gaps, never as an empty account. Correlate IDs and labels with the
inventory, saved application hosts and active tasks, and estimate recurring cost
from current prices, marking estimates and unknowns. Run one audit at a time and
keep its dated record, with the unresolved items, in the inventory so the next
audit starts from it; a report-only item does not silently become disposable
later.

Present the findings as a GO/NO-GO list and delete only what the owner approves.
A resource is a GO candidate only when **all** of the following hold:

- Exact project/environment/lifecycle labels above, nonempty owner and branch,
  `sg-cleanup=allowed`, and a valid expired Unix timestamp.
- Evidence that it is a disposable development fixture, with no conflicting
  registry, active task, saved deployment, retention request or provider
  protection.
- No dependencies outside the same eligible set. A server's labels do not
  authorize deleting its attached storage.
- A fresh re-read of labels, expiry, protection and dependencies immediately
  before deleting the exact provider ID. Never disable deletion protection
  automatically.

Before deleting anything in a shared provider project, snapshot **every**
collection it holds, not only the kinds you are about to delete: a snapshot
that omits one cannot establish afterwards what was in it, and Hetzner keeps no
audit log for SSH keys. See the
[resource scope audit](testing/2026-09-14-resource-scope-audit.md).

Credential-shaped resources — SSH keys, tokens, registry logins — are retained
by default, even inside a broad instruction to clean up. Unused is not unowned:
match each one to an owner by label, by a local record or by asking, and delete
only the ones you can name.
