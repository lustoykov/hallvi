# Always-on Hallvi: a ladder of placements

A concept note, updated 17 September 2026 to the owner's decision that
morning. It describes where Hallvi itself runs — the web interface, the Pi
worker, and the records, credentials and native sessions they keep — and what
each place means for care that continues when nobody is looking.

Rungs 1 and 2 are implemented as an installed background service;
[Installing Hallvi](../installation.md) is the practical account and the
owner of every path, port and command. Rung 3 is not implemented. Nothing here adds monitoring, scheduled care or
public access: an always-on installation is where such work could later run,
not that work.

Placement is a ladder the user climbs, not a recommendation we make. Each rung
adds a use case and removes none of the earlier ones.

Two different things are reached, and they must not be confused:

- **Reaching Hallvi**: opening its interface and talking to Pi.
- **Reaching a private application**: the application is bound to loopback on
  its host and reached through an SSH tunnel that Pi opens
  (`open_server_port`). That tunnel ends on the machine running the
  installation. When the browser is on another machine, reaching the interface
  does not reach the application: the link's port has to be carried to the
  browser as well.

## Rung 1: the user's own Mac or Linux PC

The first supported case. The installation and the browser are on the same
machine, so no remote access is needed: the interface binds to loopback, and
there is nothing new to authenticate.

```mermaid
flowchart LR
  B[Browser] --> UI[Web interface]
  UI --> W[Pi worker]
  W --> C[(Records and credentials)]
  W -- SSH --> H[Application host]
  B -- tunnel from this machine --> H
  W -- encrypted copies --> R[(Recovery storage)]
  subgraph The user's Mac or PC
    B
    UI
    W
    C
  end
```

Its honest limit is that care runs while the machine is awake. A closed lid
pauses scheduled work and drops tunnels until the machine wakes, and losing the
machine means rebuilding Hallvi from its recovery kit while the
applications keep serving.

## Rung 2: a virtual machine the user provides

The installation runs on a machine that stays on, and the user reaches it
through a tunnel they open from their own machine. Remote access is the user's
decision and the user's setup: the product does not pick a tunnel, a VPN or a
public login for them, and it keeps binding to loopback so that whatever the
user chooses is the only way in.

```mermaid
flowchart LR
  B[Browser on the user's machine] -- tunnel the user opens --> UI[Web interface]
  UI --> W[Pi worker]
  W --> C[(Records and credentials)]
  W -- SSH --> H[Application host]
  W -- encrypted copies --> R[(Recovery storage)]
  subgraph The user's virtual machine
    UI
    W
    C
  end
```

Care now continues while the user's laptop sleeps. The private application
link ends on the virtual machine, and a page names it as
`http://127.0.0.1:<port>`, so forwarding the interface alone opens nothing. An
installation therefore keeps every loopback port a page can name fixed — the
interface, the browser terminal and a small range for private links — and
`hallvi remote` prints the SSH configuration that forwards them all to the
same numbers. One connection the user opens carries everything, and links work
in the user's browser as written. Signing in to ChatGPT and GitHub uses device
codes, so neither needs a port of its own. Keeping that machine updated and
protected is part of what the user takes on at this rung.

## Rung 3, later: a hosted service we run

We run the installation for the user. This rung needs what the first two
deliberately avoid — a real login, and custody of other people's credentials
and records — so it comes after them, not instead of them.

```mermaid
flowchart LR
  B[Browser anywhere] -- authenticated HTTPS --> S[Hosted Hallvi]
  S -- SSH --> H[The user's application host]
  S -- encrypted copies --> R[(Recovery storage)]
```

## A caution: running it on the application server

Nothing stops a user placing the installation on the same host as the
application it manages, and it saves a machine. It couples the two failures
the recovery work exists to separate: losing that host loses the application,
Hallvi and the credentials at once, leaving the recovery kit as the only
way back. It also makes reaching Hallvi a public login problem immediately,
and puts a compromised application one hop from the credentials that manage
it. This is a caution to explain to the user, not a rule to enforce.

## Failure cases side by side

| Event | Rung 1: own Mac or PC | Rung 2: user's VM | Rung 3: hosted | On the application server |
| --- | --- | --- | --- | --- |
| User's laptop sleeps | Care pauses; tunnels drop | Unaffected | Unaffected | Unaffected |
| Connection lost mid-command | Unknown outcome; Pi reads the host later | Unknown outcome; Pi reads the host later | Unknown outcome; Pi reads the host later | Local; unaffected |
| Application host lost | App down; Hallvi intact and recovers it | App down; Hallvi intact and recovers it | App down; Hallvi intact and recovers it | App, Hallvi and credentials lost together |
| Machine running Hallvi lost | Rebuild from kit; apps keep serving | Rebuild from kit; apps keep serving | Our incident; apps keep serving | Same host as the app |
| Reaching Hallvi | Same machine, no login | The user's own tunnel | Login we must build | Public login needed at once |
| Reaching a private app | Tunnel ends on the Mac or PC | Tunnel ends on the VM; the user's SSH connection forwards the fixed link ports | Needs a design of its own | Direct on the host |

## Packaging

Rungs 1 and 2 ship the same thing: a background service installed from the
command line for one user, a launchd agent on macOS and a systemd user unit
with lingering on Linux, serving the web interface on loopback. The service
keeps the interface and the worker running as a pair, restarts them after a
crash and survives a reboot, which used to take two terminals.

The packaging direction keeps one small CLI for installing, checking and
reaching Hallvi, with the browser for repositories, account connection and
operations:

- **One verified installer command over a platform archive.** The archive
  holds the built interface, separate worker, schema, Node.js 22 and locked
  production dependencies. Native modules are built in the packaging
  environment, so an end user installs without npm, Python or a compiler.
  Apple-silicon macOS and Ubuntu 24.04 x64 are the first targets; each
  candidate still needs installation evidence on both.
- **A small service CLI, not a second product UI.** `hallvi status` checks the
  interface and worker; `hallvi remote` prints every loopback SSH forward
  needed by a laptop browser. Device-code authorization happens on the laptop
  while Hallvi polls on the machine where it runs.
- **Program and state are separate directories.** Upgrade and uninstall replace
  or remove the program and never touch state.

```mermaid
flowchart LR
  source[Committed Hallvi source] --> build[Build on each target platform]
  build --> release[Platform archive, checksum and installer]
  release --> verify[Verify checksum and native modules]
  verify --> service[User service on loopback]
  service --> local[Browser on the same machine]
  service --> forward[SSH forwards for fixed ports]
  forward --> laptop[Laptop browser]
  service --> state[(Controller and account state)]
```

Homebrew and Linux packages are distribution conveniences after the archive is
proved; neither removes the need to solve trusted downloads, signing and
GitHub App distribution. A container image remains a possible virtual-machine
format. Public network hosting would require Hallvi user authentication.
For self-service beta, the simplest proposed channel is public prebuilt
archives and checksums from a trusted release location while the source
repository stays private. Invited testers can receive the same three files
through a private channel in the meantime, but that remains a manual handoff.
The source repository's privacy does not hide JavaScript shipped in an
archive. No download URL, App visibility change or publication is selected
by this document.

### First-use and return journeys

The actor is the person installing Hallvi. Their first task is complete when
the service and worker answer, their selected repository is readable, ChatGPT
is connected, and the browser returns them to that repository's conversation.
The machine running Hallvi can be a desktop or a headless VPS; the application
host Pi manages is a separate machine in these journeys.

| State | Desktop Mac or Linux PC | Headless Ubuntu VPS and laptop |
| --- | --- | --- |
| I1 — verify | In Terminal: `sh install-hallvi.sh archive.tgz` checks platform and checksum. A mismatch stops before the service changes. | The same command runs over SSH on the VPS. No graphical browser is expected there. |
| I2 — ready | Terminal shows service, interface URL and worker. Open the URL in this computer's browser. | `hallvi remote user@host` prints forwards for interface, browser terminal and private links. On the laptop, `ssh -N hallvi` holds them open, then the browser opens `127.0.0.1:4747`. |
| I3 — repository | Paste a public repository and continue without GitHub login. For a private repository, connect an account and grant the App access to selected repositories. | The same browser states appear on the laptop. The VPS only serves Hallvi and performs provider polling. |
| I4 — model | The browser shows the OpenAI device URL, code, expiry, waiting and Cancel. Success returns to the original application and its draft; cancellation or failure offers retry. | Open the code URL in the laptop browser. No provider callback or extra VPS port is needed. |
| I5 — inspect | Choose **Read repository** to start the original task. Connecting an account alone does not start it. | The browser action reaches the VPS worker through the SSH forward. Pi reaches the separate application host over its managed connection. |

GitHub account sign-in and selected-repository App installation are two
visible steps. The account state says **waiting**, **denied**, **expired**,
**cancelled**, **connected** or **retry**. Once connected, repository access
shows **not granted**, **checking**, **passed** or a concrete failed check.
Cancelling or retrying a replacement sign-in keeps a previously working
connection until a new one succeeds. A public repository can proceed without
either GitHub step. If this release has no distributable App configuration,
private access is shown as unavailable rather than asking each end user to
register an App.

After logout or restart, `hallvi status` shows whether the service and worker
are ready; the browser keeps the saved application and account connection.
If only SSH forwarding is lost, the laptop browser cannot reach Hallvi until
the user reruns `ssh -N hallvi`. The VPS service and its work continue. A
private application link opened through Hallvi may close after a service
restart and must be reopened through Pi. An expired or revoked provider login
returns to its device-code retry while preserving the application and draft.

This split follows two concrete precedents without copying their extra
surface area. [OpenClaw's CLI onboarding](https://github.com/openclaw/openclaw/blob/9f7b308b2dd18f5a27027b70d66205bd46cde961/docs/cli/onboard.md)
detects a headless or SSH session and prints a browser URL and forwarding
instructions. Hallvi prints the complete fixed-port SSH handoff after
installation, then keeps setup in the existing browser UI. The
[OpenAI Codex login in pinned Pi 0.84.4](https://github.com/earendil-works/pi/blob/v0.84.4/packages/ai/src/auth/oauth/openai-codex.ts)
offers device code specifically for headless use, with a browser URL, code,
expiry and polling; Hallvi already selects that method for ChatGPT on both
desktop and VPS. Pi also supports a manual redirect-code fallback for its
different browser callback flow. Hallvi does not need that fallback for
device-code login or another CLI account wizard.

Neither rung needs local Docker. Pi's repository workspace runs directly on
the user's machine by default, in a scratch folder holding the repository copy,
under two hygiene rules that are not a sandbox: anything Pi runs starts from a
minimal environment without Hallvi's tokens, and Pi's file tools refuse paths
outside the folder, which keeps them off Hallvi's configuration and credential
files. Docker is an optional isolated workspace, chosen in Settings →
Workspace, for people deploying software they do not trust. When it is chosen
and unavailable, the workspace tools are withdrawn with a plain reason, never a
silent fallback. Hallvi itself never runs inside that container; a container
image stays a possible packaging format for the virtual machine rung.
[Installing Hallvi](../installation.md#pis-workspace) describes both modes,
and [Architecture](../architecture.md#repository-workspace-architecture) draws
the boundary. Application servers keep their own Docker and Compose
requirement; only the machine running Hallvi dropped it.

A desktop wrapper is worth building only if the Mac rung turns out to need
one.
