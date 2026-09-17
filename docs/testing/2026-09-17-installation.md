# Installed service on a real Mac and a real Linux virtual machine — 17 September 2026

What was run to establish that [Installing Server Guy](../installation.md)
describes something that works. Package built from branch
`claude/install-service` on top of main `0d48acd`. The model account was the
owner's real ChatGPT connection; the owner completed the device-code sign-in on
the virtual machine themselves.

## Machines

| Role | Machine |
| --- | --- |
| Mac | The owner's MacBook, macOS 26, Apple silicon, launchd agent |
| Virtual machine | Hetzner CX23, Ubuntu 24.04 x64, systemd 255, unprivileged user `owner` |
| Application server | Hetzner CX23, Ubuntu 24.04; a Python web server bound to `127.0.0.1:3000` only |
| Laptop | The same MacBook, reaching the virtual machine with the SSH configuration `server-guy remote` printed |

Both Hetzner servers were created for this check, labelled
`session=always-on-install`, and deleted afterwards.

## Results

| Check | Mac | Linux virtual machine |
| --- | --- | --- |
| Install from the archive, no root | Passed; Node 24.21.0 downloaded and verified, two native compiles | Passed; ~50 s |
| Interface and worker run with no terminal | launchd agent, interface on 4747 | systemd user unit, listening on `127.0.0.1` only |
| Real Pi operation through the service's worker | Read a public repository and answered, 5 model calls | Gave the application's public key, pinned the host key, connected the server, opened private access; 1–7 model calls per turn |
| Worker killed with `kill -9` | launchd restarted the pair in ~3 s | systemd restarted the pair, `NRestarts=1` |
| `restart`, `stop`, `start` | Conversation kept; `stop` removed the agent and freed the port; `status` exit 1 while stopped | Same commands used throughout |
| Start with the machine | Agent has `RunAtLoad`; loading it is what login does. A real logout and login was not performed | `reboot`, then with nobody logged in (`who` empty, `Linger=yes`) the interface answered |
| Upgrade in place | Stopped stays stopped; running returns running; state kept | Running returns running; application, conversation and ChatGPT connection kept |
| Uninstall, then install again | Not run on the Mac | Program, command and unit removed; state kept; reinstall started and Pi answered in the old conversation |
| `uninstall` run from an unpacked archive | — | Refused, nothing removed |

### Private application access from the laptop

With Server Guy on the virtual machine and `ssh -N server-guy` running on the
laptop:

- the interface loaded on the laptop at `http://127.0.0.1:4747`;
- Pi, asked to open private access to the application on `127.0.0.1:3000` of
  the application server, chose port 4757 from the installation's range and
  reported HTTP 200;
- `http://127.0.0.1:4757`, exactly as Pi wrote it, showed the application in
  the laptop's browser, and the access check the Overview uses reported the link
  open;
- the browser terminal's WebSocket connected through the fixed port 4748 and
  ran `hostname` on the application server;
- after an upgrade restarted the service the link was closed and the access
  check said so; Pi reopened it on the same port when asked.

## Defects this found

All fixed before merge.

- Node's recursive copy rewrote Next's relative links to external packages into
  absolute paths into the build checkout. The Mac installation worked only
  because that checkout existed; the Linux one answered 500 on every page.
- `status` called the interface up on the strength of a redirect while every
  page failed. It now asks a page that needs the database.
- `launchctl bootout` returns before the job is gone, so `restart` failed with
  an input/output error. The command now waits.
- The archive carried macOS extended attributes and a non-executable
  `install.sh`.
- Review findings: `uninstall` could delete the directory above any unpacked
  copy; an upgrade stopped the service before the steps most likely to fail;
  a worker or interface that ended cleanly made the launcher exit 0.

## Not covered

- A real macOS logout and login, and sleep and wake with an open private link.
- Linux on arm64, other distributions, and macOS on Intel.
- An upgrade across a database schema change; the service refuses and nothing
  migrates, by design for now.
- Pi's repository workspace on the virtual machine, which has no Docker. The
  operations above used only server tools.
