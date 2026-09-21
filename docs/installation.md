# Installing Hallvi

Install Hallvi on the Mac or Linux machine where you want it to run. It starts
as a background service, so you can close the terminal and use it in your
browser. On macOS it starts when you log in and pauses during sleep; on Linux
it can start at boot without a login.

You do not need to clone the repository or install Node.js, npm, Python or a
compiler. Each release archive includes Node.js 22 and dependencies built for
its named platform. The installer checks the archive against its matching
SHA-256 file before changing the installed program.

[Download](#download) · [macOS](#macos) · [Linux](#linux) ·
[First deployment](#your-first-deployment) · [Troubleshooting](#troubleshooting) ·
[Remote access](#on-another-machine) · [Update](#update) · [Uninstall](#uninstall)

## Download

**There is no published release yet.** The script below can discover and
install Hallvi only after the first signed release is published. Until then,
use a maintainer-supplied archive, checksum and installer as described in
[Installing an exact archive](#installing-an-exact-archive). You do not need a
source checkout for either path.

Once a signed release is published, take one file from
[github.com/lustoykov/hallvi/releases](https://github.com/lustoykov/hallvi/releases)
— `install-hallvi.sh` — and run it:

```bash
sh install-hallvi.sh
```

It works out whether this is an Apple-silicon Mac or an Ubuntu 24.04 x64
machine, finds the newest published alpha release, and downloads that
release's signed manifest and the archive for this platform. Run it as your
normal logged-in user, without `sudo`.

### What is actually checked

The archive's SHA-256 **and its size come from `hallvi-release.json`, which is
signed** — not from a checksum file sitting beside the archive, which whoever
served the archive would also have served. The signature is checked against a
key written into `install-hallvi.sh` itself, which you downloaded separately.

Checking an Ed25519 signature needs a tool that can. Ubuntu 24.04 ships
OpenSSL 3, so there the signature is checked **before anything is unpacked**.
Stock macOS ships LibreSSL, which cannot load an Ed25519 key at all; there the
same check runs after unpacking, using the Node.js inside the archive. The
script says which of the two happened. The second is weaker and worth naming
plainly: an archive that lied could also lie about its own verification.

Underneath both, a first installation is a person fetching files from
github.com over HTTPS, and that connection is the root of it. Updates are
different — an installed Hallvi verifies those against the key it ships; see
[Update](#update) and [the trust boundary](releases.md#what-trusts-what).

### Installing an exact archive

Give the script an archive instead, for an offline machine or a specific
build. It keeps the old behaviour: the archive next to its `.tgz.sha256`,
checked against it.

```bash
sh install-hallvi.sh ./hallvi-0.1.0-darwin-arm64.tgz
```

That checksum catches a damaged download and nothing more, because it came
from wherever the archive came from.

Hallvi is in alpha, and **the first alpha release has not been published yet**.
Until it is, obtain an archive from the maintainer and use the form above.
[Publishing a release](releases.md) is the maintainer's side.

Installing does not need a source checkout, Node.js, npm, Python or a compiler.

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

1. In Terminal, go to the directory you downloaded into and run:

   ```bash
   cd ~/Downloads
   sh ./install-hallvi.sh
   ```

   Run as your normal logged-in user, without `sudo`. This command requires a
   published release. Before the first release, put the three matching files
   from [Installing an exact archive](#installing-an-exact-archive) in this
   directory and pass the archive to the script instead. The installer reports
   service, interface and worker readiness.

2. Open Hallvi:

   ```bash
   open http://127.0.0.1:4747
   ```

Hallvi starts automatically on a new installation. It runs as your login's
background service, not before login or while the Mac is asleep.

## Linux

These commands are for Ubuntu 24.04 x64 with a systemd user session. Use an
ordinary user account over SSH or at the machine.

1. From the directory you downloaded into, run:

   ```bash
   sh ./install-hallvi.sh
   ```

   Run without `sudo`. On Ubuntu the signed manifest is checked before
   anything is unpacked. The installer then installs the user service and
   checks both the interface and worker.

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
| The archive does not match the signed manifest | Stop. Nothing was installed. Run it again — a damaged download is the common cause — and if it persists, say so rather than working around it. |
| `no published release carries a signed manifest yet` | No alpha release exists to find. Install a specific archive instead: `sh install-hallvi.sh ./hallvi-<version>-<platform>.tgz`. |
| Installer rejects the platform | Use the archive for Apple-silicon macOS or Ubuntu 24.04 x64. Other platforms have no prebuilt release yet. |
| Prebuilt dependency cannot load | Keep the current installation. Report the archive name, OS version and `hallvi status` output to the maintainer. |
| `hallvi: command not found` | Use `~/.local/bin/hallvi` instead. Optionally add `export PATH="$HOME/.local/bin:$PATH"` to your shell startup file. |
| Browser cannot open Hallvi | Run `~/.local/bin/hallvi status`, then `~/.local/bin/hallvi logs`. If it is stopped, run `~/.local/bin/hallvi start`. Use the address status prints. |
| Installed on another computer, but the laptop cannot connect | `127.0.0.1` refers to the computer running your browser. Follow [remote access](#on-another-machine). |
| Repository inspection says Docker is unavailable | Start the local Docker Engine and retry, or choose **On this computer** in **Settings → Workspace**. Hallvi never switches modes automatically. |
| Linux service does not survive logout or start at boot | Check `~/.local/bin/hallvi status` and follow its lingering instruction. |
| Linux reports that it cannot connect to the user service manager | Run from a normal login session for the installing user on a systemd machine, rather than through `sudo`. |
| An update reports a schema mismatch | No migration joins those two versions. Keep the installed version and read [Update](#update). Do not delete the database to bypass the check. |
| An update says the release is not signed by the key this Hallvi trusts | Stop. Nothing was downloaded. Check you are looking at [the real releases page](https://github.com/lustoykov/hallvi/releases), and tell the maintainer. |
| An update says Pi is working | Let the conversation finish, then start the update again. The package it downloaded has already been checked. |
| An update stopped without finishing | Hallvi is on the version it had. Read `~/.local/share/hallvi/logs/update.log`, then try again. |

When reporting a problem, include the installed revision from
`~/.local/bin/hallvi status`, your OS and the relevant error. Remove credentials
and private data from any logs you share.

## Files and configuration

| What | Where | On upgrade or uninstall |
| --- | --- | --- |
| Program, its Node.js and dependencies | `~/.local/lib/hallvi` | Replaced / removed |
| The `hallvi` command | `~/.local/bin/hallvi` | Replaced / removed |
| Database, credentials, SSH keys, conversations, logs | `~/.local/share/hallvi` | Kept |
| What the last update did, and its log | `~/.local/share/hallvi/update-attempt.json`, `logs/update.log` | Kept |
| Model account (ChatGPT connection) | `~/.config/hallvi/pi` | Kept |
| Service definition | `~/Library/LaunchAgents/com.hallvi.plist` or `~/.config/systemd/user/hallvi.service` | Rewritten by `start` |

There is one service per user account, whatever `HOME` or `HALLVI_DATA_DIR`
say. `start`, `stop`, `restart` and `uninstall` refuse, changing nothing, when
the loaded service runs from a different program directory than the command.

Optional settings go in `~/.local/share/hallvi/hallvi.env`, one
`NAME=value` per line, read at every start: `HALLVI_PORT` to move the
interface, and `HALLVI_RELEASE_SOURCE` / `HALLVI_RELEASE_KEY` to follow a
release source of your own
([testing a release](releases.md#testing-a-release-without-publishing-one)). A release with a configured GitHub App can connect private
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
printed, for example <http://127.0.0.1:5747>. The tab title says which machine
you have reached, and so does the version at the foot of the sidebar when you
click it. A private application
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

## Update

<a id="upgrade"></a>

Hallvi updates itself. Its version sits at the bottom of the sidebar, under
**Settings**; when a release is waiting it says **Update available** under it.
Click that line and press **Update**. Or, in a terminal:

```bash
hallvi update            # look, then ask before installing
hallvi update --check    # look only
hallvi update --yes      # install without the question
hallvi update --status   # what the last attempt did
```

They are the same update. The sidebar and the command find the release the
same way, check it the same way, and hand the work to the same installer; the
command adds only a question with a yes and a line per step.

**What happens.** Hallvi looks for the newest release on the `alpha` channel
and reads its signed manifest. Nothing is believed before that signature is
checked against the key Hallvi ships — not the version, not the platform, not
the address to download from. It then downloads the archive, refusing anything
that is not the exact size and SHA-256 the manifest named, unpacks it, and
reads the release record inside to confirm it is the release the manifest
described. Only then does it stop the service, swap the program and start
again. It is finished when the new interface answers with the revision that was
installed and the Pi worker is back.

**What it keeps.** Applications, conversations, evidence, credentials, SSH
keys, the ChatGPT connection, your `hallvi.env` settings and your ports. The
update returns the service to the state it found: running if it was running,
stopped if you had stopped it. Unsent text in a conversation is kept too.

**Where it is installed.** The machine running Hallvi. Reached through an SSH
connection from a laptop, it updates the machine at the other end, keeps its
ports, and the page comes back on the same address when it restarts.

**While Pi is working.** Downloading happens alongside whatever Pi is doing.
Installing does not: before the service stops, Hallvi asks the worker to take
no new work and, in the same answer, whether any is still in hand. A
conversation that is running — including one waiting for your approval — stops
the update there, with the package already downloaded and checked. Let the work
finish and start the update again.

**When it fails.** Anything that can be checked is checked while the old
version is still serving, so a refusal changes nothing. If the new version is
installed but does not start, the installer puts the previous program back and
starts it, and both the sidebar and `hallvi update --status` say which version
you are on. The helper's own account is in `~/.local/share/hallvi/logs/update.log`.

Only one update runs at a time; a second is told what the first is doing.
Installing is always something you press: Hallvi never replaces itself on its
own. It looks for a release at most once a day, and keeps the answer in
between, so opening a page never waits on the network.

**A development checkout** says what it is and offers nothing. `git` is how it
changes.

**A new version that keeps its records in another schema** is either migrated
or refused, and never guessed at. The release says which schemas it can take
records from, in its signed manifest; the installation reading it is the older
one and could not know about a migration written after it shipped.

If it does not name yours, the release is refused before it is downloaded,
naming both schemas, and the claim is checked again by the installer against
the real database from
[the list in the archive](../scripts/migrations.mjs). Keep or
reinstall the version that wrote the database, or move the database aside and
start fresh. Nothing deletes or rewrites it.

If it does, the upgrade carries it out, in this order and no other:

1. Pi stops taking new work, and says how much is still going on. Work in
   progress stops the update rather than being interrupted.
2. The package is downloaded and checked against the signed release.
3. The service stops, so nothing is writing.
4. Exactly the records the migration rewrites are copied and the copy is
   reopened and verified. It is kept afterwards, and the installer says where.
5. The migration runs, while the old program is still in place.
6. The new program replaces the old one and starts, and the update is only
   finished once the interface reports the installed revision and the worker
   answers.

**If step 5 or 6 fails**, the installer first stops the service and waits for
the service manager to agree it is gone — a start that reported failure can
leave a service loaded and being retried, and nothing is replaced while
anything might still be writing. Then it puts the records back from the copy
it made, the old program back from the one it kept, and starts it again.
Putting the program back is not on its own a rollback: the old version would
meet a database in a schema it does not know and refuse it, which is the
correct refusal and not a recovery. If you ever need to do this by hand, the
copy is under `migrations/` in the state directory and its `manifest.json`
carries the exact command:

```bash
node ~/.local/lib/hallvi/app/scripts/migrate-state.mjs --restore <that directory>
```

If a running service meets a database it cannot open later, it stops after
reporting the mismatch instead of restarting for ever.

`install-hallvi.sh` still takes an archive, for an offline machine or a
specific build; see [installing an exact archive](#installing-an-exact-archive).

## Uninstall

```bash
hallvi uninstall
```

This stops the service and removes the program, the command and the service
definition. It keeps `~/.local/share/hallvi` and `~/.config/hallvi`
and prints both paths. Installing again picks everything up where it was. To
discard the state as well, delete those two directories yourself.

## Build a release archive

Publishing a release is [its own document](releases.md): the version, the
signed manifest, the workflow and the one secret it needs. This section is the
single archive underneath it, for a contributor who wants one by hand. From an
authorized source checkout using Node.js 22 and locked dependencies:

```bash
npm ci
npm run package
```

Run `npm run package` once on Apple-silicon macOS and once on Ubuntu 24.04
x64. It downloads pinned Node.js 22 from nodejs.org, checks its published
SHA-256 value, builds the app and installs locked production dependencies on
that platform. It verifies the native modules load, then writes
`dist/hallvi-0.1.0-<platform>.tgz`, its `.sha256`, and
`dist/install-hallvi.sh`. A published release carries those plus the signed
`hallvi-release.json` and its `.sig`, which is what a plain
`sh install-hallvi.sh` finds and checks; record the source revision and the
verification performed on that candidate. The
[beta walkthrough](beta-walkthrough.md) defines the fresh-user acceptance
check. Packaging does not publish a release, and neither does merging a pull
request: [Publishing a release](releases.md) is run by hand and leaves a draft.

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

- No alpha release is published yet. The workflow that builds and signs one is
  ready and has never been run; the public download page is therefore empty,
  and the maintainer still supplies archives by hand. Everything that workflow
  needs is in place; see [Publishing a release](releases.md).
- A first installation trusts github.com over HTTPS, not a signature. Only
  updates are verified against the key Hallvi ships; a verifier taken out of the
  archive it is verifying would prove nothing.
- The [19 September integrated candidate](testing/2026-09-19-integrated-prebuilt-installation.md)
  was installed on Apple-silicon macOS and Ubuntu 24.04 x64. A fresh ChatGPT
  connection on the installed Ubuntu controller drove real public-repository
  inspection and private deployment to a separate test host. External-user
  acceptance remains open; each later archive needs its own trial.
- macOS Intel, Linux arm64 and other Linux distributions have no prebuilt
  release target yet.
- Only the schema transitions in
  [the list](../scripts/migrations.mjs) can be installed over existing records;
  today that is 15 to 18. Any other difference is refused, and nothing is
  migrated or deleted. A migration is carried forward only: going back is
  restoring the copy the upgrade kept.
- Updates are only ever started by the owner. There is no automatic
  installation, no scheduled one, and no way to ask for one.
- One update at a time, and only the last attempt is remembered.
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
