# Journey UI polish

Reviewed the actual application records and screens on the working
`codex/single-instance-runtime` branch before updating PR #23. This pass changes
presentation and navigation, not deployment or provider behavior.

| Application | Recorded steps reviewed |
| --- | --- |
| Todo + PostgreSQL | Repository inspection, deployment recommendation/approval, failed attempt, successful behavior checks, status conversation. |
| Uptime Kuma + SQLite | Pinned-image deployment, application checks, approved container recreation, retained data evidence and log snapshots. |
| Grafana + Prometheus | Compose configuration, failed JSON-content verification, retry on the existing server, verified application/private-service checks, recreation and log snapshots. |

These are dated saved records. The UI review did not rerun deployments or
recreate containers. Provider access was limited to the existing read-only
firewall view. Compatibility proof remains documented in
[the runtime acceptance report](../testing/2026-09-09-single-instance-runtime.md).

## Opus collaboration

Claude Code 2.1.261 ran two reviews with `--model claude-opus-5 --effort max`.
Both result metadata report `claude-opus-5`. The source review inspected the
acceptance documents and UI code; the visual review explicitly read six PNGs,
including before/after Overview and History, Deployment and mobile Variables.

Adopted findings: raise the shared type floor and History title contrast;
label controller-restricted links; prevent pointer hover from retargeting the
homepage chat action; expose Security for an existing host; show evidence
qualifiers without hover; shorten Overview's destination chains; preserve the
visible failure reason alongside resolution; reduce mobile chrome and repeated
hidden-value cells. Opus's visual review endorsed the new Deployment summary
and 14/13/24px scale.

Two findings needed qualification. The saved operation ledger already retains
Grafana's original failed reason, so no backend evidence repair was necessary.
Absence of a chat origin does not prove an operation was automatic; the filter
is now “Outside chat,” and logs are labeled “Log collection.” We did not infer
an actor or change saved operation classifications.

## Result and validation

- Readable views, compact completed receipts, expandable evidence, resolved
  failure links, shorter Overview history, a verified deployment summary, and
  a collapsible completed preparation record.
- Source selection, approvals and recovery remain in the existing conversation
  flow. All destination links and detailed event logs remain reachable.
- 878 unit/integration tests passed; 15 opt-in tests skipped.
- TypeScript, changed-component ESLint and production build passed.
- Live browser checks: hover leaves the chat target unchanged; History filters,
  evidence and resolver work; preparation and receipt disclosures work; Security
  remains visible after reload; desktop and 390px views have no horizontal
  overflow or browser exceptions.
- Focused disposable browser journeys cover conversation/draft navigation,
  caretaker navigation and firewall read/error/retry.

Screenshots and original CLI results are local in
`/tmp/server-guy-ui-polish/`; no application credentials or provider state were
written into repository artifacts. The owner explicitly asked not to use CI
as the merge gate. Existing CI status is reported separately from local checks.
