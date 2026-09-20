# One script installs it, and it looks for the next one — 20 September 2026

What `sh install-hallvi.sh` does on a machine that has never had Hallvi, what
an installed controller does about releases on its own, and what the
developer dashboard reports. The disposable host was a Hetzner cx33,
`166642367`, Ubuntu 24.04, retired afterwards.

## Installing, with nothing but the script

The archive was built on that host (`hallvi-0.1.0-linux-x64.tgz`,
`c85b80a2…`, 292 MB) and published as a signed stand-in release served over
real HTTPS by Caddy at `62-238-62-159.sslip.io`, in the shape a GitHub release
has. Then, as an ordinary user, with no arguments:

```
$ sh install-hallvi.sh
Looking for the newest Hallvi release for linux-x64.
The release manifest is signed by the Hallvi release key.
Downloading Hallvi 0.1.0 for linux-x64.
The archive matches the signed manifest.
Verified by a signature checked before anything was unpacked, over HTTPS.
Preparing prebuilt Hallvi for linux-x64
Checking the controller database
Hallvi can open this controller database.
Hallvi is starting, and will start with this machine.
  interface  http://127.0.0.1:4747
  Pi worker  running
```

Four things happened there that used to be the person's job: working out the
platform, finding the release, fetching the right archive, and checking it
against something signed. The checksum came from the manifest, not from a
`.sha256` served beside the archive.

**The signature was checked before anything was unpacked**, because Ubuntu
ships OpenSSL 3. On stock macOS, which ships LibreSSL, `openssl pkey` cannot
even load an Ed25519 public key — verified on this Mac: `/usr/bin/openssl`
answers `unable to load Public Key` where OpenSSL 3.6.4 answers
`Signature Verified Successfully`. There the same check runs after unpacking
with the archive's own Node.js, and the script says which of the two it did.

Discovery needs no JSON parser. An unauthenticated releases listing hides
drafts — confirmed against this repository, which has one draft and answers
`[]` — and every asset of a release shares one directory, so the newest
`hallvi-release.json` URL locates all of them.

## Looking for the next release, unprompted

With `HALLVI_RELEASE_SOURCE` and `HALLVI_RELEASE_KEY` in the installation's own
settings file, the service restarted. **No browser was opened and no button
was pressed at any point below.**

```
50s after starting   checkedAt 2026-09-20T17:59:17Z   found v0.1.0-alpha.1
```

Then a newer release was published to the same source and the last look was
backdated two hours, to make one due:

```
70s later            found v0.2.0-alpha.1
still installed      0.1.0        no update-attempt.json
```

It noticed, and it did not install. Installation is still a button.

### The failure path, demonstrated by accident

Between those two steps the stand-in was re-signed with a new key while the
running service still held the old one. The check recorded exactly what it
should:

```
error:     The release manifest is not signed by the key this Hallvi trusts.
           Nothing was downloaded.
candidate: v0.1.0-alpha.1
```

It kept the answer it already had rather than replacing it with nothing, and
said why. That is the behaviour wanted from an unreachable or untrusted
source, and it was not staged.

### Where the look lives

In the Pi worker's loop, on its own deadline rather than as another branch of
the chain that handles live work and the daily copy — a controller with Pi
working in it would never reach a fourth `else if`, and "hourly" would quietly
mean "hourly while idle". The worker is already single-instance, by the
exclusive SQLite lock, so two checks cannot race. It is gated on being an
installation: a checkout has nothing to update, and every worktree polling
GitHub hourly would be rude.

That gate did its job unprompted too. The first attempt on this host reported
nothing at all, because an archive built from a `git archive` export carries
`revision: "unknown"` in `dist/release.json`, and `installation()` correctly
calls that a development build. The fixture was corrected to a 40-character
revision — the thing under test is the gate, not the realness of the hash.

## The dashboard, against a real archive

The Releases page checks a built archive rather than asserting a claim about
one. Run against the 64,968-entry archive built above:

```
entries: 64968
must not ship: none found
must ship:     install.sh · scripts/serve.mjs · scripts/cli.mjs ·
               scripts/migrations.mjs · scripts/migrate-state.mjs ·
               dist/worker.mjs · dist/schema.sql · dist/schema-version.json ·
               node/bin/node        all present
```

Getting there corrected the check three times, which is the argument for
checking a real archive rather than a list:

- compiled Next route handlers whose URLs contain the words `secrets` and
  `operator` were read as leaked credentials;
- a prefix match on `scripts/dev` flagged `dev-environment.mjs`, which
  production reads;
- a dependency's own `tests/` and the bundled Node.js's copy of npm's `src/`
  were read as ours. The rules now judge only Hallvi's own paths.

The two `scripts/migrate*` lines are also the proof that the packaging fix
landed: those modules were missing from the archive until `package.mjs` was
told to copy them.

## The Development page, on the real machine

It reports what it measures. Asked on a machine where the dashboard ran in one
worktree and Hallvi ran from another, it said so rather than printing this
checkout's branch beside that one's address:

```
Serving      /Users/aiwithlyubomir/biz/code/hallvi
Its branch   main at 2506ccf48
Release identity   none — a development run is not built from a release

It is serving a different checkout from this dashboard … The branch and
revision above describe these files, not what is answering.
```

It also showed the registered database and its schema, the four sample
applications with the host their own data lives on, and the copies taken of
Hallvi's records — all from the environment's register, with nothing scanned.

At 375 px both pages lay out in one column with no horizontal scroll. Adding
two links had pushed the dashboard's own bar past a narrow window; it wraps
now.

## A second review, and the fallback that never ran

**The stock-macOS path was broken, and said the wrong thing about it.**
`node -e` has no script path, so its arguments begin at `argv[1]`; the check
read them from `argv[2]`, which pointed the import at the work directory and
left the second argument undefined. On the only machines that path exists for
— a Mac with no OpenSSL that can do Ed25519 — installation always failed, and
reported *"the release manifest is not signed by the Hallvi release key"* when
in truth nothing had been verified at all.

The complete fallback, exercised against a signed manifest, the key that
signed it, a key that did not, and a verifier that is missing:

```
                        before            after
correct key             not signed ✗      signed, exit 0
wrong key               not signed        not signed, exit 1
check cannot run        not signed ✗      could not be checked, exit 1
```

**And the messages were unreachable anyway.** `cmd; verdict=$?` never reaches
the assignment under `set -e`: the failing command ends the script itself. The
table above came from a harness that did not set `-e`, which is exactly why it
reported them working. Under the real thing:

```
                        before            after
wrong key               <silence>, 2      not signed, 1
check cannot run        <silence>, 1      could not be checked, 1
```

The status is captured with `||` now, which is what keeps both refusals
reachable, and the two outcomes exit differently so "could not check" is never
reported as "not signed".

**A failed look skipped the hourly interval.** The gate excluded cached errors,
and the worker comes round every minute, so an unreachable source became a
request a minute for as long as the outage lasted. Eight worker ticks during
an outage, before and after:

```
requests that left the machine:   8  ->  1
Check now, inside the hour:       still forces one
```

Both gates that decide how often to look now say the same thing; there were
two, with different rules.

## About the verification itself

Two corrections to what was claimed earlier, both found by review rather than
by me.

**The dependencies did not match the lockfile.** This worktree had
`pi-ai` and `pi-coding-agent` at 0.84.4 against a lockfile pinning 0.85.1, and
`pi-agent-core` was not installed at all. Three type errors were reported here
as "pre-existing SDK drift"; they were nothing of the kind. After
`npm ci` under Node 22 and deleting a stale `.next`, `npx tsc --noEmit` is
**clean** — zero errors — and `npm run build`, which type-checks everything
including the tests, passes. Every number below was taken after that
reinstall.

**The `set -e` harness gap above** is the same category of mistake: a check
that did not reproduce the conditions it claimed to check.

## About "all green"

The reviewer is right that it described local verification. **GitHub Actions is
disabled for this repository** — `actions/permissions` answers
`{"enabled": false}`, and the last workflow runs were on 12 September — so no
PR has checks, and this is a repository setting rather than a workflow that
needs fixing. Turning it on is the owner's call, not something to flip in
passing. It also means the Releases page's **Build draft release** button
cannot succeed until it is on.

## What this does not establish

- **No release was published.** Everything above ran against a stand-in source
  signed with a key made for the test. The first real alpha is still
  unpublished, so zero-argument discovery has nothing real to find yet.
- **The publish button was not pressed.** It was written and its refusals
  tested by hand; promoting the repository's existing draft would have been a
  public release.
- **macOS took the weaker verification path only in principle here.** The
  LibreSSL limitation was verified on this Mac directly; the fallback that
  follows from it was not exercised on a fresh Mac.
- **The hourly cadence was observed at its edges**, not over an hour: a first
  look when none had been made, and a second after the last one was backdated.
