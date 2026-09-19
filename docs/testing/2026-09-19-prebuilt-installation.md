# Prebuilt installation candidate — 19 September 2026

This is an engineering installation check for commit
`db009f61a3921612710508271f3d46298c381094`, version `0.1.0`. It does not
complete the external-user beta walkthrough in the [roadmap](../../ROADMAP.md#public-self-service-beta-preparation).

| Archive | SHA-256 |
| --- | --- |
| `hallvi-0.1.0-darwin-arm64.tgz` | `a36b21b4b5b82e5bd3b48e840706ebca3b5c1a4941c661d404d6b3129791f0f5` |
| `hallvi-0.1.0-linux-x64.tgz` | `2cff84b8033733c8ade97882118c6202e102a673eb78bc8e92e309bf154b0805` |

Both archives embed the full source revision and Node.js `22.23.2` in
`dist/release.json`. The shared `install-hallvi.sh` verifies a matching archive
checksum and platform before the inner installer changes the program. The
archives include the Node runtime and production dependencies. Neither includes
controller state, account credentials or a configured GitHub App identity.

## Machines and observed behavior

| Check | Apple-silicon Mac mini, macOS 15.7.9 | Hetzner CX23, Ubuntu 24.04 x64 |
| --- | --- | --- |
| Clean ordinary-user install | Passed with no Node or npm installed on the Mac. The verified archive started a launchd agent, interface and worker on temporary port 5947. | Passed for a new `hallvi` user without Node, npm, `cc` or `make`. No compiler or language runtime was installed on the recipient. The systemd user unit started interface and worker on temporary port 5747. |
| Browser | The MacBook reached the Mac mini's interface through a temporary SSH forward; the first-run and GitHub unavailable states were inspected. No real account was connected. | The MacBook reached the VPS interface in a browser through loopback SSH forwarding. The CLI printed all 12 required ports: 5747, 5748 and 5757–5766. |
| Same-schema upgrade | The final archive replaced an earlier build while the service was running. The service and worker returned ready; the saved port setting remained. | The final archive replaced an earlier build while running. The service and worker returned ready; the saved port setting remained. |
| Restart and return | launchd service readiness was checked after the upgrade. A real logout/login was not performed. | Closing the SSH session made the laptop URL unreachable while the VPS service stayed healthy; reconnecting restored the browser. After a full VPS reboot, `Linger=yes`, the enabled user unit, interface and worker were ready before the verification session; `who` showed no prior login. |

The initial Linux attempt with an earlier archive caught a native-module
preflight path error before the program or service changed. The corrected
archive passed a clean install on the same fresh user; the final revision
upgrade above also passed. A checksum-failure check stopped before installation.

The focused application tests passed (53 tests), as did TypeScript, formatting
and five browser journeys covering ChatGPT return with the draft intact and
GitHub consent, denial, cancellation, renewal and recovery. The browser tests
use synthetic provider responses. The real temporary installations did not
perform ChatGPT or GitHub consent, repository inspection or deployment.

## Retention and open gates

The Mac mini test service and its empty controller state were removed after
verification. Its installer archive, checksum and script were left in
`~/Downloads/Hallvi-install-candidate-2026-09-19/` for the owner's own later
installation. The same files, plus the Linux archive and checksum, are retained
in that named Downloads folder on the MacBook. The owner's existing MacBook
Hallvi service and state were not changed.

The two temporary Hetzner VPSs, their four attached primary IPs and the task
SSH key were deleted by exact ID after verification; provider reads confirmed
their absence. The ownership and cleanup record remains outside worktrees in
the development resource inventory.

The GitHub App in the owner's development setup is not yet a distributable
identity for another account. This candidate truthfully offers public
repositories without sign-in and shows private connection as unavailable until
a reviewed App identity is configured. A trusted download location, signing,
fresh external-user OAuth, native repository inspection and a real deployment
on this exact candidate remain open. The archived revision tested here still needs Docker for local repository
inspection. PR #154 now includes PR #153’s optional-Docker implementation;
these retained archives do not contain that integration. On the combined
source, 175 focused workspace, account-setup and installed-port tests passed
on Node.js 22, together with TypeScript and shell/Node syntax checks. Rebuild
and test both platform archives before using this evidence for the combined
release.
Other CPU/OS targets and a real macOS logout/login were not checked.
