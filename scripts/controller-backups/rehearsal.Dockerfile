FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 build-essential restic openssh-client ca-certificates curl && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/server-guy
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN npx playwright install --with-deps chromium
RUN npm run build
ARG REHEARSAL_UID=501
ARG REHEARSAL_GID=20
RUN (getent group "$REHEARSAL_GID" || groupadd -g "$REHEARSAL_GID" recovery) && useradd -u "$REHEARSAL_UID" -g "$REHEARSAL_GID" -m recovery && chown -R "$REHEARSAL_UID:$REHEARSAL_GID" /opt/server-guy
USER recovery
ENV HOME=/home/recovery
CMD ["npm", "run", "start", "--", "--port", "3270"]
