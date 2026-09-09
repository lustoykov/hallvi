# Single-instance runtime acceptance — 9 September 2026

This is dated evidence for the deployment/recreation slice, not certification of complete application lifecycles. Updates, HTTPS, off-host backups and restoration still need their own proof. Tests use real Hetzner hosts; the controller is local.

## Delivered boundary

A conversation can request an exact GitHub revision, including a Compose fixture in a subdirectory. The agent inspects repository evidence and proposes a constrained deployment plan. Public read-only repository intake does not require installing our GitHub App on somebody else's repository; publication still requires separate write authority.

The executor supports a source-built web container or a pinned public Docker Hub image, optional PostgreSQL, and up to five private image services. It mounts named persistent volumes and read-only configuration files, requests missing private inputs, prepares a fresh Ubuntu host, and verifies image identities and application behavior. This is a supported subset translated from Compose by the agent, not arbitrary Compose passthrough. Privileged containers, host bind mounts, arbitrary registries, multi-host orchestration and generic port publishing are not implied.

Recreation is an approved operation in the shared application queue. It compares the recorded configuration fingerprints, refuses missing named volumes, replaces containers without pulling/building images or deleting volumes, verifies accepted identities and behavior, and collects logs. The receipt is shared by chat, History and affected application views.

## Uptime Kuma — deployment and persistence passed

- Application: `adb12487-2309-4257-b18d-cc951c190f72`; deployment: `1cfd2677-1b20-4c51-9018-94f16cbf8b98`.
- Official Uptime Kuma 2.5.3 image: `louislam/uptime-kuma@sha256:c332e5ac61496258fae91483c9d2b50557cfd8e1584d98844feb9145d292c4d3`.
- Fresh Hetzner CX23, 4 GB RAM, named volume `uptime-kuma-data` at `/app/data`, SQLite at `/app/data/kuma.db`. HTTP is restricted to the controller's observed network; no HTTPS or backup claim.
- Deployment approved through the conversation card and verified at 11:41:55 UTC. Real logs appear in application History.
- The owner initialized the admin account. Using the authenticated UI, created monitor 1, **Server Guy persistence proof**, checking the application's local setup-info endpoint every 20 seconds.
- Before replacement at 11:46:39 UTC: monitor settings present, one admin account, three successful heartbeats; SQLite integrity `ok`.
- Requested recreation in the conversation and approved operation `8cd87fa5-f0e1-47d5-8a27-f8aec17d2ad4`. The executor recorded different before/after container IDs and verified the same image at 11:48:34 UTC.
- After replacement at 11:48:54 UTC: same monitor/settings/account, original heartbeat retained, ten successful heartbeats and SQLite integrity `ok`. Reloading the real UI remained authenticated and displayed healthy monitor history. Screenshots were shared in the implementation conversation.

Reproduce the read-only data checks after creating the named monitor:

```sh
node --import tsx tests/compatibility/uptime-kuma.mjs DEPLOYMENT_ID before
# Request and approve recreation in Server Guy.
node --import tsx tests/compatibility/uptime-kuma.mjs DEPLOYMENT_ID after
```

The scripts inspect SQLite through pinned SSH and avoid reading credential values. Dated local evidence is under ignored `tests/results/compatibility/`. No application database writes are used to manufacture the proof.

## Grafana + Prometheus

Fixture: [`examples/grafana-prometheus`](../../examples/grafana-prometheus/README.md), inspected from repository commit `5ecac80b7df3f6480fffe0b4c83de15609ae81c1`.

- Application: `e16000ed-2ee1-4d50-8825-19fdd24393f2`; deployment: `31760557-088f-48bb-a01b-db1adf2c624a`.
- Grafana 13.2.1: `grafana/grafana@sha256:1dec240d14e232597dce9bfa56dae55f4397b138cdc91e3ee92ac6b157e2fc49`.
- Prometheus v3.14.0: `prom/prometheus@sha256:e906cef998316bbe319f98711e1b4d8613ad37e14b08ff831d7036e77b7464f9`.
- Approved CX23 at EUR 5.99/month including IPv4, controller-restricted Grafana HTTP, no published Prometheus port. Named volumes preserve Grafana's SQLite database and Prometheus's time series. Datasource and scrape configuration files are mounted read-only.
- Initial verification stopped correctly: Grafana returned healthy HTTP 200 but pretty-printed JSON did not match the compact expected fragment. Fixed verification to also match parsed/reserialized JSON, preserving values. Retried through the UI; the same server/container was reconciled without rebuilding or another purchase. Verification passed at 12:01:40 UTC.
- At 12:02:04 UTC, the acceptance script used authenticated Grafana APIs over pinned SSH to save dashboard `sg-persistence-proof`, query the provisioned Prometheus datasource and record metric `up{job="prometheus"}` with value `1` at timestamp `1788955314`.
- Requested recreation in the conversation and approved operation `23cae3e0-8f39-4aa9-805a-36581db5cf90`. Both container IDs changed; accepted image identities and both service checks passed at 12:03:31 UTC. Configuration fingerprints matched and both volumes existed before replacement.
- At 12:03:56 UTC, the same dashboard resource version `1788955324148994`, title and panel query remained. Querying the earlier timestamp returned the same metric/value; a new query at `1788955436` also returned `1`. Grafana's database health was `ok`, and Prometheus still had no host port binding.
- Real logs were collected into shared History. Processes, Database, Storage and Architecture reflect the recorded stack. Reloading Architecture revealed a pre-existing browser-read-mark hydration mismatch; loading those marks after hydration fixed it without losing them.

```sh
node --import tsx tests/compatibility/grafana-prometheus.mjs DEPLOYMENT_ID before
# Request and approve recreation in Server Guy.
node --import tsx tests/compatibility/grafana-prometheus.mjs DEPLOYMENT_ID after
```

The script reads the saved private deployment input locally, sends it through pinned SSH to host-local Grafana APIs, and outputs only non-secret evidence. It does not send admin credentials across the public HTTP connection. Grafana's saved dashboard is ordinary application state created through its API; it is not inserted directly into SQLite.

## Recovery gap dispositions

- **Claimed deployment interrupted before raw status transition:** startup detects claimed `deploy-queued` work under the exclusive deployment-worker lock and stops it for recovery. Unclaimed approved work remains queued. Shipped in merged PR #22.
- **Unknown verification POST outcome:** no repeated POST. An owner can supply a candidate object ID; the executor verifies the previously recorded unique marker through an approved GET before any cleanup DELETE. A mismatched marker remains unresolved.
- **Unknown provider purchase with no recovered host:** empty lookup alone never authorizes another purchase. The owner must attest that Hetzner confirmed the original request completed without creating a server and provide a reference; Server Guy rechecks the same project, records the attestation and clears the old spending authority. Retry prepares a fresh recommendation requiring new approval. This is owner-attested reconciliation, not automatic proof from an empty query.
- **Definitively abandoned setup:** cancellation removes its private deployment files after committing cancellation. A crash between commit and deletion can leave private material for later cleanup; no claim of a general-purpose secret janitor.

Unit tests cover these boundaries. They do not constitute a deliberately induced real provider timeout or controller crash during purchase.

## Limits

A recreated container with retained data is not a backup/restore test. The Kuma monitor lives on the same host and cannot independently report total host loss. Grafana/Prometheus is a user application compatibility case, not an automatically installed monitoring dependency for every Server Guy deployment. These tests do not claim BYOM, safe version upgrades, credential rotation, domains/HTTPS, failover or every upstream configuration.
