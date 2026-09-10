FROM --platform=linux/amd64 node:24-bookworm-slim AS node
FROM --platform=linux/amd64 mcr.microsoft.com/powershell:7.5-debian-12
COPY --from=node /usr/local/ /usr/local/
ENV PATH=/opt/microsoft/powershell/7:/usr/local/bin:/usr/local/sbin:/usr/sbin:/usr/bin:/sbin:/bin
RUN apt-get update && apt-get install -y --no-install-recommends bash git ripgrep jq curl python3 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/pi
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund
# Use Pi's own binary installer during image preparation, never at tool runtime.
RUN PI_CODING_AGENT_DIR=/opt/pi/runtime node --input-type=module -e 'import {createFindTool} from "@earendil-works/pi-coding-agent"; await createFindTool("/opt/pi").execute("prepare-find", {pattern:"package.json",limit:1});' \
    && cp /opt/pi/runtime/bin/fd /usr/local/bin/fd \
    && rm -rf /opt/pi/runtime
# Pinned upstream Compose CLI for native configuration validation; no daemon.
RUN curl -fsSL https://github.com/docker/compose/releases/download/v2.40.3/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose \
    && echo 'dba9d98e1ba5bfe11d88c99b9bd32fc4a0624a30fafe68eea34d61a3e42fd372  /usr/local/bin/docker-compose' | sha256sum -c - \
    && chmod 755 /usr/local/bin/docker-compose
COPY bridge.mjs ./
ENV HOME=/tmp/home PI_CODING_AGENT_DIR=/tmp/pi POWERSHELL_TELEMETRY_OPTOUT=1 LANG=C.UTF-8 LC_ALL=C.UTF-8
USER 1000:1000
WORKDIR /workspace
ENTRYPOINT ["sleep", "3600"]
