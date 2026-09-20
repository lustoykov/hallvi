# Publishing a Hallvi release

This is the maintainer's document. To install or update Hallvi, read
[Installing Hallvi](installation.md) instead.

A release is a version, an exact source revision, one prebuilt archive per
supported platform, and one small signed document — the **manifest** — that
names them. An installation looks for releases on the `alpha` channel, reads
that manifest, checks its signature against a public key it ships, and installs
only the bytes the manifest named.

## What trusts what

```mermaid
flowchart LR
  subgraph outside["Outside every repository and installation"]
    key["Ed25519 private key<br/>alpha channel"]
  end
  subgraph ci["GitHub Actions · release.yml · run by hand"]
    mac["macos-15<br/>darwin-arm64 archive"]
    linux["ubuntu-24.04<br/>linux-x64 archive"]
    sign["sign-release.mjs<br/>manifest + signature"]
  end
  subgraph gh["GitHub Releases · public"]
    draft["Draft release"]
    published["Published release<br/>archives · manifest · signature"]
  end
  subgraph install["An installed Hallvi"]
    pub["Public key, in the program"]
    verify["Verify signature<br/>then read the manifest"]
    bytes["Download · size · SHA-256<br/>· platform · schema"]
    installer["install.sh"]
  end

  key -.->|repository secret| sign
  mac --> sign
  linux --> sign
  sign --> draft
  draft -->|the maintainer presses publish| published
  published --> verify
  pub --> verify
  verify --> bytes
  bytes --> installer

  classDef secret fill:#fff4e9,stroke:#ecd6b8,color:#9a4b10
  classDef trusted fill:#eaf8f1,stroke:#bfe4d3,color:#0f7a4e
  class key secret
  class pub,verify trusted
```

Two boundaries matter, and they are not the same one.

**Updating** is the one that has to hold without a person. Nothing about a
release is believed before the signature is checked: not the version, not the
platform, not the address to download from. A release source that is taken
over, or an archive replaced in transit, produces a manifest that does not
verify, and the update stops before anything is downloaded.

**Installing for the first time** is a person downloading files from
github.com over HTTPS and running them. The `.sha256` beside each archive
catches a damaged download; it does not authenticate the distributor, because
whoever serves the archive serves that file too. The anchor there is GitHub and
HTTPS, and the fact that the repository is public and its source readable.
Hallvi cannot improve on that from inside the archive being installed: a
verifier taken out of the archive it is verifying proves nothing.

## What the owner has to supply

One secret, once.

| What | Where | Notes |
| --- | --- | --- |
| `HALLVI_RELEASE_SIGNING_KEY` | Repository secret, `lustoykov/hallvi` → Settings → Secrets → Actions | The alpha channel's Ed25519 private key, as a PKCS#8 PEM (or that PEM base64-encoded). Its public half is already in [`scripts/release-trust.mjs`](../scripts/release-trust.mjs). |

The private key was generated for this work and is on the owner's MacBook at
`~/.config/hallvi-release/alpha-signing-key.pem`, owner-only. It is in no
repository, no archive and no installation. It was added to the repository as
`HALLVI_RELEASE_SIGNING_KEY` on 20 September 2026, with:

```bash
gh secret set HALLVI_RELEASE_SIGNING_KEY --repo lustoykov/hallvi < ~/.config/hallvi-release/alpha-signing-key.pem
```

The same command replaces it.

Without it the release workflow stops at the signing step and says so. There is
no unsigned fallback: an unsigned release is one no installation would accept,
and publishing it would only look like publishing.

Keep a copy of that file somewhere the Mac's failure does not reach. Losing it
does not endanger installed copies; it means the next release cannot be signed
and the public key in the program has to be replaced, which is itself a release.

## The sequence

**Version.** Raise `version` in `package.json` in a pull request and merge it.
That commit is what a release names. Merging it publishes nothing.

```
0.1.0  →  0.1.0-alpha.1  →  0.1.0-alpha.2  …
```

**Build.** Run the **Hallvi release** workflow by hand — Actions → Hallvi
release → Run workflow — giving it the same version. It refuses to go on if
`package.json` on that ref says something else. It builds one archive per
platform on that platform: `macos-15` for Apple silicon, `ubuntu-24.04` for
x64. Each runner proves what it is before it builds, and
[`scripts/package.mjs`](../scripts/package.mjs) downloads the pinned Node.js,
checks its published checksum, installs locked production dependencies and
loads both native modules before it writes the archive. Nothing is
cross-built, and a platform with no runner has no release.

**Verify.** The workflow signs the manifest and then verifies its own
signature with the public key Hallvi ships, so a key that no longer matches is
a failed release rather than an update nobody can install. Install the draft's
archive on a machine of each supported platform before publishing it; the
[beta walkthrough](beta-walkthrough.md) is the fuller acceptance.

**Publish.** The workflow leaves a **draft** prerelease. GitHub does not serve
a draft to a reader without a token, so nothing discovers it. Pressing publish
is the release.

**Discover.** Installations following `alpha` find it at their next check, or
when the owner presses **Check for updates**. Each checks once a day at most,
from the last answer in between.

Merging a pull request never reaches any of this.

## The manifest

One file, `hallvi-release.json`, signed byte for byte. Its signature is
`hallvi-release.json.sig`: base64 of the raw Ed25519 signature.

```json
{
  "hallviRelease": 1,
  "channel": "alpha",
  "version": "0.1.0-alpha.1",
  "revision": "<the 40-character commit the archives were built from>",
  "schemaVersion": 18,
  "releasedAt": "2026-09-20T09:00:00.000Z",
  "notes": "https://github.com/lustoykov/hallvi/releases/tag/v0.1.0-alpha.1",
  "packages": {
    "darwin-arm64": { "file": "…", "url": "https://…", "size": 240339966, "sha256": "…" },
    "linux-x64":    { "file": "…", "url": "https://…", "size": 291400178, "sha256": "…" }
  }
}
```

Every address in it is pinned to that release's tag, so discovery and
installation refer to the same immutable candidate. An installation keeps the
manifest's own bytes while it updates and verifies them again in the program
that does the installing, rather than trusting what the interface read.

`schemaVersion` is the database schema that release needs. When it differs
from the installation's, the answer comes from
[the list of supported migrations](../scripts/migrations.mjs): a transition
that exists is carried out during the upgrade, and one that does not is
refused before anything is downloaded, naming both schemas.

There is one such list, and both ways of upgrading read it — `npm run
db:upgrade` in a checkout and `install.sh` on an installation, which is what
the updater runs. Each transition names both of its ends as literal numbers,
so raising `schemaVersion` for a new release does not quietly extend an
existing migration to reach it. [The upgrade](installation.md#update)
describes what happens to the records.

## The channel

`alpha` is the only channel. It exists so that "which releases is this
installation willing to see" is a deliberate answer rather than whatever is
newest: a signed release naming a different channel is refused, not ranked.
Releases on it are GitHub prereleases, and discovery accepts prereleases
because that is what the channel is for.

## Testing a release without publishing one

Two settings in an installation's `~/.local/share/hallvi/hallvi.env` point it
at a release source of your own:

| Setting | Effect |
| --- | --- |
| `HALLVI_RELEASE_SOURCE` | The releases index to read, in the shape the GitHub API answers with. Default: `https://api.github.com/repos/lustoykov/hallvi/releases?per_page=20`. |
| `HALLVI_RELEASE_KEY` | The raw Ed25519 public key to trust, base64. It **replaces** Hallvi's key rather than adding to it, and there is no way to turn verification off. |

An installation trusting a key from its own settings says so wherever it offers
an update, in Settings and in `hallvi update`, because that is not the same
promise. [The 20 September proof](testing/2026-09-20-downloads-and-updates.md)
used both against a disposable release source.
