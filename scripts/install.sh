#!/bin/sh
# Installs or upgrades Hallvi for the current user, from the unpacked
# archive this file sits in. Nothing here needs root.
#
#   program   ~/.local/lib/hallvi     replaced on every install
#   command   ~/.local/bin/hallvi
#   state     ~/.local/share/hallvi   never touched by install or uninstall
#   model     ~/.config/hallvi/pi     never touched by install or uninstall
#
# Node.js is downloaded into the program directory rather than taken from the
# machine: a background service does not see a shell's version manager, and the
# two native modules must be built against the Node that will load them.
set -eu

NODE_MAJOR=24
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
home="$HOME/.local/lib/hallvi"
bin="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }
fail() { printf 'install: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "Hallvi installs on macOS and Linux." ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) fail "unsupported processor: $(uname -m)" ;;
esac

# node-pty compiles on installation, and better-sqlite3 does when it has no
# prebuilt binary for this machine.
missing=""
for tool in cc make python3 tar curl ssh; do
  command -v "$tool" >/dev/null 2>&1 || missing="$missing $tool"
done
if [ -n "$missing" ]; then
  say "Missing:$missing"
  if [ "$os" = darwin ]; then
    say "Install Apple's command line tools with: xcode-select --install"
  else
    say "On Debian or Ubuntu: sudo apt-get install -y build-essential python3 curl openssh-client"
    say "On Fedora: sudo dnf install -y gcc-c++ make python3 curl openssh-clients"
  fi
  exit 1
fi
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
  launchctl print "gui/$(id -u)/com.hallvi" >/dev/null 2>&1 &&
    running=yes || running=no
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
cleanup_staging() {
  [ -z "${staging:-}" ] || rm -rf "$staging"
}
trap cleanup_staging EXIT
trap 'exit 1' HUP INT TERM
mkdir -p "$staging/app"

say "Downloading Node.js $NODE_MAJOR for $os-$arch"
base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
sums=$(curl -fsSL "$base/SHASUMS256.txt")
file=$(printf '%s\n' "$sums" | awk -v s="-$os-$arch.tar.gz" \
  'substr($2, length($2) - length(s) + 1) == s { print $2 }')
[ -n "$file" ] || fail "nodejs.org lists no Node.js $NODE_MAJOR for $os-$arch."
curl -fsSL "$base/$file" -o "$staging/node.tar.gz"
expected=$(printf '%s\n' "$sums" | awk -v f="$file" '$2 == f { print $1 }')
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$staging/node.tar.gz" | awk '{ print $1 }')
else
  actual=$(shasum -a 256 "$staging/node.tar.gz" | awk '{ print $1 }')
fi
[ "$expected" = "$actual" ] || fail "the Node.js download did not match its checksum."
mkdir "$staging/node"
tar -xzf "$staging/node.tar.gz" -C "$staging/node" --strip-components 1
rm "$staging/node.tar.gz"

say "Copying Hallvi"
cp -RP "$source_dir/." "$staging/app/"
rm -f "$staging/app/install.sh"

say "Installing dependencies (this compiles two native modules)"
(
  cd "$staging/app"
  PATH="$staging/node/bin:$PATH" npm ci --omit=dev --no-audit --no-fund --no-update-notifier \
    --loglevel=error
)

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
fi
rm -rf "$home"
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
    say "Installed, but Hallvi is not answering yet: hallvi logs"
else
  say "Installed. Hallvi was stopped before and stays stopped: hallvi start"
fi

case ":$PATH:" in
  *":$bin:"*) ;;
  *) say "Add $bin to your PATH to run 'hallvi' by name." ;;
esac
