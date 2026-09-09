# Grafana functional recovery and application evidence

This follow-up connects manual restore receipts to the real application views
and tests the gaps left by the [first stack proof](2026-09-09-sqlite-stack-restore-proof.md).
It does not configure a backup schedule or retention policy.

## Verified result

Final proof `ec75d66d-0799-4b91-a39c-f4142d91c872` passed. Its R2 archive was
70,879,737 bytes, SHA-256
`e38192b8e9a31f251ff1386cc50bb58de839febc797b47256859060cb5f73b9e`.
It recovered 92 SQLite tables, 1,808 rows, 700 files and 21 identical historical
Prometheus samples. The source pause was 2.86 seconds. Source fixtures, restore
resources and source staging were all verified removed.

The receipt and browser screenshots are in the private runtime proof directory.

## What the expanded test exercises

Before capture, the operator creates a temporary two-panel dashboard in the live
Grafana database. One panel queries the existing Prometheus data source; the other
queries the same Prometheus through a private endpoint requiring a random password.
Grafana stores that password through its `secureJsonData` API. The endpoint has no
published ports and joins only this stack's Docker network.

The existing whole-stack proof then captures consistent state, uploads the archive
to private R2 storage, downloads it again, verifies every file and SQLite row, and
boots the pinned application images in fresh volumes on an internal network.

The restored Grafana receives **no password injection**. Only its temporary external
test endpoint receives the expected password. The test verifies:

- The complete saved dashboard JSON matches what was read from the source API.
- Both stored panel queries return nonempty, identical historical samples through
  Grafana's query API.
- The restored data source retains its encrypted password and successfully
  authenticates. Independent requests with no password and a wrong password both
  receive HTTP 401 from that same endpoint.
- Each of the nine installed external plugins registers at its captured version,
  and Grafana serves a frontend module matching the archived module hash.
- A real browser renders both dashboard charts, opens all five app-plugin pages,
  and selects a metric in Metrics Drilldown to open its chart.
- The recovered PostgreSQL plugin connects to a disposable PostgreSQL database
  and returns two known rows through Grafana. This checks plugin functionality;
  recovery of that disposable database is not being claimed.

Browser access uses a temporary proxy published on `127.0.0.1` only. The proxy
joins the internal restore network; the restored application itself retains no
external network. All temporary source records, endpoints and local restore
resources are removed afterward. Source fixture deletion is checked by reading
the deleted IDs and requiring HTTP 404.

## Plugin findings

| Installed plugin | Scope of the check |
| --- | --- |
| Metrics Drilldown | Lists real Prometheus metrics; selecting a metric renders its chart. |
| PostgreSQL | Backend health and query against two real test rows. |
| Logs Drilldown | Loads its missing-Loki setup screen. No Loki is configured. |
| Traces Drilldown | Opens, but reports a missing data source. No Tempo is configured. |
| Profiles Drilldown | Loads its Pyroscope setup screen. No Pyroscope is configured. |
| Advisor | Loads a message requiring the `grafanaAdvisor` feature flag. |
| MySQL, Microsoft SQL Server, Elasticsearch | Registration, exact version and frontend module integrity; no corresponding database is configured or queried. |

The source server was inspected through an SSH tunnel with the same browser
checks. Logs and Traces each emitted one browser error object there, as on the
restored copy. These are existing missing-dependency states, not restore
regressions. They are recorded as limitations, never as passing functional tests.

The first expanded API proof (`47feb3a6-88e5-4921-ac8b-99d5b597d923`) passed the
dashboard, encrypted credential, query and nine plugin integrity checks. A later
trial (`d80a41b3-299e-446a-a677-9943d4a502d8`) was conservatively marked failed
because the initial browser check treated those existing missing-dependency errors
as restore failures. That receipt remains a failure. The subsequent check requires
the working features to pass and reports unsupported plugin pages separately.

## What the UI means

The application list, Overview, Database and Backups views read the same sanitized
receipt facts. Manual restore evidence is separate from scheduled protection.
Backups shows when data was captured, the tested revision, the downloaded archive
check, verified data and features, limitations, and prior attempts. A later failure
does not erase an earlier verified restore or become a success itself.

The UI never receives archive contents, configuration, account identifiers, SSH
identity, local artifact paths or raw operator errors. A receipt for another
application cannot contribute evidence; a changed revision is identified as
historical evidence rather than proof of the currently running revision.

## Running the expanded proof

```sh
SG_GRAFANA_FUNCTIONAL=1 python3 scripts/backup-proof/prove-sqlite-stack.py \
  <grafana-application-uuid> <cloudflare-account-id> <private-bucket>
```

In addition to the original proof prerequisites, cache `python:3.12-alpine` for
linux/amd64 and `postgres:16-alpine`, and install the Playwright Chromium runtime.
The source host pulls the same Python image digest before fixtures are created.
The fixture directory is private and includes temporary authentication material;
it follows the same retained-artifact handling as the original proof.

For an interrupted functional run, `functional-fixture.json` names its exact
source dashboard/data-source UID, container and staging path. Clean up those
owned resources before retrying. Never remove unrelated dashboards or data sources.

API and plugin behavior references: [Grafana data-source API](https://grafana.com/docs/grafana/latest/developer-resources/api-reference/http-api/api-legacy/data_source/),
[plugin lifecycle](https://grafana.com/developers/plugin-tools/key-concepts/plugin-lifecycle).

## Review and validation

Opus 5 at maximum effort implemented the initial evidence integration and then
reviewed the completed source, sanitized receipt, and desktop/phone screenshots
read-only. Its findings were addressed before merge:

- Cleanup is now an independent outcome. A completed restore remains verified
  even if fixture deletion or Docker teardown fails; the command exits nonzero
  and the UI calls out resources that need cleanup. A failure-path test verifies
  that remaining cleanup tasks still run and restore evidence is retained.
- Browser checks record the measured chart count. The final run recorded **2 of
  2 charts rendered**, rather than deriving the count from a success flag.
- Plugin rows describe the running frontend module hash check precisely, separate
  from full archive integrity and functional query tests.
- Invalid SQLite counters are not rendered as successful checks.

The final Grafana R2 proof above reran the complete expanded workflow after these
changes. The Todo PostgreSQL proof was also rerun successfully as
`7429c87c-c2b7-4f32-b677-caff8119b040`, including canary removal and restore cleanup.
Kuma uses the previously verified proof `79310e32-14d8-416e-ba9b-cd297210877e`.

Local validation: 45 focused TypeScript tests and 9 Python tests, TypeScript,
ESLint, Ruff, formatting, and the design detector. Browser checks covered the
actual three applications and homepage, desktop and phone layouts, detailed
plugin statuses and absence of contradictory no-copy claims. A homepage server
rendering failure discovered by this check was fixed by keeping the summary
helper out of the client UI import graph. No CI result was used as a merge gate.
