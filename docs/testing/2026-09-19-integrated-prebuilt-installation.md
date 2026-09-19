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

## Real installed-service journey

The owner completed a fresh ChatGPT device authorization in the installed
Ubuntu controller; the UI showed **Login saved**. Through the normal browser
flow, real Pi read and searched the public `docker/getting-started-app`
repository in the default direct workspace, explained the to-do app and its
SQLite/Node requirements, and asked where to run it. The browser's
existing-machine card generated an application-specific SSH key and verified
the separately created, task-owned Ubuntu 24.04 application host's identity,
SSH access, administrator access, OS and resources.

Pi installed Ubuntu's Docker and Compose packages on that host, checked its
existing listeners and disk, and built repository revision
`6b025fc53bc7b9bef435d6b09bcd1da5a871c9cc`. The resulting container was
healthy, ran without root with a read-only root filesystem, and published only
`127.0.0.1:3000` on the host. SQLite lived in the labeled named volume
`getting-started-app-sqlite`. Pi wrote an item, replaced the container,
confirmed the item survived, then removed that temporary item. An external
connection to port 3000 was refused; Hallvi's private SSH link at
`http://127.0.0.1:5757` returned HTTP 200 through the controller and laptop
forwards.

The MacBook browser used that private link to add a separate to-do item and
found it again after page reload. After `hallvi restart` on the controller,
the conversation and deployment records remained, Overview showed the tunnel
as closed, and the private link no longer answered. **Open the connection
again** restored the link through Pi; Overview showed access verified and the
same to-do item was still present in the app. This verifies installed-service
inspection, deployment, application use and data persistence across a
controller restart on this candidate.

Two recoverable frictions appeared in Pi's visible transcript: a `git status`
command failed because the direct workspace's repository copy has no `.git`
directory, and eight initial `save_information` calls failed with **Saved
information not found** because Pi supplied new IDs while creating records.
Pi continued and saved eight records without those IDs; the deployment and
access views displayed them. These failed attempts are part of the evidence,
not successful checks.

## Remaining acceptance work

An external account's private-repository journey remains blocked because the
archive's `github-app.json` has no client ID or slug. The private App in the
owner's development setup is not a distributable identity; App visibility was
not changed. Public repository intake works without that connection. There is
still no signed or publicly published download. A person outside the
development setup must run the [beta walkthrough](../beta-walkthrough.md) on
the final distributed candidate using their own accounts. This engineering
run used the owner's fresh ChatGPT connection and task-owned hosts, so it does
not complete that external-user gate.

## Artifact and resource disposition

The MacBook retains both archives, checksums and installer in
`~/Downloads/Hallvi-install-candidate-2b18af-2026-09-19/`. The Mac mini
retains the macOS three-file bundle in its matching Downloads directory. Its
temporary test service and state were removed. The previous `db009f61`
bundles remain as clearly marked superseded evidence.

The two labeled task-owned Hetzner VPSs (`166540390`, `166540392`) were
deleted by exact ID after the run. Their deletion actions succeeded; provider
reads returned 404 for both servers and all four attached, auto-deleted primary
IPs. The task SSH key (`130216464`) was deleted and verified absent. These
resources were used only for this engineering run; the owner-only development
resource inventory outside the worktree records their labels, dependencies and
cleanup. The application host's labeled SQLite volume held only task-created
test items and was on its deleted server disk. The installed controller's
temporary ChatGPT credential files and database were on its deleted server
disk.
The owner's existing MacBook Hallvi service and data were not changed.
