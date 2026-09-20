#!/bin/sh
# Installs Hallvi. Run it with nothing:
#
#   sh install-hallvi.sh
#
# It works out which machine this is, finds the newest published alpha
# release, downloads that release's signed manifest and the archive for this
# platform, checks the archive against the manifest, and hands over to the
# installer inside it.
#
# Give it a local archive instead when there is no network, or to install an
# exact build:
#
#   sh install-hallvi.sh ./hallvi-0.1.0-darwin-arm64.tgz
#
# WHAT IS ACTUALLY TRUSTED, and what is not. A first installation is a person
# fetching this script and then an archive from github.com over HTTPS, so that
# connection is the root of it either way. On top of that:
#
#   * The archive's SHA-256 and size come from `hallvi-release.json`, which is
#     signed. They do not come from a checksum file sitting next to the
#     archive, which whoever served the archive would also have served.
#   * The manifest's signature is checked against the key written into this
#     script, below — not one taken out of the thing being verified.
#   * Doing that arithmetic needs Ed25519. OpenSSL 3 has it and Ubuntu 24.04
#     ships it, so there the signature is checked before anything is
#     unpacked. Stock macOS has LibreSSL, which cannot load an Ed25519 key at
#     all; there the same check runs afterwards using the Node.js inside the
#     archive, which is weaker and is said out loud when it happens, because
#     an archive that lied could lie about this too.
#
# Nothing here writes outside a temporary directory. The installer it calls is
# what touches an existing installation, and it keeps the old program until
# the new one has started.
set -eu

fail() { printf 'Hallvi install: %s\n' "$*" >&2; exit 1; }
say() { printf '%s\n' "$*"; }
usage() { printf 'Usage: sh install-hallvi.sh [archive.tgz or HTTPS archive URL]\n'; }
case "${1:-}" in
  -h | --help) usage; exit 0 ;;
esac
[ "$#" -le 1 ] || { usage >&2; exit 1; }
[ "$(id -u)" -ne 0 ] || fail "run as your ordinary user, without sudo."

# The one thing this script must decide for itself: which machine this is.
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) platform=darwin-arm64 ;;
  Linux-x86_64 | Linux-amd64) platform=linux-x64 ;;
  *) fail "supported releases target Apple-silicon macOS and Ubuntu 24.04 x64." ;;
esac
if [ "$platform" = linux-x64 ]; then
  [ -f /etc/os-release ] || fail "this Linux distribution is not verified."
  grep -qx 'ID=ubuntu' /etc/os-release ||
    fail "this Linux distribution is not verified; use Ubuntu 24.04 x64."
  grep -Eq '^VERSION_ID="?24\.04"?$' /etc/os-release ||
    fail "this Ubuntu version is not verified; use 24.04 x64."
  command -v systemctl >/dev/null 2>&1 ||
    fail "this machine needs a systemd user service."
fi
for tool in tar ssh awk; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is required."
done

# The public half of the release signing key. Replaced by HALLVI_RELEASE_KEY
# the same way the program replaces it, so a test release source can be used
# end to end; see docs/releases.md.
release_key_base64=${HALLVI_RELEASE_KEY:-zAij7gWKCYN0dTMzbMURpCh/pxVoqPglUHgzIXtEsJE=}
releases_url=${HALLVI_RELEASE_SOURCE:-https://api.github.com/repos/lustoykov/hallvi/releases?per_page=20}

work=$(mktemp -d "${TMPDIR:-/tmp}/hallvi-install.XXXXXXXX") ||
  fail "could not create a temporary directory."
trap 'rm -rf "$work"' EXIT
trap 'exit 1' HUP INT TERM

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

# An OpenSSL that can actually load an Ed25519 key, or nothing. LibreSSL
# answers `openssl version` perfectly happily and then cannot, so this asks
# by trying rather than by reading a version string.
usable_openssl() {
  for candidate in openssl /opt/homebrew/bin/openssl /usr/local/bin/openssl; do
    command -v "$candidate" >/dev/null 2>&1 || continue
    if "$candidate" pkey -pubin -in "$work/release-key.pem" -noout >/dev/null 2>&1; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

write_release_key() {
  # A raw 32-byte Ed25519 key, wrapped in the fixed SubjectPublicKeyInfo
  # prefix that makes it a PEM every X.509 tool understands.
  printf '%s' "$release_key_base64" |
    awk '{ if (length($0) != 44) exit 1; print }' >/dev/null ||
    fail "HALLVI_RELEASE_KEY is not a 32-byte Ed25519 key in base64."
  {
    printf -- '-----BEGIN PUBLIC KEY-----\n'
    printf 'MCowBQYDK2VwAyEA%s\n' "$release_key_base64"
    printf -- '-----END PUBLIC KEY-----\n'
  } > "$work/release-key.pem"
}

# ------------------------------------------------------------ local archive

if [ "$#" -eq 1 ]; then
  input=$1
  name=${input##*/}
  case "$name" in
    hallvi-*-"$platform".tgz) ;;
    *) fail "expected a hallvi-<version>-$platform.tgz release." ;;
  esac
  case "$input" in
    https://*)
      command -v curl >/dev/null 2>&1 || fail "curl is required for a download."
      curl -fsSL "$input" -o "$work/$name" ||
        fail "the Hallvi archive could not be downloaded."
      curl -fsSL "$input.sha256" -o "$work/$name.sha256" ||
        fail "its matching checksum could not be downloaded."
      ;;
    *)
      [ -f "$input" ] || fail "archive not found: $input"
      [ -f "$input.sha256" ] || fail "matching checksum not found: $input.sha256"
      cp "$input" "$work/$name"
      cp "$input.sha256" "$work/$name.sha256"
      ;;
  esac
  expected=$(awk -v name="$name" '$2 == name && length($1) == 64 { print $1 }' "$work/$name.sha256")
  [ -n "$expected" ] || fail "the checksum file does not name this archive."
  case "$expected" in
    *[!0123456789abcdefABCDEF]*) fail "the checksum is invalid." ;;
  esac
  [ "$(sha256_of "$work/$name")" = "$expected" ] ||
    fail "the archive failed checksum verification."
  say "Checked $name against the checksum beside it."
  say "That catches a damaged download. It is not a signature: whoever served"
  say "the archive served the checksum too."
  verified_how="a checksum supplied with the archive"
else

# --------------------------------------------------------------- discovery

  command -v curl >/dev/null 2>&1 || fail "curl is required to find a release."
  say "Looking for the newest Hallvi release for $platform."
  curl -fsSL "$releases_url" -o "$work/releases.json" ||
    fail "the release list could not be reached. Check the network, or pass a downloaded archive."

  # The newest release that actually published a signed manifest. GitHub
  # returns newest first and hides drafts from an unauthenticated listing, and
  # every asset URL of a release shares one directory, so this one match gives
  # the location of all of them without parsing JSON.
  manifest_url=$(
    tr ',' '\n' < "$work/releases.json" |
      awk '/https:\/\/[^"]*\/releases\/download\/[^"]*\/hallvi-release\.json"/ {
             match($0, /https:\/\/[^"]*\/hallvi-release\.json/)
             print substr($0, RSTART, RLENGTH); exit }'
  )
  [ -n "$manifest_url" ] ||
    fail "no published release carries a signed manifest yet. Pass a downloaded archive instead."
  base_url=${manifest_url%/hallvi-release.json}

  curl -fsSL "$manifest_url" -o "$work/hallvi-release.json" ||
    fail "the release manifest could not be downloaded."
  curl -fsSL "$manifest_url.sig" -o "$work/hallvi-release.json.sig" ||
    fail "the release manifest's signature could not be downloaded."

  write_release_key
  # The signature is raw Ed25519 in base64; openssl wants the bytes.
  if command -v base64 >/dev/null 2>&1; then
    tr -d '\n' < "$work/hallvi-release.json.sig" | base64 -d > "$work/manifest.sig" 2>/dev/null ||
      tr -d '\n' < "$work/hallvi-release.json.sig" | base64 -D > "$work/manifest.sig" 2>/dev/null ||
      fail "the signature could not be decoded."
  else
    fail "base64 is required."
  fi

  verified_how=""
  if ssl=$(usable_openssl); then
    "$ssl" pkeyutl -verify -pubin -inkey "$work/release-key.pem" -rawin \
      -in "$work/hallvi-release.json" -sigfile "$work/manifest.sig" >/dev/null 2>&1 ||
      fail "the release manifest is not signed by the Hallvi release key. Nothing was installed."
    say "The release manifest is signed by the Hallvi release key."
    verified_how="a signature checked before anything was unpacked"
  else
    say "No OpenSSL on this machine can check an Ed25519 signature, so that"
    say "check runs after unpacking, with the Node.js inside the archive."
    verified_how="a signature checked with code from the archive itself"
  fi

  version=$(awk -F'"' '/^  "version":/ { print $4; exit }' "$work/hallvi-release.json")
  [ -n "$version" ] || fail "the release manifest does not name a version."
  name="hallvi-$version-$platform.tgz"

  # The size and checksum for THIS platform, from the signed document.
  expected=$(awk -v f="$name" '
    $0 ~ "\"file\": \"" f "\"" { found = 1 }
    found && /"sha256":/ { gsub(/[^0-9a-fA-F]/, "", $2); print $2; exit }' "$work/hallvi-release.json")
  expected_size=$(awk -v f="$name" '
    $0 ~ "\"file\": \"" f "\"" { found = 1 }
    found && /"size":/ { gsub(/[^0-9]/, "", $2); print $2; exit }' "$work/hallvi-release.json")
  [ -n "$expected" ] && [ ${#expected} -eq 64 ] ||
    fail "the release manifest has no checksum for $name."

  say "Downloading Hallvi $version for $platform."
  curl -fsSL "$base_url/$name" -o "$work/$name" ||
    fail "the Hallvi archive could not be downloaded."
  if [ -n "$expected_size" ]; then
    actual_size=$(wc -c < "$work/$name" | tr -d ' ')
    [ "$actual_size" = "$expected_size" ] ||
      fail "the archive is $actual_size bytes and the signed manifest says $expected_size. Nothing was installed."
  fi
  [ "$(sha256_of "$work/$name")" = "$expected" ] ||
    fail "the archive does not match the checksum in the signed manifest. Nothing was installed."
  say "The archive matches the signed manifest."
fi

# ------------------------------------------------------------------ install

folder=${name%.tgz}
tar -xzf "$work/$name" -C "$work" ||
  fail "the archive could not be unpacked."
[ -f "$work/$folder/install.sh" ] ||
  fail "the archive is missing its installer."

# The fallback signature check, where the host could not do it itself.
if [ "$verified_how" = "a signature checked with code from the archive itself" ]; then
  [ -x "$work/$folder/node/bin/node" ] ||
    fail "the archive has no Node.js runtime to check the signature with."
  verdict=0
  HALLVI_RELEASE_KEY="$release_key_base64" \
    "$work/$folder/node/bin/node" --input-type=module -e '
      import { readFileSync } from "node:fs";
      // `node -e` has no script path, so the arguments start at argv[1].
      // Reading from argv[2] pointed dir at the work directory and left work
      // undefined, and this whole check failed before it verified anything.
      const [, dir, work] = process.argv;
      const { verifyManifest, trustedKeys } = await import(
        `${dir}/scripts/release-trust.mjs`
      );
      try {
        verifyManifest({
          bytes: readFileSync(`${work}/hallvi-release.json`),
          signature: readFileSync(`${work}/hallvi-release.json.sig`, "utf8").trim(),
          channel: "alpha",
          keys: trustedKeys().keys,
        });
      } catch (error) {
        // 2 is "the signature is wrong", anything else is "the check could not
        // run". Reporting both as a bad signature is what hid an installer that
        // never reached the signature at all.
        process.stderr.write(`${error?.message ?? error}\n`);
        process.exit(2);
      }
    ' "$work/$folder" "$work" >/dev/null 2>&1 || verdict=$?
  # `set -e` would end the script on the failing command itself, before the
  # status could be read, and both failures below would exit saying nothing at
  # all. The `||` is what keeps them reachable.
  [ "$verdict" -eq 0 ] ||
    if [ "$verdict" -eq 2 ]; then
      fail "the release manifest is not signed by the Hallvi release key. Nothing was installed."
    else
      fail "the release manifest's signature could not be checked on this machine. Nothing was installed."
    fi
  say "The release manifest is signed by the Hallvi release key."
fi

say "Verified by $verified_how, over HTTPS from github.com."
sh "$work/$folder/install.sh"
