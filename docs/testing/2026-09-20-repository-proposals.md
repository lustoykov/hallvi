# Proposing a repository change — 20 September 2026

What was checked before `open_pull_request` was proposed for review, and what
it does not establish.

## The App's real configuration

Read through Hallvi's own connection, not from the GitHub settings screen:

```
app hallvi-app (owner lustoykov)
  permissions { contents: "write", metadata: "read", pull_requests: "write" }
installation 159108259
  repository_selection "all", suspended_at null
  permissions { contents: "write", metadata: "read", pull_requests: "write" }
```

So the published App does grant write. The owner's own installation is set to
**all** of their repositories; a distributed release's users choose theirs, and
Hallvi never widens that selection. This is what the settings and integration
copy now says, and what it used to deny.

## Live, against a disposable repository

`lustoykov/hallvi-pr-proposal-check-20260920`, created for this check with two
files. The repository was created with the host `gh` login, which is fixture
setup; every step below used Hallvi's own GitHub App connection through
`connectedGithubCredential`, and nothing in the product path touched `gh`,
`GH_TOKEN` or `GITHUB_TOKEN`.

A real `PiWorkspace` took the copy through `applicationWorkspaceSource`, Pi's
own `write`, `edit` and `bash` tools made the change in it, and the real
`proposeRepositoryChanges` published it.

- The copy came from `…@7ce9572`, recorded as provenance beside it.
- Pi added a `Dockerfile`, changed `server.js` to read `PORT` from the
  environment, and left a `scratch.log` behind in the workspace.
- **Branch** `hallvi/add-a-dockerfile` at `df1231a`, whose single parent is
  `7ce9572` — the revision Pi actually read, not the branch tip at publish
  time.
- **Pull request** [#1](https://github.com/lustoykov/hallvi-pr-proposal-check-20260920/pull/1)
  into `main`. Read back from GitHub, its diff is exactly
  `Dockerfile` (+5) and `server.js` (+1 −1). `scratch.log` is absent, and so is
  `README.md`, which was named but unchanged.
- **`main` is still `7ce9572`.** The only refs in the repository are `main` and
  the new branch.
- **Asked again** with the same branch: `reused`, same commit, same pull
  request, no second branch and no second pull request.
- **A repository the owner cannot write to** (`octocat/Hello-World`): refused
  with the fork limitation stated, and nothing attempted.
- **Credential scan** over the commit, the pull request and every ref: the
  access token, the refresh token and any `gh*_`-shaped text are all absent.
  The commit is authored by the owner's own GitHub account, as a user-to-server
  token makes it.

## Scripted

`tests/application/integration/github-proposal.test.ts` runs a real workspace
and Pi's real file tools against an in-memory GitHub, so every request is
counted. It covers the published diff and its parent revision, build output
and dependencies left out, the untouched default branch, a file the copy holds
only redacted and a file a command left a credential in, an installation
without write permission naming the missing permission and writing nothing, a
default branch renamed since the copy was taken, and the retry after a pull
request that did not open. `tests/application/unit/pi.test.ts` covers the tool
going through the permission boundary and a decline reaching no GitHub call.

The whole application suite passes on Node 22 (959 tests, 3 opt-in skipped),
along with `npx tsc --noEmit`, `npm run lint` and `npm run format`.

## What this does not establish

- No partial failure was produced against real GitHub. The `branch-only`
  outcome and its retry are covered by the scripted test only.
- No installation without write permission was tried live; changing the
  owner's own installation to prove the message was not worth the disruption.
- Nothing was built, deployed or merged. A pull request that opens is a pull
  request, not a working application.
- The Docker workspace path was not exercised live; the direct workspace was.
- Publishing works only while the workspace that made the changes is still
  alive. A worker restart ends it, and the changes have to be made again.

## Retained

The fixture repository and its pull request are kept as the evidence above and
registered as a disposable resource. Deleting a repository needs the
`delete_repo` scope, which the host `gh` login does not have, so the owner
removes it from its settings page when the review is done.
