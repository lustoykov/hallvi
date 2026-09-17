#!/bin/sh
# Installs or upgrades Haldur for the current user, from the unpacked
# archive this file sits in. Nothing here needs root.
#
#   program   ~/.local/lib/haldur     replaced on every install
#   command   ~/.local/bin/haldur
#   state     ~/.local/share/haldur   never touched by install or uninstall
#   model     ~/.config/haldur/pi     never touched by install or uninstall
#
# Haldur was called Server Guy. Installing over a Server Guy installation stops
# and replaces its service, command and program; its state and model account
# stay in ~/.local/share/server-guy and ~/.config/server-guy/pi, where Haldur
# finds them.
#
# Node.js is downloaded into the program directory rather than taken from the
# machine: a background service does not see a shell's version manager, and the
# two native modules must be built against the Node that will load them.
set -eu

NODE_MAJOR=24
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
home="$HOME/.local/lib/haldur"
bin="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }
fail() { printf 'install: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "Haldur installs on macOS and Linux." ;;
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
  fail "run this from the unpacked Haldur archive."

# Ask the service manager, not the old command: a command that cannot run
# would otherwise read as "not running" and lose its program while serving.
legacy_home="$HOME/.local/lib/server-guy"
if [ "$os" = darwin ]; then
  launchctl print "gui/$(id -u)/com.haldur" >/dev/null 2>&1 &&
    running=yes || running=no
  launchctl print "gui/$(id -u)/com.server-guy" >/dev/null 2>&1 &&
    legacy_running=yes || legacy_running=no
else
  systemctl --user is-enabled haldur.service >/dev/null 2>&1 &&
    running=yes || running=no
  systemctl --user is-enabled server-guy.service >/dev/null 2>&1 &&
    legacy_running=yes || legacy_running=no
fi
was_running=$running
[ "$legacy_running" = yes ] && was_running=yes
upgrade=no
if [ -d "$home" ] || [ -d "$legacy_home" ]; then upgrade=yes; fi

staging="$home.installing"
rm -rf "$staging"
mkdir -p "$staging/app" "$bin"

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

say "Copying Haldur"
cp -RP "$source_dir/." "$staging/app/"
rm -f "$staging/app/install.sh"

say "Installing dependencies (this compiles two native modules)"
(
  cd "$staging/app"
  PATH="$staging/node/bin:$PATH" npm ci --omit=dev --no-audit --no-fund --no-update-notifier \
    --loglevel=error
)

# Everything that can fail has happened. Only now does a running service stop,
# so a failed upgrade leaves the old one serving. Its state is elsewhere and is
# not touched.
if [ "$running" = yes ]; then
  "$bin/haldur" stop || {
    if [ "$os" = darwin ]; then
      launchctl bootout "gui/$(id -u)/com.haldur" || true
    else
      systemctl --user disable --now haldur.service || true
    fi
  }
fi
# The same program under its former name. Its state is not touched.
if [ "$legacy_running" = yes ]; then
  if [ "$os" = darwin ]; then
    launchctl bootout "gui/$(id -u)/com.server-guy" || true
    # bootout returns before the job is gone, and the old worker still holds
    # the database lock the new one needs.
    for _ in $(seq 100); do
      launchctl print "gui/$(id -u)/com.server-guy" >/dev/null 2>&1 || break
      sleep 0.2
    done
    ! launchctl print "gui/$(id -u)/com.server-guy" >/dev/null 2>&1 ||
      fail "Server Guy did not stop in time and was not replaced. Run install.sh again, then: haldur start"
  else
    systemctl --user disable --now server-guy.service || true
  fi
fi
rm -f "$HOME/Library/LaunchAgents/com.server-guy.plist" \
  "$HOME/.config/systemd/user/server-guy.service" "$bin/server-guy"
[ "$os" = linux ] && systemctl --user daemon-reload || true
rm -rf "$legacy_home"

rm -rf "$home"
mv "$staging" "$home"

cat >"$bin/haldur" <<EOF
#!/bin/sh
exec "$home/node/bin/node" "$home/app/scripts/cli.mjs" "\$@"
EOF
chmod +x "$bin/haldur"

# A new installation starts. An upgrade returns to the state it found.
if [ "$upgrade" = no ] || [ "$was_running" = yes ]; then
  "$bin/haldur" start ||
    say "Installed, but Haldur is not answering yet: haldur logs"
else
  say "Installed. Haldur was stopped before and stays stopped: haldur start"
fi

case ":$PATH:" in
  *":$bin:"*) ;;
  *) say "Add $bin to your PATH to run 'haldur' by name." ;;
esac
