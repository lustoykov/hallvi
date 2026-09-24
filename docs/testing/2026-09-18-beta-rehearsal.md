# Beta installation and deployment rehearsal — 18 September 2026

This is an engineering rehearsal, not the external-user acceptance required by
[Roadmap](../../ROADMAP.md#public-self-service-beta-preparation).

## Candidate

The initial archive was built from `b4382ec2199fa38fe60477280d4658ae42cb0c75`.
A real repository inspection exposed the forced-amd64 workspace failure on the
Apple-silicon Mac. [PR #143](https://github.com/lustoykov/hallvi/pull/143) fixes
that by building the workspace for the local Docker Engine's architecture.
[PR #142](https://github.com/lustoykov/hallvi/pull/142) adds contextual authority
and beta precautions.

The final archive is built from merged commit
`b713c991dd2d5f7fc5d1985ff76c81d34ffcaea2`, version `0.1.0`.
SHA-256: `60e6aeabe15a2b7e5b277840eb92cd0b5b62f8b134a7156a9972e805d5306b76`.
Its embedded release metadata agrees with the source revision. Its 888 archive
entries contain no controller state or credential/config files, absolute paths
or escaping symlinks.

## Installation and lifecycle

A task-owned Hetzner CX23 in an authorized Hetzner project ran Ubuntu 24.04
x64 with systemd 255. A fresh unprivileged user installed the archive using its
normal `install.sh`; the installer downloaded Node 24.21.0 and installed the
locked dependencies. The first install took about 40 seconds for dependencies.

| Check | Evidence |
| --- | --- |
| Clean installation | Interface and worker started under systemd; the interface bound only to loopback. |
| Restart | An application, conversation, recorded message and saved information remained byte-for-byte identical as canonical row data. |
| Running same-schema upgrade | Program replaced and service returned running; exact saved record digest unchanged. |
| Stopped same-schema upgrade | Service stayed stopped; saved records unchanged; explicit start restored it. |
| Incompatible schema | A test copy of the archive declaring schema 16 was refused against schema 15; original service PID remained running. The database was not modified. |
| Worker crash | Killing only the task-owned worker caused the pair to restart. With an open browser connection, shutdown and restart took roughly 45 seconds, longer than the old guide promised. |
| Upgrade to final candidate | `hallvi status` reported `b713c99`; saved records still matched the pre-upgrade digest. |
| Full Linux reboot | Lingering was enabled. Service entered active state before the subsequent verification SSH connection; `who` was empty, and interface plus worker answered. |
| Laptop access | The Linux interface was used in the laptop browser through a loopback-bound SSH forward, on an alternate port to avoid the owner's installation. |

The retained-record digest was
`f4222182f8b3446c323b297c4ff0197f751a642261c5d8d3287d0c88b3bf34be`.
Initial lifecycle tests used `b4382ec2`; the real cross-revision upgrade and
reboot used the final `b713c99` candidate. These commits share schema 15 and
the same installer/service implementation.

The Mac ran the extracted final archive with fresh controller state and native
production dependencies under Node 24.21.0. It reused the existing local model
account in place, without copying credentials. The owner's installed service,
its state and original checkout were not upgraded or reset.

## Native repository workspace

Real ARM Docker integration exercised source snapshot reads, Bash, PowerShell,
isolation and cancellation. On the real x64 Linux host, the image also built
and ran as a non-root user with no network and a read-only root filesystem.
Both architectures ran Node 24.21.0, PowerShell 7.5.4 and Compose 2.40.3. The
four binary checksums were independently compared with the official GitHub
release assets. Focused registry/workspace tests, TypeScript, production build,
formatting and lint passed; lint retained 13 existing warnings.

## Real application journey

The final candidate inspected 18 source files and made four searches in the
native repository workspace. Hallvi identified linkding 1.47.0 at source commit
`27b7303baf41bb28babc610ac8eaa486e1ddfab5`, explained its Docker/SQLite setup,
and offered hosting choices without provisioning anything.

The normal existing-machine flow connected the disposable Ubuntu host. Its
contextual beta guidance was visible; reachability, identity, SSH, administrative
access, Docker and capacity checks passed. The operator generated an initial
administrator password in the secret store after a normal conversation request,
then deployed the upstream image. No model/provider/SSH adapter was simulated.
The image digest was
`sha256:e35cb50e0581178f245125ffaa909c565416c94c9f22ace305a7d234a4345522`.

The operator recovered from a missing Compose plugin by using Docker directly,
corrected a shell-quoting error and the login endpoint's canonical slash, then
verified the administrator login and persistence through container replacement.
Eight initial saved-record calls failed schema validation before the operator
corrected their fields and saved the final records. This was a successful but
not frictionless run: deployment and final record writing took about seven
minutes after the generated-password request.

The application listened only on server loopback. Hallvi opened its own SSH
forward at `127.0.0.1:4907`; the external server port refused connections.
The browser signed in with the generated administrator credential and created
bookmark **Hallvi beta persistence — 18 September**, URL
`https://example.com/?hallvi-beta=20260918`, tag `hallvi-beta`, with a recognizable
description. The generated credential was retrieved through the existing
same-origin reveal API for this engineering check; the external-user walkthrough
must still verify the normal credential-discovery experience.

Refreshing Hallvi retained its conversation and deployment/access cards. Stopping
and starting the isolated Mac controller retained exact application, conversation,
message and saved-information rows (digest
`e18fcd9d79e71744bb228658094abd1599e3512fcc8d65925b0799f91a8524dd`).
The existing SSH forward survived that restart. Closing this fixture's forward
separately made Overview show **The tunnel is closed**, **Access: No**, and
**Open the connection again**. That action prepared a contextual message; sending
it caused the real operator to reopen the private link. Reloading Linkding showed
the same saved bookmark, tag and description.

During the walkthrough the owner identified duplicated progress wording between
the top first-deployment rail and the live response. A subsequent focused UI
refinement is separate from this candidate's deployment evidence.

## Remaining launch gates

- A person outside the development setup must run the
  [beta walkthrough](../beta-walkthrough.md) with their own model/account
  connection. Existing-account reuse is not a fresh OAuth acceptance check.
- The archive still needs a public distribution route. A private repository or
  draft release is not a public self-service download.
- Clean macOS installation on this final candidate has not been repeated; the
  owner's working installation was preserved. Earlier macOS service evidence
  remains dated. macOS Intel, Linux arm64, other distributions, and real macOS
  logout/login remain unverified platform combinations.
