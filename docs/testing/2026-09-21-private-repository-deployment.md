# Private repository source deployment — 21 September 2026

The reported failure was an installed Hallvi asking for a separate
`GITHUB_REPOSITORY_TOKEN` after its GitHub App access check had passed. The
operator could inspect the private repository, but had no source-transfer tool
for deployment on its connected host.

## Verified

- The new `copy_repository_to_server` uses the saved App credential on the
  controller, resolves a requested ref to an exact SHA, validates the full
  archive and sends source bytes through the managed, host-key-pinned SSH
  connection. The server verifies the checksum before extracting. It returns
  the source directory and commit; Pi still builds, deploys and verifies.
- A disposable **private** repository, `lustoykov/hallvi-source-transfer-20260921`,
  was read with the owner's existing Hallvi GitHub App connection, including
  normal renewal of that saved login. No personal access token was supplied.
- Two successive commits to `main`,
  `fd75f81910db0c5d7ca4ee274a53de1ac92515d6` and
  `d4c45a2d4ae6529692874d8384a73096cd2ab5ac`, were independently resolved and
  transferred to the registered development Linux host. A temporary static
  HTTP server bound to loopback served each revision; `curl` output matched
  its exact source file. The four retained development applications were not
  changed. The owner's Mac mini installation was not updated by this test.
- Focused regression coverage runs the real checksum/extraction script with
  only SSH transport and GitHub substituted: repeated `main` resolution,
  binary bytes and executable permissions, preserving the earlier directory,
  no credential in SSH arguments or evidence, access denial and unsafe paths
  refusing before any host action. Existing execution tests cover permission
  modes. Pi-owner integration coverage still passes with the added tools.
- An obsolete unfilled secret request can be withdrawn; a supplied credential
  cannot be removed through that operation.

The complete application suite passed: **1,049 tests**, with three existing
opt-in tests skipped. TypeScript and focused ESLint checks passed.

## Limits

The live proof invoked the production transfer and execution boundary directly;
it did not ask a live model to choose the new tool. HTTP proof used a small
static fixture, not the owner's application build. Git submodules, LFS object
materialization and linked source trees remain unsupported by this transfer.
Automatic deployment on push is not included. The existing separate
**Read repository** first-use action is unchanged.

## Cleanup

Exact fixture directories, application identity, repository and cleanup results
are registered outside the worktree under task
`01a0c3eb-e385-7001-853b-ac462ff8a712`. Live receipts stay under
`tests/results/github-deployment` and are not committed. No billed host was
created; the test used isolated temporary paths on the registered development
host.

Both remote source directories were removed and their absence verified. The
private fixture repository was archived and retained as reproducible evidence.
The temporary HTTP processes ended after each check; fixture operator records
were removed. Local receipts and the isolated worktree are retained for review.
