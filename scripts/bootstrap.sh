#!/bin/sh
# One entry point for a supplied, platform-specific release archive and its
# matching checksum. An HTTPS archive URL works once a release is distributed.
set -eu

fail() { printf 'Hallvi install: %s\n' "$*" >&2; exit 1; }
usage() { printf 'Usage: sh install-hallvi.sh <archive.tgz or HTTPS archive URL>\n'; }
case "${1:-}" in
  -h | --help) usage; exit 0 ;;
  "") usage >&2; exit 1 ;;
esac
[ "$#" -eq 1 ] || fail "supply one archive."
[ "$(id -u)" -ne 0 ] || fail "run as your ordinary user, without sudo."

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
for tool in tar ssh; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is required."
done

input=$1
name=${input##*/}
case "$name" in
  hallvi-*-"$platform".tgz) ;;
  *) fail "expected a hallvi-<version>-$platform.tgz release." ;;
esac
work=$(mktemp -d "${TMPDIR:-/tmp}/hallvi-install.XXXXXXXX") ||
  fail "could not create a temporary directory."
trap 'rm -rf "$work"' EXIT
trap 'exit 1' HUP INT TERM

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
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$work/$name" | awk '{ print $1 }')
else
  actual=$(shasum -a 256 "$work/$name" | awk '{ print $1 }')
fi
[ "$actual" = "$expected" ] || fail "the archive failed checksum verification."

folder=${name%.tgz}
tar -xzf "$work/$name" -C "$work" ||
  fail "the verified archive could not be unpacked."
[ -f "$work/$folder/install.sh" ] ||
  fail "the archive is missing its installer."
sh "$work/$folder/install.sh"
