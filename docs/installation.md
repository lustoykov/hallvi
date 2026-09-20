# Installing Hallvi

Install Hallvi on the Mac or Linux machine where you want it to run. It starts
as a background service, so you can close the terminal and use it in your
browser. On macOS it starts when you log in and pauses during sleep; on Linux
it can start at boot without a login.

You do not need to clone the repository or install Node.js, npm, Python or a
compiler. Each release archive includes Node.js 22 and dependencies built for
its named platform. The installer checks the archive against its matching
SHA-256 file before changing the installed program.

[macOS](#macos) · [Linux](#linux) · [First deployment](#your-first-deployment) ·
[Troubleshooting](#troubleshooting) · [Remote access](#on-another-machine) ·
[Upgrade](#upgrade) · [Uninstall](#uninstall)

## Get the package

Hallvi is in private beta. There is no public download yet. Obtain these three
files from the maintainer, keeping them in the same directory:

- `install-hallvi.sh`
- `hallvi-0.1.0-darwin-arm64.tgz` **or** `hallvi-0.1.0-linux-x64.tgz`
- the matching `.tgz.sha256` file

The names above use version `0.1.0`; substitute the supplied version if it
differs. Use the Mac archive on Apple silicon and the Linux archive on Ubuntu
24.04 x64. The installer rejects a mismatched platform or checksum. Obtain the
checksum through the same trusted release channel as the archive; a checksum
does not authenticate an untrusted distributor.

Contributors creating a package should use [Build a release archive](#build-a-release-archive).
Installing a supplied archive does not require a source checkout.

## Supported machines

| Platform | Current evidence |
| --- | --- |
| macOS, Apple silicon | [19 September integrated candidate](testing/2026-09-19-integrated-prebuilt-installation.md) installed; the earlier archive also passed a same-schema upgrade |
| Ubuntu 24.04, x64 | [19 September integrated candidate](testing/2026-09-19-integrated-prebuilt-installation.md) installed, reinstalled and survived reboot |
| macOS, Intel; other Linux architectures/distributions | No prebuilt release target yet |

Alpine/musl Linux and Windows are not supported. The
[earlier installation evidence](testing/2026-09-17-installation.md) and
[beta rehearsal](testing/2026-09-18-beta-rehearsal.md) used the former
source-plus-compile archive and do not certify a new prebuilt archive.

## macOS

1. In Terminal, go to the directory containing the supplied files and run:

   ```bash
   cd ~/Downloads
   sh ./install-hallvi.sh ./hallvi-0.1.0-darwin-arm64.tgz
   ```

   Run as your normal logged-in user, without `sudo`. The installer verifies
   the matching `.sha256` file and reports service, interface and worker
   readiness.

2. Open Hallvi:

   ```bash
   open http://127.0.0.1:4747
   ```

Hallvi starts automatically on a new installation. It runs as your login's
background service, not before login or while the Mac is asleep.

## Linux

These commands are for Ubuntu 24.04 x64 with a systemd user session. Use an
ordinary user account over SSH or at the machine.

1. From the directory containing the supplied files, run:

   ```bash
   sh ./install-hallvi.sh ./hallvi-0.1.0-linux-x64.tgz
   ```

   Run without `sudo`. The installer verifies the archive, installs the user
   service and checks both the interface and worker.

2. The installer asks where you will use Hallvi. Over SSH it suggests
   **From another computer**, and then prints the two commands to run on the
   laptop. `~/.local/bin/hallvi remote` prints them again at any time.

   A headless VPS needs no desktop browser. Open Hallvi in the laptop browser
   after starting the printed SSH connection. If status says boot without
   login needs an extra command, run the `sudo loginctl enable-linger ...`
   command it prints.

## Your first deployment

1. Choose where Pi works in **Settings → Workspace**. **On this computer**
   is the default and needs no Docker. If you choose **In Docker**, start your
   local Docker Engine before choosing **Read repository**. See
   [Pi’s workspace](#pis-workspace) for the access each mode permits.
2. Open Hallvi and add the public GitHub repository you want to deploy.
3. Connect ChatGPT when prompted, then choose **Read repository**. A public
   repository does not need GitHub login. Private repositories require the
   separate [GitHub App configuration](integrations/github.md).
4. Let Hallvi explain the application requirements, then connect Hetzner or
   an existing supported Linux application server through the interface.
   Read the [beta precautions](../README.md#beta-safety) before connecting it.
5. Ask Hallvi to deploy the app and open the application link it provides.

Installing Hallvi on your Mac does not make that Mac the Linux deployment
server. The optional local Docker workspace and Docker/Compose on the application
server serve different purposes. Pi installs Docker/Compose on the application
server when needed.

## Troubleshooting

| What happened | What to do |
| --- | --- |
| Checksum fails or the checksum file is missing | Stop and obtain the matching archive and checksum together. Do not skip verification. |
| Installer rejects the platform | Use the archive for Apple-silicon macOS or Ubuntu 24.04 x64. Other platforms have no prebuilt release yet. |
| Prebuilt dependency cannot load | Keep the current installation. Report the archive name, OS version and `hallvi status` output to the maintainer. |
| `hallvi: command not found` | Use `~/.local/bin/hallvi` instead. Optionally add `export PATH="$HOME/.local/bin:$PATH"` to your shell startup file. |
| Browser cannot open Hallvi | Run `~/.local/bin/hallvi status`, then `~/.local/bin/hallvi logs`. If it is stopped, run `~/.local/bin/hallvi start`. Use the address status prints. |
| Installed on another computer, but the laptop cannot connect | `127.0.0.1` refers to the computer running your browser. Follow [remote access](#on-another-machine). |
| Repository inspection says Docker is unavailable | Start the local Docker Engine and retry, or choose **On this computer** in **Settings → Workspace**. Hallvi never switches modes automatically. |
| Linux service does not survive logout or start at boot | Check `~/.local/bin/hallvi status` and follow its lingering instruction. |
| Linux reports that it cannot connect to the user service manager | Run from a normal login session for the installing user on a systemd machine, rather than through `sudo`. |
| Upgrade reports a schema mismatch | Keep the installed version and follow [Upgrade](#upgrade). Do not delete the database to bypass the check. |

When reporting a problem, include the installed revision from
`~/.local/bin/hallvi status`, your OS and the relevant error. Remove credentials
and private data from any logs you share.

## Files and configuration

| What | Where | On upgrade or uninstall |
| --- | --- | --- |
| Program, its Node.js and dependencies | `~/.local/lib/hallvi` | Replaced / removed |
| The `hallvi` command | `~/.local/bin/hallvi` | Replaced / removed |
| Database, credentials, SSH keys, conversations, logs | `~/.local/share/hallvi` | Kept |
| Model account (ChatGPT connection) | `~/.config/hallvi/pi` | Kept |
| Service definition | `~/Library/LaunchAgents/com.hallvi.plist` or `~/.config/systemd/user/hallvi.service` | Rewritten by `start` |

There is one service per user account, whatever `HOME` or `HALLVI_DATA_DIR`
say. `start`, `stop`, `restart` and `uninstall` refuse, changing nothing, when
the loaded service runs from a different program directory than the command.

Optional settings go in `~/.local/share/hallvi/hallvi.env`, one
`NAME=value` per line, read at every start: `HALLVI_PORT` to move the
interface. A release with a configured GitHub App can connect private
repositories; see [GitHub setup](integrations/github.md). Public repositories
need no login.

## The service

The examples below use `hallvi`. If it is not on your PATH, use
`~/.local/bin/hallvi` instead.

```bash
hallvi start      # run now; macOS login / Linux boot with lingering
hallvi stop       # stop, and stay stopped until the next start
hallvi restart
hallvi status     # service, interface and Pi worker
hallvi logs -f
```

`start` and `stop` are the only two states. There is no state in which Hallvi
is stopped now and comes back by itself later.

- **macOS** runs it as a launchd agent. It starts when you log in, which on a
  personal Mac is when the machine is usable at all. It pauses while the Mac
  sleeps and continues on wake.
- **Linux** runs it as a systemd user unit and turns on lingering for your
  user, so it starts at boot without anyone logging in and survives the end of
  your SSH session. If lingering could not be enabled without root, the
  status of a running service says so and prints the one command that needs
  `sudo`.

If the interface or the worker stops unexpectedly, the service shuts down the
other process and the service manager starts both again. Active browser
connections can delay the interface's shutdown, so recovery may take tens of
seconds. A conversation that was
being answered at that moment shows as interrupted and can be retried.

## Pi's workspace

Pi works on a copy of your repository: it reads the source, writes packaging
such as a Dockerfile or Compose file, and runs checks. Settings → Workspace
decides where.

**On this computer** is the default. Each conversation turn gets a scratch
folder in the system's temporary directory holding the repository copy, and
Pi's commands run there as your user account, with its network and the tools
you have installed. Two precautions apply, and neither is a sandbox:

- Commands start with a minimal environment (`PATH`, `HOME`, locale and a
  few like them). The tokens, GitHub credentials and `HALLVI_*` settings the
  service was started with are not passed on.
- Pi's file tools (read, write, edit, search, list) refuse any path outside the
  folder, including through a link, so they cannot open Hallvi's database,
  configuration or credential files.

A shell command is not limited that way. It can read and change whatever your
account can, including Hallvi's state directory and your SSH keys. Pi is told to
stay inside the folder; nothing enforces it. Prefer this mode for software you
trust.

**In Docker** runs the same tools in a container with no network, a read-only
system and none of your files or credentials. It needs a running local Docker
Engine (Docker Desktop, OrbStack, Colima or the Docker service); the first use
builds the workspace image, which needs network access. If Docker is chosen and
not running, Pi's workspace tools are withdrawn for that turn and Pi says why.
Hallvi never runs the workspace on this computer instead. Start Docker or
change the setting; the Workspace page shows whether Docker answers.

The folder or container is removed when the turn ends. A copy of its files, up
to 64 MB, stays with the run's journal under the state directory.

## On another machine

<a id="on-a-virtual-machine"></a>

A new installation asks where you will use Hallvi: on this computer, or from
another one. It cannot work that out: a Mac mini has a desktop and is still
used from a laptop. Being signed in over SSH, or having no display, only chooses
which answer Enter gives; `HALLVI_USE=here` or `HALLVI_USE=remote` answers for
a scripted installation. The Mac must remain awake and allow SSH connections.

Hallvi listens on the machine's loopback only. It has no login, so it must never be
bound to a public address; use SSH forwarding for remote browser access.

Forwarding the interface alone is not enough. Pages also name two other kinds
of loopback port: the browser terminal's, and the port of every private
application link (`http://127.0.0.1:<port>`), which end on the machine running Hallvi.
An installation therefore fixes all of them, and you forward them together, each
to the same number. An installation used from another computer starts on 5747
rather than 4747, so it cannot meet a Hallvi on the laptop, and its address
differs from a local one:

| Used here | Used from another computer | What |
| --- | --- | --- |
| 4747 | 5747 | Interface |
| 4748 | 5748 | Browser terminal |
| 4757–4766 | 5757–5766 | Private application links, one per open link |

The installer ends by printing two commands for the laptop, with this
machine's user and the address you reached it on already filled in.
`~/.local/bin/hallvi remote` prints them again; give it `you@address` to name
a different address.

```bash
# once: writes the SSH settings to their own file, leaving ~/.ssh/config alone
ssh you@mac-mini.local '~/.local/bin/hallvi remote --config you@mac-mini.local' > ~/.ssh/hallvi-mac-mini

# now, and whenever the connection drops
ssh -F ~/.ssh/hallvi-mac-mini -N mac-mini
```

The second command stays open and says nothing while it is connected. Every
forward explicitly binds the laptop's `127.0.0.1`, even when its SSH defaults
allow forwarded ports on other interfaces. Open the address the installer
printed, for example <http://127.0.0.1:5747>. The tab title and the line beside
the product name say which machine you have reached. A private application
link Pi opens, for example `http://127.0.0.1:5757`, works in the laptop's
browser as it is written. Connecting ChatGPT and GitHub uses device codes, so
both work through the same connection with nothing further to forward. If the
SSH session drops, run the second command again; the Hallvi service, saved
account connections and conversation remain on the other machine. A private
application link may need Pi to reopen it after a service restart.

If one of those ports is already used on the laptop, `ssh` refuses the whole
connection and names it, so no page half-works. Leave whatever has the port
running and move this installation instead, on the machine running Hallvi:

```bash
~/.local/bin/hallvi port 6747
```

Every other port follows it, the service restarts, and applications and
history are unchanged. Then run both laptop commands again; the first simply
replaces its file.

Keeping that machine updated, and its SSH access protected, is yours to
do. Prefer a machine other than the one your applications run on; the concept
note explains why.

## Upgrade

Obtain the new platform archive and checksum, then run `install-hallvi.sh`
against it. Verification, unpacking, native-module loading and the database
compatibility check happen while the old service keeps serving. The installer
then stops the service, swaps the program and returns the service to the state
it found: running if it was running, stopped if you had stopped it. A failed
check or stop leaves the old installation in place; if the replacement fails
to start, the installer restores the previous program. State is not touched.

A new version that changes the database schema is refused before the installed
program is replaced. It says which versions are involved and changes nothing.
If a managed service encounters an incompatible database later, it stops after
reporting the mismatch instead of restarting indefinitely. Until schema
migrations exist, the choices are to keep or reinstall the version that wrote
the database, or to move the database aside and start fresh.

## Uninstall

```bash
hallvi uninstall
```

This stops the service and removes the program, the command and the service
definition. It keeps `~/.local/share/hallvi` and `~/.config/hallvi`
and prints both paths. Installing again picks everything up where it was. To
discard the state as well, delete those two directories yourself.

## Build a release archive

This section is for contributors preparing an archive for someone else. From
an authorized source checkout using Node.js 22 and locked dependencies:

```bash
npm ci
npm run package
```

Run `npm run package` once on Apple-silicon macOS and once on Ubuntu 24.04
x64. It downloads pinned Node.js 22 from nodejs.org, checks its published
SHA-256 value, builds the app and installs locked production dependencies on
that platform. It verifies the native modules load, then writes
`dist/hallvi-0.1.0-<platform>.tgz`, its `.sha256`, and
`dist/install-hallvi.sh`. Distribute the three files together with the source
revision and verification performed on that candidate. The
[beta walkthrough](beta-walkthrough.md) defines the fresh-user acceptance
check. Packaging does not publish a release.

When packaging from a source copy without `.git`, set
`HALLVI_SOURCE_REVISION` to the full commit SHA that copy came from. The
archive records it in `dist/release.json`.

The archive contains the built interface, separate Pi worker, schema, Node.js
22 and production dependencies. The recipient does not run `npm ci` or compile
native modules. Native code is tied to its operating system, architecture,
Node ABI and Linux C library; build and verify each advertised target.

Development remains separate: `npm run dev` in a checkout, described in the
[README](../README.md#development). An installation and a development checkout
do not share a database by default.

## Limits today

- No download link or signed release; the package is built from a checkout.
  Public binaries with private source versus invited testers with repository
  access remains an owner decision. Shipped JavaScript can be inspected even
  when the source repository is private.
- The [19 September integrated candidate](testing/2026-09-19-integrated-prebuilt-installation.md)
  was installed on Apple-silicon macOS and Ubuntu 24.04 x64. A fresh ChatGPT
  connection on the installed Ubuntu controller drove real public-repository
  inspection and private deployment to a separate test host. External-user
  acceptance remains open; each later archive needs its own trial.
- macOS Intel, Linux arm64 and other Linux distributions have no prebuilt
  release target yet.
- No schema migrations between versions (see Upgrade).
- On this computer, Pi's workspace is a precaution rather than isolation; see
  [Pi's workspace](#pis-workspace). A first search there may download `rg`
  or `fd` into the temporary directory when neither is installed.
- Private application links close when the service restarts or the machine
  reboots. The Overview shows the link as closed; ask Pi to open it again.
- One installation per user account.
- A laptop that forwards two remote installations needs them on different
  ports: `hallvi port` on one of them.
- macOS keeps one service log, `~/.local/share/hallvi/logs/service.log`,
  rotated only when it passes 10 MB at a `hallvi start`.
