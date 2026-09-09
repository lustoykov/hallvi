# Grafana with Prometheus — compatibility fixture

This directory is an independently deployable application. It uses official published images, not Server Guy's application source. The controller resolves image tags to immutable Linux amd64 digests before asking for deployment approval.

Grafana listens on 3000 and keeps its SQLite database at `/var/lib/grafana/grafana.db` in `grafana-data`. Supply a private `GF_SECURITY_ADMIN_PASSWORD`; do not use a published default. Keep HTTP restricted during initial setup and use an SSH tunnel for admin credentials until HTTPS is available.

Prometheus listens privately on 9090; do not publish its port. Its time-series data lives in `metrics` at `/prometheus`. The configuration scrapes its own real metrics every five seconds. Grafana's provisioned datasource queries it at `http://prometheus:9090`, entirely within the Compose network.

Acceptance checks:

- Grafana `/api/health` reports a working database, and `/login` serves Grafana.
- Prometheus `/-/ready` succeeds. `/api/v1/query?query=up` has `status=success` and `data.result.0.value.1="1"` after the first scrape.
- Grafana can query that datasource. Save a small dashboard, recreate both containers through Server Guy, and verify the saved dashboard and previously collected time series survive.
- Inspect logs in Server Guy. This fixture makes no backup, high availability or HTTPS claim.
