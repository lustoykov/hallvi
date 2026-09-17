#!/bin/sh
# Installs or upgrades Server Guy for the current user, from the unpacked
# archive this file sits in. Nothing here needs root.
#
#   program   ~/.local/lib/server-guy     replaced on every install
#   command   ~/.local/bin/server-guy
#   state     ~/.local/share/server-guy   never touched by install or uninstall
#   model     ~/.config/server-guy/pi     never touched by install or uninstall
#
# Node.js is downloaded into the program directory rather than taken from the
# machine: a background service does not see a shell's version manager, and the
# two native modules must be built against the Node that will load them.
set -eu

NODE_MAJOR=24
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
home="$HOME/.local/lib/server-guy"
bin="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }
fail() { printf 'install: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "Server Guy installs on macOS and Linux." ;;
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
  fail "run this from the unpacked Server Guy archive."

# A running service keeps files open in the program directory it is about to
# lose. Its state is elsewhere and is not touched.
was_running=no
if [ -x "$bin/server-guy" ] && "$bin/server-guy" status --quiet; then
  was_running=yes
  "$bin/server-guy" stop
fi

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

say "Copying Server Guy"
(cd "$source_dir" && tar -cf - --exclude ./install.sh .) |
  tar -xf - -C "$staging/app"

say "Installing dependencies (this compiles two native modules)"
(
  cd "$staging/app"
  PATH="$staging/node/bin:$PATH" npm ci --omit=dev --no-audit --no-fund --no-update-notifier \
    --loglevel=error
)

rm -rf "$home"
mv "$staging" "$home"

cat >"$bin/server-guy" <<EOF
#!/bin/sh
exec "$home/node/bin/node" "$home/app/scripts/cli.mjs" "\$@"
EOF
chmod +x "$bin/server-guy"

# A first installation starts. An upgrade returns to the state it found.
if [ "$was_running" = yes ] || [ ! -d "$HOME/.local/share/server-guy" ]; then
  "$bin/server-guy" start
else
  say "Installed. Server Guy was stopped before and stays stopped: server-guy start"
fi

case ":$PATH:" in
  *":$bin:"*) ;;
  *) say "Add $bin to your PATH to run 'server-guy' by name." ;;
esac
