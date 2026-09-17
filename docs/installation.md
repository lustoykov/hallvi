# Installing Server Guy

Server Guy installs as a background service for one user on macOS or Linux.
It keeps running without a terminal, restarts after a crash, and starts again
with the machine. The same package runs on your own computer and on a virtual
machine you provide; the [always-on concept](design/always-on-concept.md)
explains when each makes sense.

Development is separate: `npm run dev` in a checkout, described in
[Development resources](development-resources.md). An installation and a
checkout do not share a database.

## What you need

- macOS (Apple silicon or Intel) or a Linux with systemd (x64 or arm64).
- A C/C++ compiler, `make` and `python3`, because two dependencies compile on
  installation. On macOS: `xcode-select --install`. On Debian or Ubuntu:
  `sudo apt-get install -y build-essential python3 curl openssh-client`.
- `ssh`, which Server Guy uses to reach application servers.
- Docker, only for Pi's repository workspace: reading and building a
  repository. Conversations, server work and every page work without it, and
  Pi says so when the workspace is unavailable.

Node.js is not needed. The installer downloads Node.js 24 from nodejs.org,
checks it against the published checksum and keeps it inside the program
directory, so the service does not depend on a shell's version manager.

## Build the package

The repository is private, so there is no download link yet. From a checkout:

```bash
npm ci
npm run package
```

This writes `dist/server-guy-<version>.tgz`: the built interface, the Pi worker
as plain JavaScript, the database schema, the lockfile and `install.sh`. The
archive is the same for every platform; dependencies are installed on the
machine that runs them.

## Install

```bash
tar -xzf server-guy-0.1.0.tgz
./server-guy-0.1.0/install.sh
```

Nothing needs root. The first installation starts the service and prints its
status. Open <http://127.0.0.1:4747>.

| What | Where | On upgrade or uninstall |
| --- | --- | --- |
| Program, its Node.js and dependencies | `~/.local/lib/server-guy` | Replaced / removed |
| The `server-guy` command | `~/.local/bin/server-guy` | Replaced / removed |
| Database, credentials, SSH keys, conversations, logs | `~/.local/share/server-guy` | Kept |
| Model account (ChatGPT connection) | `~/.config/server-guy/pi` | Kept |
| Service definition | `~/Library/LaunchAgents/com.server-guy.plist` or `~/.config/systemd/user/server-guy.service` | Rewritten by `start` |

Optional settings go in `~/.local/share/server-guy/server-guy.env`, one
`NAME=value` per line, read at every start: `SERVER_GUY_PORT` to move the
interface, and the GitHub App values from [GitHub setup](integrations/github.md)
for private repositories. Public repositories need no login.

## The service

```bash
server-guy start      # run now, and whenever this machine starts
server-guy stop       # stop, and stay stopped until the next start
server-guy restart
server-guy status     # service, interface and Pi worker
server-guy logs -f
```

`start` and `stop` are the only two states. There is no state in which Server
Guy is stopped now and comes back by itself later.

- **macOS** runs it as a launchd agent. It starts when you log in, which on a
  personal Mac is when the machine is usable at all. It pauses while the Mac
  sleeps and continues on wake.
- **Linux** runs it as a systemd user unit and turns on lingering for your
  user, so it starts at boot without anyone logging in and survives the end of
  your SSH session. If lingering could not be enabled without root, `status`
  says so and prints the one command that needs `sudo`.

If the interface or the worker stops unexpectedly, the service exits and the
service manager starts both again within a few seconds. A conversation that was
being answered at that moment shows as interrupted and can be retried.

## On a virtual machine

Install exactly as above, as an ordinary user on the machine. Server Guy still
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
server-guy remote you@vm.example.com
```

Paste the `Host server-guy` block it prints into `~/.ssh/config` on the laptop,
then:

```bash
ssh -N server-guy
```

Keep that running while you use Server Guy, and open
<http://127.0.0.1:4747> on the laptop. A private application link Pi opens, for
example `http://127.0.0.1:4757`, now works in the laptop's browser as it is
written. Connecting ChatGPT and GitHub uses device codes, so both work through
the same connection with nothing further to forward.

If one of those ports is already used on the laptop, `ssh` refuses to start and
names it. Free the port, or move the whole installation with `SERVER_GUY_PORT`
on the virtual machine: every other port is derived from it.

Keeping the virtual machine updated, and its SSH access protected, is yours to
do. Prefer a machine other than the one your applications run on; the concept
note explains why.

## Upgrade

Build or obtain the new archive and run its `install.sh`. It stops the service,
replaces the program, and returns the service to the state it found. State is
not touched.

A new version that changes the database schema refuses to start on an older
database, says which versions are involved and changes nothing. Until schema
migrations exist, the choices are to reinstall the version that wrote the
database or to move the database aside and start fresh.

## Uninstall

```bash
server-guy uninstall
```

This stops the service and removes the program, the command and the service
definition. It keeps `~/.local/share/server-guy` and `~/.config/server-guy`
and prints both paths. Installing again picks everything up where it was. To
discard the state as well, delete those two directories yourself.

## Limits today

- No download link or signed release; the package is built from a checkout.
- Two dependencies compile during installation, so a compiler is required.
- No schema migrations between versions (see Upgrade).
- Pi's repository workspace still needs Docker. Running it directly on the
  machine is decided in the concept note and is a separate change.
- Private application links close when the service restarts or the machine
  reboots. The Overview shows the link as closed; ask Pi to open it again.
- One installation per user account.
