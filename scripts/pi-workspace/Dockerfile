FROM node:24-bookworm-slim

ARG WORKSPACE_ARCH
ARG POWERSHELL_VERSION=7.5.4
ENV PATH=/opt/microsoft/powershell/7:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin
RUN apt-get update && apt-get install -y --no-install-recommends bash git ripgrep jq curl python3 ca-certificates \
        gss-ntlmssp libicu72 libssl3 libgssapi-krb5-2 liblttng-ust1 zlib1g openssh-client \
    && rm -rf /var/lib/apt/lists/*
RUN case "$WORKSPACE_ARCH" in \
        amd64) powershell_arch=x64; powershell_sha=1fd7983fe56ca9e6233f126925edb24bf6b6b33e356b69996d925c4db94e2fef ;; \
        arm64) powershell_arch=arm64; powershell_sha=4b32d4cb86a43dfb83d5602d0294295bf22fafbf9e0785d1aaef81938cda92f8 ;; \
        *) echo "Unsupported workspace architecture: $WORKSPACE_ARCH" >&2; exit 1 ;; \
    esac \
    && mkdir -p /opt/microsoft/powershell/7 \
    && curl -fsSL "https://github.com/PowerShell/PowerShell/releases/download/v${POWERSHELL_VERSION}/powershell-${POWERSHELL_VERSION}-linux-${powershell_arch}.tar.gz" -o /tmp/powershell.tar.gz \
    && echo "${powershell_sha}  /tmp/powershell.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/powershell.tar.gz -C /opt/microsoft/powershell/7 --no-same-owner \
    && chmod 755 /opt/microsoft/powershell/7/pwsh \
    && ln -s /opt/microsoft/powershell/7/pwsh /usr/local/bin/pwsh \
    && rm /tmp/powershell.tar.gz
WORKDIR /opt/pi
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
# Use Pi's own binary installer during image preparation, never at tool runtime.
RUN PI_CODING_AGENT_DIR=/opt/pi/runtime node --input-type=module -e 'import {createFindTool} from "@earendil-works/pi-coding-agent"; await createFindTool("/opt/pi").execute("prepare-find", {pattern:"package.json",limit:1});' \
    && cp /opt/pi/runtime/bin/fd /usr/local/bin/fd \
    && rm -rf /opt/pi/runtime
# Pinned upstream Compose CLI for native configuration validation; no daemon.
RUN case "$WORKSPACE_ARCH" in \
        amd64) compose_arch=x86_64; compose_sha=dba9d98e1ba5bfe11d88c99b9bd32fc4a0624a30fafe68eea34d61a3e42fd372 ;; \
        arm64) compose_arch=aarch64; compose_sha=d26373b19e89160546d15407516cc59f453030d9bc5b43ba7faf16f7b4980137 ;; \
        *) echo "Unsupported workspace architecture: $WORKSPACE_ARCH" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "https://github.com/docker/compose/releases/download/v2.40.3/docker-compose-linux-${compose_arch}" -o /usr/local/bin/docker-compose \
    && echo "${compose_sha}  /usr/local/bin/docker-compose" | sha256sum -c - \
    && chmod 755 /usr/local/bin/docker-compose
COPY bridge.mjs ./
ENV HOME=/tmp/home PI_CODING_AGENT_DIR=/tmp/pi POWERSHELL_TELEMETRY_OPTOUT=1 LANG=C.UTF-8 LC_ALL=C.UTF-8
USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["sleep", "3600"]
