#!/bin/sh
# Installs or upgrades Hallvi for the current user from a verified, unpacked
# platform archive. The outer install-hallvi.sh checks the archive checksum.
#
#   program   ~/.local/lib/hallvi     replaced on every install
#   command   ~/.local/bin/hallvi
#   state     ~/.local/share/hallvi   never touched by install or uninstall
#   model     ~/.config/hallvi/pi     never touched by install or uninstall
#
# Node.js and native dependencies are already inside this platform archive.
set -eu

source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
home="$HOME/.local/lib/hallvi"
bin="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }
fail() { printf 'install: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) os=darwin; platform=darwin-arm64 ;;
  Linux-x86_64 | Linux-amd64) os=linux; platform=linux-x64 ;;
  *) fail "supported releases target Apple-silicon macOS and Ubuntu 24.04 x64." ;;
esac
[ "$(id -u)" -ne 0 ] || fail "run as your ordinary user, without sudo."
[ -x "$source_dir/node/bin/node" ] || fail "the archive has no Node.js runtime."
[ -d "$source_dir/node_modules" ] || fail "the archive has no dependencies."
archive_platform=$("$source_dir/node/bin/node" -e 'console.log(require(process.argv[1]).platform)' "$source_dir/dist/release.json")
[ "$archive_platform" = "$platform" ] ||
  fail "this archive targets $archive_platform, not $platform."
if [ "$os" = linux ] && ! command -v systemctl >/dev/null 2>&1; then
  fail "the background service needs systemd, which this machine does not have."
fi

[ -f "$source_dir/scripts/serve.mjs" ] ||
  fail "run this from the unpacked Hallvi archive."

is_installation() {
  [ -x "$1/node/bin/node" ] &&
    [ -f "$1/app/scripts/cli.mjs" ] &&
    [ -f "$1/app/dist/release.json" ]
}

require_installation() {
  path=$1
  name=$2
  if [ -e "$path" ] || [ -L "$path" ]; then
    [ -d "$path" ] && is_installation "$path" ||
      fail "$path is not a $name installation; nothing was replaced."
  fi
}

# Ask the service manager, not the old command: a command that cannot run
# would otherwise read as "not running" and lose its program while serving.
require_installation "$home" "Hallvi"
if [ "$os" = darwin ]; then
  running=no
  for attempt in 1 2 3; do
    if launchctl print "gui/$(id -u)/com.hallvi" >/dev/null 2>&1; then
      running=yes
      break
    fi
    [ -f "$HOME/Library/LaunchAgents/com.hallvi.plist" ] || break
    [ "$attempt" = 3 ] || sleep 1
  done
  # `hallvi stop` removes its plist. If it remains but launchctl cannot
  # confirm the job, avoid replacing a possibly serving program.
  if [ "$running" = no ] &&
    [ -f "$HOME/Library/LaunchAgents/com.hallvi.plist" ]; then
    fail "cannot confirm the existing Mac service state; retry from the logged-in user's session."
  fi
else
  { systemctl --user is-enabled hallvi.service >/dev/null 2>&1 ||
    systemctl --user is-active --quiet hallvi.service; } &&
    running=yes || running=no
fi
was_running=$running
upgrade=no
[ -d "$home" ] && upgrade=yes

mkdir -p "$HOME/.local/lib" "$bin"
staging=$(mktemp -d "$HOME/.local/lib/hallvi.installing.XXXXXX")
backup=""
committed=no
stopped=no
cleanup() {
  result=$?
  trap - EXIT
  if [ "$committed" = no ] && [ -n "$backup" ] && [ -d "$backup" ]; then
    if [ -d "$home" ] && is_installation "$home"; then rm -rf "$home"; fi
    if [ ! -e "$home" ]; then
      mv "$backup" "$home"
      if [ "$was_running" = yes ]; then "$bin/hallvi" start || :; fi
      say "The previous Hallvi program was restored."
    else
      say "Could not restore automatically; previous program is at $backup" >&2
    fi
  elif [ "$committed" = no ] && [ "$stopped" = yes ] &&
    [ "$was_running" = yes ] && is_installation "$home"; then
    "$bin/hallvi" start || :
  fi
  [ -z "${staging:-}" ] || rm -rf "$staging"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
say "Preparing prebuilt Hallvi for $platform"
cp -RP "$source_dir/." "$staging/"
mkdir "$staging/app"
for part in .next node_modules package.json package-lock.json next.config.ts scripts dist; do
  mv "$staging/$part" "$staging/app/$part"
done
rm "$staging/install.sh"
(
  cd "$staging/app"
  "$staging/node/bin/node" --input-type=module -e "import Database from 'better-sqlite3'; import pty from 'node-pty'; new Database(':memory:').close(); pty.spawn('/bin/sh', ['-c', 'exit'], {})"
) >/dev/null 2>&1 || fail "prebuilt native dependencies cannot load on this machine."

# Refuse an incompatible archive while the current version is still intact and
# serving. The check only reads an existing database; a new installation has
# nothing to check yet.
say "Checking the controller database"
"$staging/node/bin/node" "$staging/app/scripts/serve.mjs" --check-installed

# Everything that can fail has happened. Only now does a running service stop,
# so a failed upgrade leaves the old one serving. Its state is elsewhere and is
# not touched.
if [ "$running" = yes ]; then
  "$bin/hallvi" stop || {
    if [ "$os" = darwin ]; then
      launchctl bootout "gui/$(id -u)/com.hallvi" ||
        fail "Hallvi could not be stopped; nothing was replaced."
    else
      systemctl --user disable --now hallvi.service ||
        fail "Hallvi could not be stopped; nothing was replaced."
    fi
  }
  if [ "$os" = darwin ]; then
    ! launchctl print "gui/$(id -u)/com.hallvi" >/dev/null 2>&1 ||
      fail "Hallvi is still running; nothing was replaced."
  else
    ! systemctl --user is-active --quiet hallvi.service ||
      fail "Hallvi is still running; nothing was replaced."
  fi
  stopped=yes
fi
if [ "$upgrade" = yes ]; then
  backup=$(mktemp -d "$HOME/.local/lib/hallvi.previous.XXXXXX")
  rmdir "$backup"
  mv "$home" "$backup"
fi
mv "$staging" "$home"
staging=""

cat >"$bin/hallvi" <<EOF
#!/bin/sh
exec "$home/node/bin/node" "$home/app/scripts/cli.mjs" "\$@"
EOF
chmod +x "$bin/hallvi"

# A new installation starts. An upgrade returns to the state it found.
if [ "$upgrade" = no ] || [ "$was_running" = yes ]; then
  "$bin/hallvi" start ||
    fail "Hallvi did not become ready; check hallvi logs."
else
  say "Installed. Hallvi was stopped before and stays stopped: hallvi start"
fi
committed=yes
if [ -n "$backup" ]; then rm -rf "$backup"; backup=""; fi

if [ "$upgrade" = no ]; then
  browser_url=$("$bin/hallvi" url)
  if [ -n "${SSH_CONNECTION:-}" ] ||
    { [ "$os" = linux ] && [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; }; then
    say "Hallvi is ready on this machine. To continue in your laptop browser:"
    say "  $bin/hallvi remote $(id -un)@server-address"
    say "Follow its SSH instructions, then open $browser_url on the laptop."
  elif [ "$os" = darwin ]; then
    open "$browser_url" || say "Open $browser_url in your browser."
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$browser_url" >/dev/null 2>&1 ||
      say "Open $browser_url in your browser."
  fi
fi

case ":$PATH:" in
  *":$bin:"*) ;;
  *) say "Add $bin to your PATH to run 'hallvi' by name." ;;
esac
