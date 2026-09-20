# Downloads and updates, 20 September 2026

What a Hallvi that replaces itself had to prove, and what it did not.

Branch `claude/hallvi-downloads-updates-b1e5ee`. The archives under test were
built from two different revisions of it, so an update moved between two, and
the check that the new interface reports the revision that was installed means
something.

Those two revisions are what the archives' own `dist/release.json` records, and
they are not commits on the branch as it was pushed: the branch was re-authored
to the repository's noreply identity afterwards, which rewrote every hash.
`a5ebcef4` is the commit now published as `53fcd6fc`; `00d645c6` was an earlier
state of the first commit, superseded before it was pushed. The content of each
is what was built and installed.

## Where it ran

| | |
| --- | --- |
| Controller under test | Hetzner `cx43`, Ubuntu 24.04.4 LTS x64, `hallvi-update-e2e-0abbbca3`, a disposable fixture created for this work |
| Installed as | An ordinary user (`owner`), systemd user service, lingering on |
| Release source | `https://releases-test.hallvi.com`, Caddy with a Let's Encrypt certificate on that same host, serving a releases index in the shape the GitHub API answers with |
| Release key | An Ed25519 keypair generated for this test and named in the installation's `hallvi.env` through `HALLVI_RELEASE_KEY`. Not Hallvi's own key, which stayed on the owner's MacBook |
| macOS | The owner's MacBook, Apple silicon: both platform archives built, and the launchd side of the update helper exercised. **The owner's own installed Hallvi was not touched**; it was still `0.1.0 (0cd9874)`, running, with its program directory unchanged, at the end |

Archives, both built on the platform they run on:

| Release | Revision | Built on |
| --- | --- | --- |
| `0.2.0-alpha.1` | `00d645c6` | Ubuntu 24.04 x64, and Apple silicon |
| `0.2.0-alpha.2` | `a5ebcef4` | Ubuntu 24.04 x64, and Apple silicon |
| `0.2.0-alpha.3` | `a5ebcef4` | Ubuntu 24.04 x64 |
| `0.2.0-alpha.4`, `0.2.0-alpha.5` | `146a7819` | Ubuntu 24.04 x64 |
| `0.3.0-alpha.1`, `0.3.0-alpha.2` | `8bd12548` | Ubuntu 24.04 x64 |
| `0.3.0-alpha.3`, `0.3.0-alpha.4` | `b2a7ccad` | Ubuntu 24.04 x64 |

Each Linux archive is 278 MB and carries Node.js 22.23.2, the built interface,
the Pi worker and production dependencies with both native modules.

## What the installation had to keep

One real application record, made through the product's own API against the
real GitHub — `Keepsake`, `lustoykov/hallvi`, readable at `main · e121188c` —
with its main conversation, plus a stand-in credential file, a stand-in
ChatGPT account file and a moved port. Fingerprinted before and after every
step:

```
  app   11111111-…-555555555555 Keepsake https://github.com/lustoykov/hallvi
  schema 18
database sha256: 6be0e04909221219585ab91271434972
secret   sha256: c36b9aa67a314f51150d28dd8b3c9678
pi auth  sha256: 73a45cf12275fc4242b74a6dc8f04733
settings: HALLVI_PORT=6747
```

Those four lines were identical after every result below, including the
failures and the rollback.

## Results

### A first download and installation

Downloaded `install-hallvi.sh`, the archive and its `.sha256` over HTTPS with
`curl`, then `sh ./install-hallvi.sh ./hallvi-0.2.0-alpha.1-linux-x64.tgz`.
Installed without root, started the service, and printed the two commands for
a laptop. `curl 127.0.0.1:5747/api/host` answered
`{"version":"0.2.0-alpha.1","revision":"00d645c6…"}`.

### A to B through the installed service

`hallvi update --yes`, from `0.2.0-alpha.1` to `0.2.0-alpha.2`. Sixteen
seconds, wall clock, including the 278 MB download:

```
checking:     Preparing the update.
downloading:  Downloading Hallvi 0.2.0-alpha.2 — 90%.
verifying:    Checking the package against the signed release.
installing:   Installing Hallvi 0.2.0-alpha.2. Hallvi stops for a moment and comes back on the same address.
completed:    Hallvi 0.2.0-alpha.2 is running on http://127.0.0.1:5747.
```

Afterwards `hallvi status` reported the service, the interface and the Pi
worker all up on `0.2.0-alpha.2 (a5ebcef)`, and `/api/host` answered with the
new revision — from the process that was actually running, not from the files
on disk.

### The same update, from the interface, through an SSH tunnel

`0.2.0-alpha.2` → `0.2.0-alpha.3`, driven from a browser on the MacBook
through `ssh -F ~/.ssh/hallvi-… -N`, exactly as the installer prints it. The
laptop already had another Hallvi forwarding 5747, so this installation was
moved with `hallvi port 6747` first — the collision the guide describes, and
its answer.

The control was a card in Settings at the time of this run; it has since moved
to the sidebar, and the later runs below used it there. Either way it showed
the version, revision and machine, offered `0.2.0-alpha.3` with its size and
release notes, and ran the update in place: *Verifying* → *Installing* →
*Updated · Hallvi 0.2.0-alpha.3 is running on http://127.0.0.1:6747.* The same
tab, the same address; the remote machine was updated, not the laptop, and
`HALLVI_PORT=6747` survived.

An unsent draft typed into the conversation before the update —
`An unsent draft that must survive the update.` — was still in the composer
afterwards, and `/api/host` reported `0.2.0-alpha.3`.

The helper's own account was where the attempt said it was, in
`~/.local/share/hallvi/logs/update.log`, and the updates directory was empty
afterwards: no archive, no unpacked copy, no staged runtime.

### The CLI and the interface are the same update

Both runs above used the same discovery, the same verification, the same
helper and the same `install.sh`; `releaseView` and `startUpdate` in
`scripts/update-start.mjs` are what each calls. A second `hallvi update --yes`
started while the first was running printed the *first* attempt's phases
rather than starting its own.

### One more, on the final code

Two defects the preview itself found were fixed and the whole thing run again
from the finished branch: `0.2.0-alpha.4` (`146a7819`) installed over
`0.2.0-alpha.3` from Settings through the tunnel, then `0.2.0-alpha.5` built
from the same commit and published so the running product could be seen with a
release waiting.

In the running product, on that build: the **Update available** link was no
longer a link inside the brand link — which is not markup a browser keeps; and
typing into an unconnected first conversation no longer summons a strip
repeating what the welcome and the composer's placeholder already say. The
same unsent draft was still in the composer, four updates after it was typed.

### Where the version ended up

On review, the card in Settings read like a sixth provider account, which is
not what Hallvi's own version is. It moved to the chrome: one dim line under
**Settings** at the bottom of the sidebar, **Update available** under it only
while a release is waiting, the phase on that line while an update runs, and a
small panel — revision, machine, channel, last looked, the offer, **Update**
and **Check for updates** — when the line is clicked. Settings went back to
the six accounts.

That move was installed and read in the running product too, over four more
updates (`0.3.0-alpha.1` through `0.3.0-alpha.4`, all from `b2a7ccad` and
`8bd12548`). It found one layout defect on the way: `.hv-application-navigation
button` gives every button in that sidebar a row's height and type size, which
outranked these rules and cut the version to an ellipsis the moment the second
line appeared. Scoped past it and stacked.

### Releases that must not be installed

Each was published on the test source in turn, and each left `0.2.0-alpha.1`
installed and serving.

| What was offered | What Hallvi said | How far it got |
| --- | --- | --- |
| The right manifest, signed by another key | *The release manifest is not signed by the key this Hallvi trusts. Nothing was downloaded.* | Nothing downloaded |
| A release with only a macOS package | *Release 0.1.0-alpha.3 has no package for linux-x64.* | Nothing downloaded |
| A release declaring schema 99 | *…keeps its records in schema 99 and this one uses schema 18. There is no migration between them yet…* | Nothing downloaded |
| A correct, signed manifest, with different bytes served at its address | *The downloaded package does not match the checksum in the signed manifest. Nothing was installed.* | Downloaded, then thrown away |

The corrupted case is the one worth naming: the manifest was genuine and
signed by the trusted key, and only the archive had been altered — one byte,
a hundred megabytes in. It was refused after download and before anything was
unpacked or replaced.

### A release that installs but cannot start

`0.1.0-alpha.6`: a real archive with `.next/BUILD_ID` removed, so every check
the installer makes passes and the program only fails when it is asked to run.

```
installing: Installing Hallvi 0.1.0-alpha.6…
failed:     The installer refused, and Hallvi 0.1.0-alpha.2 is still installed:
            install: Hallvi did not become ready; check hallvi logs.
```

The installer's own log line, `The previous Hallvi program was restored.`, and
`hallvi status` on `0.1.0-alpha.2` with its worker running. Rolling back the
program did not touch the records: the four fingerprint lines were unchanged.

### Two updates at once

With `hallvi update --yes` running, the interface was asked to install as well:

```
{"error":"An update to 0.1.0-alpha.6 is already verifying."}
```

and a second command said the same thing before following the running attempt.

### An installation the owner had stopped

`hallvi stop`, then `hallvi update --yes`:

```
completed: Hallvi 0.2.0-alpha.2 is installed. It was stopped before the update
           and stays stopped: hallvi start
```

`systemctl --user is-enabled hallvi.service` → `disabled`, `is-active` →
`inactive`, and the program on disk was the new one. `hallvi start` brought it
up on `0.2.0-alpha.2`.

### The helper outlives the service it replaces

This is the property a child process cannot have, so it was checked on both
service managers rather than assumed.

**Linux.** `systemd-run --user --collect --unit=hallvi-update-<id>` puts the
helper in its own transient unit and its own control group.
`systemctl --user disable --now hallvi.service` during the update did not
reach it; every successful update above is that property holding.

**macOS.** The owner's Mac has one real Hallvi, and launchd knows one
`com.hallvi` per user, so a second installation there could not be made
without risking theirs. What was checked instead is the launchd mechanism
itself, with the real `startHelper` and the real `update-helper.mjs`: a
stand-in agent under a disposable label called `startHelper`, which
bootstrapped `com.hallvi.update` as its own job; that agent was then booted
out, its process confirmed gone, and the helper kept running and kept
recording progress (`Downloading … — 10%` → `30%`) for ten seconds afterwards.
It then refused a deliberately wrong checksum, removed its own launchd job and
plist, and left its data directory clean.

The same run also settled a question the copied runtime raises: `otool -L` on
the packaged macOS Node.js shows it links only against system frameworks, and
the copy `startHelper` makes ran on its own away from its directory.

### Signing

`scripts/sign-release.mjs` refused to write anything with no key:

```
Release blocked: HALLVI_RELEASE_SIGNING_KEY is not set, so this release cannot be signed.
Hallvi installs only signed releases, and there is deliberately no unsigned path.
```

and refused a key whose public half is not the one the reader trusts:

```
Release blocked: this signing key does not match the public key Hallvi ships…
Signing with a key installations do not trust would publish a release none of them can install.
```

It also refuses to sign a release that does not have an archive for every
supported platform.

## What this does not establish

- **No macOS installed-service update was performed.** The full stop–swap–start
  cycle on macOS is unverified: only the helper's launchd lifetime, the
  packaged runtime's self-sufficiency and the archive build were checked there.
  Doing better needs a Mac other than the owner's, or a second account on it.
- **No release has been published.** The workflow in `.github/workflows/release.yml`
  has never run; it is read, not proved. Its signing secret was configured on
  20 September 2026, so the one thing that could have blocked it is no longer
  outstanding, but nothing has exercised it: the version→build→verify→publish
  sequence has only been
  exercised piecewise: `npm run package` on both platforms by hand,
  `sign-release.mjs` against real archives, and a release source serving the
  result.
- **The busy interlock was not exercised against a working Pi on the installed
  service**, because the test installation had no model account. That the hold
  stops new work before it counts what is running, and that a conversation
  waiting for approval counts as work, is proved in
  `tests/application/integration/pi-owner.test.ts` against a real worker over
  the real socket with a scripted model. What the installed runs prove is that
  the helper asks, and goes on when nothing is running.
- **The `darwin-arm64` entries in the test manifests named stand-in files**, not
  the real macOS archives, because the installation under test was Linux and
  never fetched them. The real macOS archives were built and their checksums
  signed in the earlier `0.1.0-alpha.*` manifests.
- Nothing here says anything about deploying applications. This is the
  controller updating itself.

## Checks

`npm test` (992 passing, 3 skipped), `npm run lint`, `npx tsc --noEmit` and
`npm run build`, on the branch tip with `main` merged in, locally on
Node.js 22.23.2.

GitHub Actions has run nothing in this repository since 12 September, so the
`Hallvi checks` workflow did not run on this branch and the new release
workflow has never run either. Both are read rather than proved.

## Resources

Created for this work, labelled and registered under owner
`0abbbca3-57c8-4586-b0ba-9389b3197bca`: one Hetzner server, one Hetzner SSH
key and one `releases-test.hallvi.com` DNS record. Their disposition is in the
task's registry entry.
