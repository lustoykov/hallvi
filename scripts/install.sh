#!/bin/sh
# Installs or upgrades Hallvi for the current user from a verified, unpacked
# platform archive. The outer install-hallvi.sh checks the archive checksum.
#
#   program   ~/.local/lib/hallvi     replaced on every install
#   command   ~/.local/bin/hallvi
#   state     ~/.local/share/hallvi   never touched by install or uninstall,
#                                       except a first remote port (below)
#   model     ~/.config/hallvi/pi     never touched by install or uninstall
#
# Node.js and native dependencies are already inside this platform archive.
set -eu

source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
home="$HOME/.local/lib/hallvi"
bin="$HOME/.local/bin"
data="${HALLVI_DATA_DIR:-$HOME/.local/share/hallvi}"

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
migrated=""
committed=no
stopped=no
# Stops the service and does not return success until the service manager
# agrees it is gone. A start that reported failure can still have left a
# process serving, and both managers restart what they own; replacing a
# database out from under one is the thing this exists to prevent.
service_is_gone() {
  if [ "$os" = darwin ]; then
    ! launchctl print "gui/$(id -u)/com.hallvi" >/dev/null 2>&1
  else
    ! systemctl --user is-enabled hallvi.service >/dev/null 2>&1 &&
      ! systemctl --user is-active --quiet hallvi.service
  fi
}

ensure_stopped() {
  service_is_gone && return 0
  "$bin/hallvi" stop >/dev/null 2>&1 || :
  if [ "$os" = darwin ]; then
    launchctl bootout "gui/$(id -u)/com.hallvi" >/dev/null 2>&1 || :
  else
    systemctl --user disable --now hallvi.service >/dev/null 2>&1 || :
  fi
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    service_is_gone && return 0
    attempt=$((attempt + 1))
    sleep 1
  done
  return 1
}

restore_records() {
  # Putting the old program back is not a rollback once its database has been
  # migrated under it: it would refuse the schema it now finds, correctly.
  # Copying the backup back is, and it needs no program to do it.
  [ -n "$migrated" ] && [ -f "$migrated/hallvi.db" ] || return 0
  if ! ensure_stopped; then
    say "Hallvi is still running; the records were left alone. The copy taken before the upgrade is at $migrated" >&2
    return 0
  fi
  # The migrator's own restore is the one that checks the copy against the
  # schema it claims and stages it before replacing anything. Use it wherever
  # a program that has it is still on disk — after the swap that is the new
  # one, before the swap it is the unpacked archive.
  for candidate in "$home" "$staging"; do
    [ -n "$candidate" ] || continue
    [ -x "$candidate/node/bin/node" ] || continue
    [ -f "$candidate/app/scripts/migrate-state.mjs" ] || continue
    if "$candidate/node/bin/node" \
      "$candidate/app/scripts/migrate-state.mjs" --restore "$migrated"; then
      migrated=""
      return 0
    fi
    # It read the copy and refused it. This is the only thing here that checks a
    # backup against the schema it claims, so putting the same file into place by
    # hand would install exactly what it just rejected. Leave both untouched and
    # say where the copy is.
    say "The copy of your records was refused, so it was not put back. Your records are as the upgrade left them, and the copy is at $migrated" >&2
    return 0
  done
  # Nothing on disk to run it with. There was a hand copy here once, for
  # exactly this case; it is gone, because the only thing it could do is put a
  # file nobody checked over the records — and it could only ever run when the
  # installation was already in a state where that is the last thing to do.
  say "No Hallvi on this machine can check the copy, so the records were left alone. The copy taken before the upgrade is at $migrated" >&2
}
cleanup() {
  result=$?
  trap - EXIT
  # Nothing is replaced while anything might still be writing. This only
  # applies when there is something to undo: a failure before anything was
  # touched must leave a working service exactly as it found it.
  recovery_stopped=yes
  if [ "$committed" = no ] && { [ -n "$migrated" ] || [ -n "$backup" ]; }; then
    ensure_stopped || recovery_stopped=no
  fi
  restore_records
  if [ "$recovery_stopped" = no ] && [ -n "$backup" ] && [ -d "$backup" ]; then
    # Swapping the program directory while something may still be writing to it
    # turns one failed upgrade into two broken installations. Keep both versions
    # and let a person decide.
    say "Hallvi could not be stopped, so the program was left as it is. This version is at $home and the previous one is at $backup" >&2
  elif [ "$committed" = no ] && [ -n "$backup" ] && [ -d "$backup" ]; then
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
"$staging/node/bin/node" "$staging/app/scripts/cli.mjs" >/dev/null ||
  fail "the archive's command cannot load; nothing was replaced."

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
# The records move to the schema this archive needs while nothing is running
# and the old program is still in place, so a refusal here costs nothing. The
# migration backs itself up first and prints where; if anything after this
# fails, cleanup puts both the records and the program back.
if [ "$upgrade" = yes ]; then
  say "Checking the schema of the records"
  # The output is read before the exit status is acted on: the copy is made,
  # and its location printed, before anything is migrated, so a failure that
  # happens afterwards must still leave cleanup knowing where to go back to.
  migration_ok=yes
  migration_output=$("$staging/node/bin/node" \
    "$staging/app/scripts/migrate-state.mjs" --apply --data "$data" 2>&1) ||
    migration_ok=no
  printf '%s\n' "$migration_output"
  migrated=$(printf '%s\n' "$migration_output" |
    sed -n 's/^Backed up to //p' | tail -1)
  [ "$migration_ok" = yes ] ||
    fail "the records could not be migrated; nothing was replaced."
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

# Where Hallvi will be used decides which address to hand over, and nothing
# here can know it: a Mac mini has a desktop and is still used from a laptop.
# So a new installation asks once. Being signed in over SSH, or having no
# display, only chooses which answer Enter gives. HALLVI_USE=here|remote
# answers for a scripted installation.
use=${HALLVI_USE:-}
if [ "$upgrade" = no ] && [ -z "$use" ]; then
  if [ -n "${SSH_CONNECTION:-}" ] ||
    { [ "$os" = linux ] && [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; }; then
    use=remote
  else
    use=here
  fi
  if ( : <>/dev/tty ) 2>/dev/null; then
    {
      say ""
      say "Where will you use Hallvi?"
      say "  It only listens on this computer, so another computer reaches it"
      say "  through a private SSH connection."
      say "  1) On this computer"
      say "  2) From another computer"
      printf 'Choose 1 or 2 [%s]: ' "$([ "$use" = remote ] && echo 2 || echo 1)"
    } >/dev/tty
    read -r answer </dev/tty || answer=""
    case "$answer" in
      1) use=here ;;
      2) use=remote ;;
    esac
  fi
fi

# A computer that uses Hallvi remotely often runs one of its own, and ssh
# refuses the whole connection when one forwarded port is taken. A remote
# installation therefore starts on its own ports, which also makes its address
# differ from a local one. An existing choice is never replaced.
settings="$data/hallvi.env"
if [ "$upgrade" = no ] && [ "$use" = remote ] &&
  ! grep -q '^HALLVI_PORT=' "$settings" 2>/dev/null; then
  mkdir -p "$(dirname "$settings")"
  chmod 700 "$(dirname "$settings")"
  printf 'HALLVI_PORT=5747\n' >>"$settings"
  chmod 600 "$settings"
fi

# A new installation starts. An upgrade returns to the state it found.
if [ "$upgrade" = no ] || [ "$was_running" = yes ]; then
  "$bin/hallvi" start ||
    fail "Hallvi did not become ready; check hallvi logs."
else
  say "Installed. Hallvi was stopped before and stays stopped: hallvi start"
fi
committed=yes
# Kept, not deleted: this is the only way back to the schema it came from, and
# the old program archive alone cannot provide it.
if [ -n "$migrated" ]; then
  say "The records before this upgrade are kept at $migrated"
  migrated=""
fi
if [ -n "$backup" ]; then rm -rf "$backup"; backup=""; fi

if [ "$upgrade" = no ]; then
  browser_url=$("$bin/hallvi" url)
  if [ "$use" = remote ]; then
    say ""
    "$bin/hallvi" remote
    say ""
    say "See this again any time: $bin/hallvi remote"
  elif [ "$os" = darwin ]; then
    open "$browser_url" || say "Open $browser_url in your browser."
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$browser_url" >/dev/null 2>&1 ||
      say "Open $browser_url in your browser."
  else
    say "Open $browser_url in your browser."
  fi
fi

case ":$PATH:" in
  *":$bin:"*) ;;
  *) say "Add $bin to your PATH to run 'hallvi' by name." ;;
esac
