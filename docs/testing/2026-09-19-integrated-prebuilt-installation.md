# Integrated prebuilt candidate — 19 September 2026

This is an engineering check of the exact committed source revision
`2b18af16343a324191ac8d14b3092d3fe17fa7ab` (version `0.1.0`). It
includes the optional local Docker workspace from PR #153. It does not complete
the [fresh-user beta walkthrough](../beta-walkthrough.md).

| Archive | SHA-256 |
| --- | --- |
| `hallvi-0.1.0-darwin-arm64.tgz` | `d81de3388365ed9c6ef04b969a705ba22c912332c1f565f6779971f25b1216e1` |
| `hallvi-0.1.0-linux-x64.tgz` | `c1182c279fd03685d20202588e8f4730207c02cdf00fed0c81ff4592e294da6d` |

Both archive manifests record that revision and Node.js `22.23.2`. The archives
were built on their named platforms with `npm ci`; the MacBook copy's SHA-256
values match the build outputs. The shared `install-hallvi.sh` verifies the
matching checksum and platform. No archive contains controller data, account
credentials or a configured GitHub App identity.

## Installed machines

| Check | Mac mini, macOS 15.7.9 arm64 | New Hetzner Ubuntu 24.04 x64 controller |
| --- | --- | --- |
| Clean installation | The ordinary logged-in user installed the verified archive with no Node or npm installed. A temporary launchd service started its interface and Pi worker on port 5947. | A new ordinary `hallvi` user installed the verified archive with no Node, npm, compiler, make or Docker on the recipient. The systemd user service started its interface and Pi worker on port 5747. |
| Browser and workspace | The MacBook reached the Mac mini through SSH. The first-run UI selected **On this computer**; **In Docker** reported no local engine. | The CLI printed all 12 loopback SSH forwards (5747, 5748, 5757–5766). The MacBook browser reached the headless controller. **On this computer** was selected by default; **In Docker** reported no local engine. |
| Repository intake | The GitHub setup screen reported private repository connection unavailable because this archive has no distributable App identity. | The browser added the public `docker/getting-started-app` repository without GitHub sign-in. The application and conversation remained visible after `hallvi restart`, a full VPS reboot, and same-archive reinstall. |
| Service return | The temporary service and its empty state were removed afterward, leaving the owner's manual first install untouched. | After reboot, `Linger=yes`, the interface and Pi worker were running before a user login; reconnecting the SSH forward restored laptop browser access. |

The Ubuntu reinstall checked native-module/database preflight and program
replacement on the combined archive while retaining the saved application and
port setting. This was a same-schema reinstall, not a schema migration.

## Remaining acceptance work

The next product screen asks for a fresh ChatGPT device authorization before
**Read repository**. The owner has not yet completed that authorization for
this candidate. Consequently this installed-service run has **not** established
real repository inspection, Pi's direct workspace operation, deployment to the
task-owned application host, use of the running app, or app-data persistence
after restart. [Earlier optional-Docker evidence](2026-09-19-optional-local-docker.md)
established those behaviors from a development controller, not from this
installed archive. Neither proof substitutes for the other.

An external account's private-repository journey remains blocked because the
archive's `github-app.json` has no client ID or slug. The private App in the
owner's development setup is not a distributable identity; App visibility was
not changed. Public repository intake works without that connection. There is
still no signed or publicly published download. A person outside the
development setup must run the [beta walkthrough](../beta-walkthrough.md) on
the final distributed candidate.

## Artifact and resource disposition

The MacBook retains both archives, checksums and installer in
`~/Downloads/Hallvi-install-candidate-2b18af-2026-09-19/`. The Mac mini
retains the macOS three-file bundle in its matching Downloads directory. Its
temporary test service and state were removed. The previous `db009f61`
bundles remain as clearly marked superseded evidence.

At this check's handoff, two labeled task-owned Hetzner VPSs remain within a
72-hour cleanup lease: the installed controller and the intended application
host (also used to build the Linux archive). Their exact IDs, attached IPs,
SSH key, owner UUID and expiry are in the owner-only development resource
inventory outside the worktree. They are retained only for resuming the fresh
authorization and real deployment check, then must be retired by exact ID.
The owner's existing MacBook Hallvi service and data were not changed.
