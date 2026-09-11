# Rig B host: stands in for the provider's server when a proof needs a real
# Linux host (systemd timers and units, Docker Engine with Compose, Python
# for the backup runner, host paths for volume data). Runs privileged with
# systemd as PID 1; the application's containers run in its own dockerd.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends \
      systemd systemd-sysv dbus docker.io docker-compose-v2 python3 \
      python3-venv ca-certificates curl openssl util-linux iproute2 \
 && rm -rf /var/lib/apt/lists/* \
 && systemctl enable docker \
 && systemctl mask getty@tty1.service systemd-logind.service \
      systemd-binfmt.service proc-sys-fs-binfmt_misc.mount \
      proc-sys-fs-binfmt_misc.automount
# binfmt_misc is one table for the whole machine: systemd-binfmt in a
# privileged container would erase the engine's amd64 emulation for every
# other container. It stays masked.
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]
