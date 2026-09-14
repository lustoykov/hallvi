# Development resource ownership and cleanup

This policy covers local development resources for Server Guy. Hetzner and
other shared cloud resources belong to the separate daily cloud audit on the
owner's other machine; do not create or perform a competing cloud cleanup from
this repository. The [cleanup decision flow](architecture/development-cleanup-decision.html)
summarizes the evidence gates below.

## Ownership and records

- Give newly created worktrees, branches, Docker resources, test databases and
  long-lived local processes an identifiable task owner and, when temporary, an
  expiry or completion condition.
- Keep the durable ownership inventory, cleanup audit and expected-tip leases
  outside every worktree under
  `/Users/aiwithlyubomir/Library/Application Support/Server Guy/development-cleanup/`.
  Keep those records owner-readable only and never store credentials or secret
  values in them.
- Missing labels on older resources are not proof that they are disposable.
  Classify them from repository identity, task or pull-request state, process
  ancestry, dependencies, modification history and retained data. Report an
  uncertain classification instead of deleting the resource.

## Task completion

Before retiring a task's branch or worktree:

1. Confirm the exact repository and task, and that the task is completed.
2. Check active Codex and Claude sessions, related processes and ports,
   dependent worktrees or Docker resources, and data that must be retained.
3. Inspect worktree status, staged and untracked files, valuable ignored files,
   and commits not preserved by an integration branch.
4. Remove only resources proved disposable, verify each removal, and record its
   exact path or ID, retained items, failures and reclaimed space when
   measurable.

Preserve dirty worktrees, staged or untracked work, valuable ignored files,
unmerged commits, active resources, credentials, settings, session history,
controller databases and uncertain data.

## Worktrees and branches

- Discover all registered locations with `git worktree list --porcelain` from
  the repository. This includes Codex and Claude custom paths as well as
  `.claude/worktrees/`; Claude worktrees can also be under `/private/tmp` (the
  same directory as `/tmp` on macOS).
- A matching name in a temporary directory does not establish ownership. Before
  cleanup, verify its Git common directory or remote, task completion, worktree
  status, ignored files and active session or process use. Report unregistered
  or uncertain directories rather than deleting them.
- Never force-remove a worktree. Remove one only after it is clean, inactive,
  independent of retained resources and its commits are durably preserved.
- For a local or GitHub branch, preserve the default branch, protected,
  release and shared branches, branches used by active tasks or open pull
  requests, and any tip not preserved in its intended integration branch.
- Do not infer preservation from a closed or merged pull request alone. Fetch
  current refs and check for commits added after merge, including squash and
  rebase merges. Immediately before deletion, recheck the repository, task,
  pull request and integration state; delete only when the branch still equals
  the recorded expected-tip lease. Never force-delete a branch.

## Docker and generated data

- Inspect Server Guy-owned containers, images, networks, volumes and build
  caches individually. Never run a broad Docker system or volume prune.
- A database or volume may be removed only with evidence that it contains
  disposable test data and is not a controller database, retained fixture,
  backup, active dependency or uncertain data store.
- Build outputs, logs, browser artifacts and temporary files may be removed only
  when their Server Guy ownership is clear, no active process needs them, and
  they are not retained evidence. `.server-guy/`, `.next/` and `tests/results/`
  are local data, not automatically disposable data.

Daily cleanup should stay quiet when nothing meaningful changes. Report only
actionable findings, completed cleanup, failures or decisions that need the
owner, with exact evidence and verification.
