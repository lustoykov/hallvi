import type { NativeConfiguration } from "../../../src/server/deployment-release";

/**
 * The queue-worker fixture as a resolved native release: a built web service,
 * a worker running its image, and a private Valkey broker with a persistent
 * volume and one private input. The shape the pinned resolver retains.
 */
export function queueNative(
  deploymentId: string,
  revision: string,
): NativeConfiguration {
  const project = `sg-${deploymentId.slice(0, 8)}`;
  const image = `server-guy-${deploymentId}-app:${revision}`;
  const labels = {
    "server-guy.revision": revision,
    "server-guy.deployment": deploymentId,
  };
  const environment = {
    QUEUE_HOST: "queue",
    QUEUE_PASSWORD: "${QUEUE_PASSWORD}",
  };
  const healthy = { queue: { condition: "service_healthy", required: true } };
  return {
    format: 1,
    resolver: "docker compose 2.40.3",
    compose: ["compose.yaml", ".server-guy/override.compose.json"],
    files: [],
    resolved: {
      name: project,
      services: {
        app: {
          image,
          build: { context: ".", dockerfile: "Dockerfile" },
          command: ["python", "app.py", "web"],
          ports: [{ target: 8080, published: "80", protocol: "tcp" }],
          environment,
          labels,
          depends_on: healthy,
        },
        worker: {
          image,
          command: ["python", "app.py", "worker"],
          environment,
          labels,
          healthcheck: { test: ["CMD", "python", "app.py", "ready"] },
          depends_on: healthy,
        },
        queue: {
          image: `valkey/valkey:8.1.3-alpine@sha256:${"c".repeat(64)}`,
          command: [
            "sh",
            "-c",
            'exec valkey-server --requirepass "$$QUEUE_PASSWORD" --appendonly yes',
          ],
          environment: { QUEUE_PASSWORD: "${QUEUE_PASSWORD}" },
          labels,
          healthcheck: {
            test: [
              "CMD",
              "sh",
              "-c",
              'REDISCLI_AUTH="$$QUEUE_PASSWORD" valkey-cli ping | grep -qx PONG',
            ],
          },
          volumes: [{ type: "volume", source: "queue-data", target: "/data" }],
        },
      },
      volumes: { "queue-data": { name: `${project}_queue-data` } },
    },
    inputs: ["QUEUE_PASSWORD"],
    inputReasons: { QUEUE_PASSWORD: "Private broker authentication" },
    data: [{ volume: "queue-data", kind: "database", sqlite: null }],
    database: null,
    httpAccess: "public",
    criterion: {
      healthPath: "/health",
      checks: [
        {
          name: "Home content",
          method: "GET",
          path: "/",
          body: null,
          expectedStatus: 200,
          contains: "Background job fixture",
          captureId: null,
        },
        {
          name: "Submit synthetic job",
          method: "POST",
          path: "/jobs",
          body: { message: "SG_VERIFY_TOKEN" },
          expectedStatus: 201,
          contains: "SG_VERIFY_TOKEN",
          captureId: "id",
        },
        {
          name: "Worker processed the job",
          method: "GET",
          path: "/jobs/{id}",
          body: null,
          expectedStatus: 200,
          contains: "processed:SG_VERIFY_TOKEN",
          captureId: null,
          waitSeconds: 5,
        },
        {
          name: "Remove synthetic job",
          method: "DELETE",
          path: "/jobs/{id}",
          body: null,
          expectedStatus: 200,
          contains: "deleted",
          captureId: null,
        },
      ],
      services: [],
    },
    summary:
      "A web application and worker sharing one image with a private queue",
  };
}
