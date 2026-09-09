# Self-hosted compatibility tests

These are representative acceptance targets for the [agreed stack](../../PRODUCT.md#supported-scope), not an installer catalogue or proof of supported software. The source assessment was recorded on 9 September 2026; this matrix alone establishes no deployment. The [dated runtime report](2026-09-09-single-instance-runtime.md) records actual deployment/recreation results and their limits.

## Cases

| Project | Representative setup and what it tests | Fit / missing capability |
| --- | --- | --- |
| [Grafana](https://grafana.com/docs/grafana/latest/setup-grafana/installation/docker/) | Dashboard application; persistent configuration/dashboards, data-source setup. SQLite is embedded by default; PostgreSQL is also supported. | Grafana 13.2.1 deployment, private Prometheus query, and saved dashboard retained after recreation passed on 9 September 2026. Version update and off-host restoration remain unverified. |
| [Prometheus](https://prometheus.io/docs/prometheus/latest/storage/) | Metrics service with configuration, scrape targets and its own on-disk time-series database. | Prometheus v3.14.0 deployed privately with read-only scrape configuration and persistent time-series data. Real scrape/query and retention of an earlier sample after recreation passed on 9 September 2026. Disk management and restoration remain unverified. |
| [Uptime Kuma](https://github.com/louislam/uptime-kuma/wiki/Environment-Variables) | Uptime monitoring with a SQLite deployment option and persistent application data. | Deployment, successful monitoring, SQLite integrity and retained monitor/heartbeat data after container recreation passed on 9 September 2026. Controlled failure diagnosis, version update and off-host restoration remain unverified. A monitor on the same host is not independent outage detection for that host. |
| [Vaultwarden](https://github.com/dani-garcia/vaultwarden/wiki/Which-container-image-to-use) | Password-vault server; SQLite is recommended for most users, PostgreSQL is also supported. | Same-host fit; adds meaningful HTTPS, client compatibility and sensitive-state restoration checks. Use disposable test credentials, not the owner's real vault, for acceptance. |
| [Forgejo](https://forgejo.org/docs/latest/admin/installation/docker/) | Git hosting with SQLite/PostgreSQL options, repository files, HTTP and optional Git-over-SSH. | Same-host fit; checks non-database persistent files and additional-port support. Prove repository push/clone; CI runners are a separate scope decision. Its official source/images also test intake beyond GitHub-owned repositories. |
| [Paperless-ngx](https://docs.paperless-ngx.com/setup/) | Document management/OCR, database, document storage, background processing and a Redis-compatible broker such as Valkey/Redis. | Fits the agreed stack target; first broker-dependent test after simpler cases. Prove document ingestion, processing and restoration. Not yet verified. |
| [Immich](https://github.com/immich-app/immich/blob/main/docker/docker-compose.yml) | Photo management with PostgreSQL/extensions, Valkey, machine-learning service and media storage in the upstream Compose example. | Fits the same-host target with compatible dependencies and sufficient resources; a later, more demanding test. Use a pinned released Compose file for execution, not the moving main-branch reference. Not yet verified. |
| [WordPress](https://wordpress.org/about/requirements/) | PHP application with MySQL/MariaDB and persistent uploads. | Outside the PostgreSQL/SQLite managed database scope; would require an explicit database-support expansion. Do not propose replacing its database with PostgreSQL. |

The existing `todo-fastapi` source-app/PostgreSQL case has [dated first-deployment evidence](2026-09-08-real-deployment-acceptance.md). Dated deployment/recreation passes above cover only that slice; complete lifecycle support requires the remaining criteria below. Each can be evaluated on one appropriately sized VPS; do not attempt to co-host the whole suite on the smallest test machine. Check pinned upstream resource/version requirements before execution, especially Immich's database extensions and machine-learning service.

## Pass criteria

For each version/configuration called supported, record:

1. **Deploy:** immutable source/image/configuration, required host preparation, services, access, mounts and secrets. Test missing setup as well as an already configured machine.
2. **Use:** meaningful behavior—create/query a dashboard, scrape a metric, push/clone a repository, ingest a document or process a queued task. A login-page response alone does not pass.
3. **Recreate:** restart and replace containers while retaining the actual database, files and configuration that matter.
4. **Update:** select a new version, honor upstream migrations/worker shutdown and verify the intended serving version. Record compatible recovery or its limits.
5. **Restore:** back up consistently, transfer off-host, restore in isolation and verify useful data/behavior again. Include files, embedded databases and necessary configuration; database and queue restoration have different replay risks.
6. **Investigate:** inject a controlled failure, inspect real logs/health and produce a useful diagnosis or coding-agent handoff. Preserve uncertainty after interruption.

Reject unsupported required components explicitly; do not remove them or rewrite application libraries to make a deployment fit. Reuse upstream configuration rather than adding product-name-specific installer logic for each case. Follow [background-work requirements](../user-journeys/08-scheduled-jobs.md) where relevant.

[Roadmap](../../ROADMAP.md#compatibility-gates) owns execution order. WordPress is a deliberate database-scope exclusion. The earlier idea of deploying Coolify itself is not a release gate or permission for two controllers to manage the same host resources.
