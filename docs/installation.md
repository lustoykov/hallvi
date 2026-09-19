# Installing Hallvi

Hallvi installs as a background service for one user on macOS or Linux.
It keeps running without a terminal, restarts after a crash, and starts again
with the machine. The same package runs on your own computer and on a virtual
machine you provide; the [always-on concept](design/always-on-concept.md)
explains when each makes sense.

Development is separate: `npm run dev` in a checkout, described in
[Development resources](development-resources.md). An installation and a
checkout do not share a database.

## What you need

- macOS (Apple silicon or Intel) or a glibc Linux with systemd (x64 or
  arm64). Alpine and other musl systems are not supported.
- A C/C++ compiler, `make` and `python3`, because two dependencies compile on
  installation. On macOS: `xcode-select --install`. On Debian or Ubuntu:
  `sudo apt-get install -y build-essential python3 curl openssh-client`.
- `ssh`, which Hallvi uses to reach application servers.

Docker is not needed on this machine. Pi reads and packages your repository
in a scratch folder here; [Pi's workspace](#pis-workspace) describes that and
the optional Docker isolation. Application servers are different: they run your
application with Docker Compose, and Pi installs it there when it is missing.

Node.js is not needed. The installer downloads Node.js 24 from nodejs.org,
checks it against the published checksum and keeps it inside the program
directory, so the service does not depend on a shell's version manager.

## Build the package

The repository is private, so there is no public download link yet. Building
requires Node.js 22; the installed service uses its own Node.js 24. From a checkout:

```bash
npm ci
npm run package
```

This writes `dist/hallvi-<version>.tgz`: the built interface, the Pi worker
as plain JavaScript, the database schema, the lockfile and `install.sh`. The
archive is the same for every platform; dependencies are installed on the
machine that runs them.

For a beta handoff, include the archive's SHA-256 checksum and source revision.
Verify the checksum before extracting it (`shasum -a 256` on macOS or
`sha256sum` on Linux). After installation, `hallvi status` prints the installed revision and service status. The [beta walkthrough](beta-walkthrough.md) describes the
fresh-user acceptance check.

## Install

```bash
tar -xzf hallvi-0.1.0.tgz
./hallvi-0.1.0/install.sh
```

Nothing needs root. A new installation starts the service and prints its
status. Open <http://127.0.0.1:4747>.

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

```bash
hallvi start      # run now, and whenever this machine starts
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

## On a virtual machine

Install exactly as above, as an ordinary user on the machine. Hallvi still
listens on the machine's loopback only. It has no login, so it must never be
bound to a public address; an SSH connection you open is the only way in.

Forwarding the interface alone is not enough. Pages also name two other kinds
of loopback port: the browser terminal's, and the port of every private
application link (`http://127.0.0.1:<port>`), which end on the virtual machine.
An installation therefore fixes all of them, and you forward them together, each
to the same number:

| Port | What |
| --- | --- |
| 4747 | Interface |
| 4748 | Browser terminal |
| 4757–4766 | Private application links, one per open link |

On the virtual machine, print the configuration for your laptop:

```bash
hallvi remote you@vm.example.com
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
on the virtual machine: every other port is derived from it.

Keeping the virtual machine updated, and its SSH access protected, is yours to
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

## Limits today

- No download link or signed release; the package is built from a checkout.
- The service has been exercised on Apple-silicon macOS and Ubuntu 24.04 x64.
  macOS Intel, Linux arm64 and other Linux distributions are installation
  targets, not completed beta acceptance checks. See the
  [dated installation evidence](testing/2026-09-17-installation.md) and the
  [current rehearsal](testing/2026-09-18-beta-rehearsal.md).
- Two dependencies compile during installation, so a compiler is required.
- No schema migrations between versions (see Upgrade).
- On this computer, Pi's workspace is a precaution rather than isolation; see
  [Pi's workspace](#pis-workspace). A first search there may download `rg`
  or `fd` into the temporary directory when neither is installed.
- Private application links close when the service restarts or the machine
  reboots. The Overview shows the link as closed; ask Pi to open it again.
- One installation per user account.
- A laptop that runs its own installation and also forwards one from a virtual
  machine needs them on different ports: set `HALLVI_PORT` on one of them.
- macOS keeps one service log, `~/.local/share/hallvi/logs/service.log`,
  rotated only when it passes 10 MB at a `hallvi start`.
