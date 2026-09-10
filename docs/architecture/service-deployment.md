# Service-based deployment

10 September 2026. This is the first deployment generalization slice. It extends the existing one-host Compose executor; it does not introduce a plugin runtime or a second deployment engine.

## What changes

A primary HTTP service remains `app`. Up to five private companions declare `role`, an `image` or `imageFrom: "app"`, their existing command, environment, owned volumes and configuration. Image references are pinned before recommendation. Sharing `app` means sharing the exact image bytes; source builds run once before the stack starts. An image-based primary can also be shared.

The role describes responsibility, not health. Web services can use private HTTP checks. Workers, brokers and any other service can use an existing container-local readiness command. New worker/broker declarations must include a readiness check. Startup dependencies name another service and require either startup or a passing container health check; validation rejects missing targets and cycles.

```text
Source revision ── build once ── image ── app    ──┐
                                   └── worker ──┤── private queue
                                                │
POST synthetic job → GET completed result → DELETE that exact job
```

Connections use Compose service names in ordinary configuration. `inputBindings` maps a privately supplied value to a particular service variable; multiple consumers can reference one input. `{service: "worker", variable: "DATABASE_URL", connection: "postgres"}` reuses the controller-managed PostgreSQL connection without placing its generated password in the plan. No general string interpolation language or application-specific connection registry is needed.

GET behavior checks can opt into `waitSeconds` (1–30) for asynchronous results. POST and DELETE cannot opt into retries. The existing unique-marker, captured-ID and cleanup protocol remains mandatory for mutating verification. A failed or timed-out result check still attempts cleanup of only its owned test object. A readiness command proves only the condition it checks; successful job processing needs a separate application-level result assertion.

## Release, host and attempt

A release identifies the selected repository revision and approved plan, including pinned external images and secret **references**, not supplied secret values. Its content hash excludes host address, spending approval, attempt ID and outcome. New recommendations persist this identity; execution refuses a changed plan/revision before provisioning. The managed PostgreSQL shortcut retains its legacy version tags; observed image IDs are recorded and checked on recreation. Source Dockerfile base images are not automatically pinned, so release identity is not a reproducible-build guarantee. Legacy records project a release from their saved data without rewriting them.

The existing Deployment record still stores the host assignment and initial attempt. This PR separates release identity from that mutable state, but **does not yet create independent host records, support BYOM, or schedule subsequent releases**. The [next lifecycle slice](deployment-lifecycle.md) records distinct retry/recreation attempts, the stable host binding and timestamped runtime evidence. Subsequent release execution remains separate work. Changing a secret value is not yet a versioned configuration release.

## Compatibility and evidence

Optional fields preserve the legacy plan format. Regression fixtures compare exact Compose serialization against the executor at `10880c7` for source + PostgreSQL, an image with SQLite, and Grafana/Prometheus. No defaults are inserted into old plans. Recreation continues using the stored host bundle and its hashes, with no pull/build or data-volume deletion.

The Processes view reads explicit roles, dependencies and per-service timestamped readiness. These are historical deployment observations, separate from live monitoring. A partial set of observations cannot label the whole stack healthy, and a failing companion cannot hide behind another companion's passing check. Non-SQLite database volumes remain visible as state with an unsupported consistency procedure; this does not enable their backups.

## Concrete proof

`tests/fixtures/queue-worker` contains a synthetic Python HTTP service and worker using the same source image and an authenticated private Valkey broker. It uses only Python's standard library. The web process enqueues a unique job; only the worker writes its processed result.

Run the opt-in integration proof:

```sh
SG_RUN_DOCKER_PROOF=1 npm test -- tests/application/integration/service-deployment-docker.test.ts
```

The proof uses the production Compose generator, startup command, image/readiness verification and HTTP behavior verifier. It substitutes local Docker command transport for SSH and an ephemeral loopback HTTP port for port 80. It verifies image sharing, job completion, cleanup, pending work surviving retained-volume recreation, a stopped-worker failure and recovery. Containers target Linux amd64; fixture resources are removed afterward. It uses synthetic credentials, not real application/controller state. Normal `npm test` skips this Docker-dependent test.

This does **not** test a new provider purchase, host bootstrap, the model's repository-planning quality, production queue delivery guarantees, or queue backup/restore. Those are separate evidence requirements.

## Remaining deployment limits

- One primary HTTP entry point and one Linux Compose host. No worker-only stack or multiple public routes.
- One source build reused by companions, or pinned Docker Hub images. No separate source builds per service, custom registries or architectures.
- No scheduled-command executor, explicit migration-attempt lifecycle, subsequent release/rollback execution or BYOM adoption.
- Persistent volumes still have one declared owner; sharing a writable volume across web and worker is not represented yet. Applications that need this must be blocked rather than given separate, inconsistent copies.
- No public auxiliary ports, host bind mounts, privileged containers or Docker socket access.
- Readiness commands run within the approved container's existing access. They are not an independent sandbox for arbitrary plugin code, nor continuous monitoring.
- An application must already expose a safe way to exercise asynchronous behavior. Missing APIs are reported as a limitation; the executor never patches business logic.

These limits describe core capabilities to add when a concrete in-scope application needs them. Plugins are for specialised application knowledge and protocols, not per-application workarounds for missing core deployment machinery.
