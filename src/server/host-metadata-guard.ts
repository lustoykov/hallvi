// Hetzner's cloud firewall does not filter metadata traffic. Install on the
// managed host before any repository build or application process is started.
// Host root retains metadata for cloud-init. Containers and other host users
// cannot read it.
export const metadataGuardScript = `#!/bin/sh
set -eu
iptables -C DOCKER-USER -d 169.254.169.254/32 -j REJECT 2>/dev/null || iptables -I DOCKER-USER 1 -d 169.254.169.254/32 -j REJECT
iptables -C OUTPUT -d 169.254.169.254/32 -m owner ! --uid-owner 0 -j REJECT 2>/dev/null || iptables -I OUTPUT 1 -d 169.254.169.254/32 -m owner ! --uid-owner 0 -j REJECT
[ ! -d /var/lib/cloud/instances ] || chmod 700 /var/lib/cloud/instances
`;
export const metadataGuardDropIn = `[Service]
ExecStartPost=/usr/local/sbin/server-guy-metadata-guard
`;
export const installMetadataGuard = `set -eu
install -d -m 755 /etc/systemd/system/docker.service.d
cat > /usr/local/sbin/server-guy-metadata-guard <<'SG_GUARD_SCRIPT'
${metadataGuardScript}SG_GUARD_SCRIPT
chmod 700 /usr/local/sbin/server-guy-metadata-guard
cat > /etc/systemd/system/docker.service.d/server-guy-metadata.conf <<'SG_GUARD_UNIT'
${metadataGuardDropIn}SG_GUARD_UNIT
systemctl daemon-reload
/usr/local/sbin/server-guy-metadata-guard
`;
