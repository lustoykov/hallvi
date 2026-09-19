# Installing Hallvi

Install Hallvi on the Mac or Linux machine where you want it to run. It starts
as a background service, so you can close the terminal and use it in your
browser. On macOS it starts when you log in and pauses during sleep; on Linux
it can start at boot without a login.

You do not need to clone the repository or install Node.js. The installer
supplies its own Node.js runtime. The current package does need compiler tools
and internet access to download Node.js and install dependencies.

[macOS](#macos) · [Linux](#linux) · [First deployment](#your-first-deployment) ·
[Troubleshooting](#troubleshooting) · [Remote access](#on-another-machine) ·
[Upgrade](#upgrade) · [Uninstall](#uninstall)

## Get the package

Hallvi is in private beta. There is no public download yet; obtain
`hallvi-0.1.0.tgz` and its matching `hallvi-0.1.0.tgz.sha256` from the maintainer.
Keep both files in the same directory. The instructions below use version
`0.1.0`; substitute the supplied version if it differs.

Contributors creating a package should use [Build a release archive](#build-a-release-archive).
Installing a supplied archive does not require a source checkout.

## Supported machines

| Platform | Current evidence |
| --- | --- |
| macOS, Apple silicon | Service installation exercised |
| Ubuntu 24.04, x64 | Installation, restart and upgrade rehearsal exercised |
| macOS, Intel | Installer target; beta acceptance not completed |
| glibc Linux with systemd, arm64 / other distributions | Installer targets; beta acceptance not completed |

Alpine/musl Linux and Windows are not supported by this installer. The
[installation evidence](testing/2026-09-17-installation.md) and
[beta rehearsal](testing/2026-09-18-beta-rehearsal.md) identify the tested
revisions; they do not certify a newer archive.

## macOS

1. Install Apple's command line tools if they are not already installed:

   ```bash
   xcode-select --install
   ```

   Finish the installation dialog before continuing. If macOS says the tools
   are already installed, continue.

2. In Terminal, go to the directory containing the archive and checksum. For
   example, if you saved them in Downloads:

   ```bash
   cd ~/Downloads
   shasum -a 256 -c hallvi-0.1.0.tgz.sha256 &&
     tar -xzf hallvi-0.1.0.tgz &&
     ./hallvi-0.1.0/install.sh
   ```

   Verification must report `OK`. The chained commands stop if verification
   fails. Run the installer as your normal logged-in user, without `sudo`.

3. Check the result and open Hallvi:

   ```bash
   ~/.local/bin/hallvi status
   open http://127.0.0.1:4747
   ```

The installer downloads Node.js and compiles native dependencies; let it finish.
Hallvi starts automatically on a new installation. It runs as your login's
background service, not before login or while the Mac is asleep.

## Linux

These commands are for Ubuntu or Debian with systemd. Use an ordinary user
account; `sudo` is only for installing system prerequisites.

1. Install the prerequisites:

   ```bash
   sudo apt-get update
   sudo apt-get install -y build-essential python3 curl openssh-client
   ```

   Other glibc distributions need equivalent compiler, `make`, Python 3,
   `curl`, `tar` and SSH tools, plus a working systemd user session.

2. From the directory containing the archive and checksum, run:

   ```bash
   sha256sum -c hallvi-0.1.0.tgz.sha256 &&
     tar -xzf hallvi-0.1.0.tgz &&
     ./hallvi-0.1.0/install.sh
   ```

   Verification must report `OK`. The chained commands stop if verification
   fails. Do not run `install.sh` with `sudo`.

3. Check the service:

   ```bash
   ~/.local/bin/hallvi status
   ```

   Open <http://127.0.0.1:4747> in a browser on that machine. If you installed
   over SSH, follow [remote access](#on-another-machine) to use your laptop's
   browser. If status says boot without login needs an extra command, run the
   `sudo loginctl enable-linger ...` command it prints.

## Your first deployment

1. Start your local Docker Engine before choosing **Read repository**. The
   current repository inspection and packaging tools still require it.
   Running the workspace directly on your machine, with Docker optional, is
   [decided but not implemented](design/always-on-concept.md#packaging).
2. Open Hallvi and add the public GitHub repository you want to deploy.
3. Connect ChatGPT when prompted, then choose **Read repository**. A public
   repository does not need GitHub login. Private repositories require the
   separate [GitHub App configuration](integrations/github.md).
4. Let Hallvi explain the application requirements, then connect Hetzner or
   an existing supported Linux application server through the interface.
   Read the [beta precautions](../README.md#beta-safety) before connecting it.
5. Ask Hallvi to deploy the app and open the application link it provides.

Installing Hallvi on your Mac does not make that Mac the Linux deployment
server. Likewise, the local Docker workspace and Docker/Compose on the
application server serve different purposes.

## Troubleshooting

| What happened | What to do |
| --- | --- |
| Checksum fails or the checksum file is missing | Stop and obtain the matching archive and checksum together. Do not skip verification. |
| Installer reports missing compiler tools | Finish the macOS command line tools installation, or install the Linux prerequisites above, then rerun `install.sh`. |
| `hallvi: command not found` | Use `~/.local/bin/hallvi` instead. Optionally add `export PATH="$HOME/.local/bin:$PATH"` to your shell startup file. |
| Browser cannot open Hallvi | Run `~/.local/bin/hallvi status`, then `~/.local/bin/hallvi logs`. If it is stopped, run `~/.local/bin/hallvi start`. Use the address status prints. |
| Installed on another computer, but the laptop cannot connect | `127.0.0.1` refers to the computer running your browser. Follow [remote access](#on-another-machine). |
| Repository inspection says Docker is unavailable | Start the local Docker Engine and retry. Direct execution is not available in the current package. |
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

Optional settings go in `~/.local/share/hallvi/hallvi.env`, one
`NAME=value` per line, read at every start: `HALLVI_PORT` to move the
interface, and the GitHub App values from [GitHub setup](integrations/github.md)
for private repositories. Public repositories need no login.

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

## On another machine

<a id="on-a-virtual-machine"></a>

For a Mac mini, install while logged in to its desktop using the macOS steps.
You can use Hallvi directly in that Mac's browser. To use your laptop's browser,
follow the forwarding instructions below; the Mac must remain awake and allow
SSH connections.

For a Linux virtual machine, use the Linux steps over SSH. In the instructions
below, replace `you@vm.example.com` with your username and the address of the
machine running Hallvi.

Hallvi listens on the machine's loopback only. It has no login, so it must never be
bound to a public address; use SSH forwarding for remote browser access.

Forwarding the interface alone is not enough. Pages also name two other kinds
of loopback port: the browser terminal's, and the port of every private
application link (`http://127.0.0.1:<port>`), which end on the machine running Hallvi.
An installation therefore fixes all of them, and you forward them together, each
to the same number:

| Port | What |
| --- | --- |
| 4747 | Interface |
| 4748 | Browser terminal |
| 4757–4766 | Private application links, one per open link |

On the machine running Hallvi, print the configuration for your laptop:

```bash
~/.local/bin/hallvi remote you@vm.example.com
```

Paste the `Host hallvi` block it prints into `~/.ssh/config` on the laptop,
then run the command below. Every local forward explicitly binds the laptop's `127.0.0.1`, even when
the laptop's SSH defaults allow forwarded ports on other interfaces:

```bash
ssh -N hallvi
```

Keep that running while you use Hallvi, and open
<http://127.0.0.1:4747> on the laptop. A private application link Pi opens, for
example `http://127.0.0.1:4757`, now works in the laptop's browser as it is
written. Connecting ChatGPT and GitHub uses device codes, so both work through
the same connection with nothing further to forward.

If one of those ports is already used on the laptop, `ssh` refuses to start and
names it. Free the port, or move the whole installation with `HALLVI_PORT`
on the machine running Hallvi: every other port is derived from it.

Keeping that machine updated, and its SSH access protected, is yours to
do. Prefer a machine other than the one your applications run on; the concept
note explains why.

## Upgrade

Build or obtain the new archive and run its `install.sh`. It prepares the new
program completely — download, dependencies, native compiles — while the old
one keeps serving, checks that the new version can open the existing database,
then stops the service, swaps the program and returns the service to the state
it found: running if it was running, stopped if you had stopped it. A failed
check or stop leaves the old installation as it was. State is not touched.

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
cd dist
shasum -a 256 hallvi-0.1.0.tgz > hallvi-0.1.0.tgz.sha256
```

On Linux, use `sha256sum` instead of `shasum -a 256`. Substitute the package
version if it differs. Distribute the archive and checksum together, with the
source revision and the verification performed on that candidate. The
[beta walkthrough](beta-walkthrough.md) defines the fresh-user acceptance check.

The archive contains the built interface, Pi worker, schema, lockfile and
installer. The same archive targets every supported platform; dependencies
are installed on the recipient's machine. The installer downloads Node.js 24
from nodejs.org, verifies its published checksum and keeps it inside the
program directory. Users still need the compiler prerequisites above, but not Node.js 22 or
a source checkout.

Development remains separate: `npm run dev` in a checkout, described in the
[README](../README.md#development). An installation and a development checkout
do not share a database by default.

## Limits today

- No download link or signed release; the package is built from a checkout.
- The service has been exercised on Apple-silicon macOS and Ubuntu 24.04 x64.
  macOS Intel, Linux arm64 and other Linux distributions are installation
  targets, not completed beta acceptance checks. See the
  [dated installation evidence](testing/2026-09-17-installation.md) and the
  [current rehearsal](testing/2026-09-18-beta-rehearsal.md).
- Native dependencies can compile during installation, so a compiler is required.
- No schema migrations between versions (see Upgrade).
- Pi's repository workspace still needs Docker. Running it directly on the
  machine is decided in the concept note and is a separate change.
- Private application links close when the service restarts or the machine
  reboots. The Overview shows the link as closed; ask Pi to open it again.
- One installation per user account.
- A laptop that runs its own installation and also forwards one from a virtual
  machine needs them on different ports: set `HALLVI_PORT` on one of them.
- macOS keeps one service log, `~/.local/share/hallvi/logs/service.log`,
  rotated only when it passes 10 MB at a `hallvi start`.
