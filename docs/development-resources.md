# Development resources

A development task cleans up what it created, and nothing else: cloud fixtures,
containers, previews and test data. Worktrees are not on the list. Claude Code
and Codex remove a worktree when its session is archived, so never remove one
by hand.

## Scope: development resources, not user systems

This applies to agents developing Hallvi. It grants no housekeeping authority
to Pi operating a user's application, whichever command launched Hallvi, and
it does not make user deployments or local product data disposable. Pi's
boundary is defined in [Product](../PRODUCT.md#operating-boundary) and its
runtime prompt.

Remove only exact resources your task created, by exact path or ID. Do not scan
home, desktop, document or download folders, other repositories or shared
temporary and cache directories for things to remove, and never prune Docker
in bulk. Preserve user files, product databases, backups, credentials,
conversation history and evidence. If you are not sure a resource is yours and
disposable, leave it and say so in the handoff.

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
version that ever existed, and it covers development installations only, not
the applications Pi manages. [Cleanup scope](architecture/cleanup-scope.md)
draws the same line as a picture.

## Cloud fixtures

Use a local provider stand-in when a real provider adds nothing, and a real
host when the step is about deployment itself. Create resources only in a
provider project you are authorized to use, and verify its identity before any
change. A paid add-on the provider or a model suggests — backups, extra
storage, a larger plan — is a separate billing decision: decline it, or ask
while it can still be declined.

Label each server and each separately created volume, snapshot, IP, load
balancer, network, firewall or SSH key, preserving unrelated labels:

| Label | Value |
| --- | --- |
| `sg-project` | `hallvi` |
| `sg-environment` | `development` |
| `sg-lifecycle` | `temporary`, or `persistent` for a kept environment |
| `sg-owner` | A unique task ID |
| `sg-branch` | Label-safe branch slug (maximum 63 characters) |
| `sg-expires-at` | UTC Unix timestamp in seconds; default now + 72 hours, renewed while the task is active |
| `sg-cleanup` | `allowed` for disposable fixtures, otherwise `retain` |

**Delete them when the task ends**, by exact ID. Check for separately billed
storage, snapshots and IPs; never assume a deletion cascades. Re-list to verify
they are gone, and list what you deleted and anything you kept, with the
reason, in the handoff. Anything kept gets `sg-cleanup=retain`.

## Local processes and containers

Record the PID and port of every preview a task starts. Stop previews used only
for your own checks before the handoff. Leave a preview someone is reviewing
running and give its link; stop it when that review ends. Stop the exact
processes with `SIGTERM`, then run `node scripts/check-preview-processes.mjs`
in that checkout to find any remaining Next.js or local preview processes, and
confirm their ports closed. The check only reports PIDs; match each to its
command and port before stopping it. Leave intentional tunnels and installed
Hallvi services running.

Remove the containers, networks and images your task created once nothing
depends on them. A volume is persistent data: remove it only when your task
created it and it holds nothing but test data.

## Provider audit on request

When asked to audit a provider project, list every kind of resource it holds —
servers, volumes, snapshots and backups, IPs, load balancers, networks,
firewalls and SSH keys — across all pages, and report anything you cannot read
as a gap, never as an empty account. List everything before deleting anything:
a list that omits a kind cannot establish afterwards what was in it, and
Hetzner keeps no audit log for SSH keys (see the
[resource scope audit](testing/2026-09-14-resource-scope-audit.md)).

Delete only what the person who asked approves, and only resources with the
labels above, `sg-cleanup=allowed`, an expired `sg-expires-at`, no deletion
protection and no dependency outside the same set; re-read them immediately
before deleting. Unlabelled resources are report-only. Credential-shaped
resources — SSH keys, tokens, registry logins — are kept unless you can name
their owner: unused is not unowned.
