# Working application UI consolidation

Continue application development on `codex/single-instance-runtime` in
`.worktrees/self-hosted-shell`. The existing development server is
`http://127.0.0.1:3270/applications`, using the working application's saved
records. Port 3334 was a separate disposable prototype preview.

The runtime branch fast-forwarded from `acfbedf` to the tested UI integration
at `02be718`. This includes every commit from the Fable refinement and the
architecture status correction. The repository root's older checkout and the
separate homepage/mascot exploration were not changed.

The uncommitted firewall draft was preserved in a Git stash before merging
(`9f7bad64af2f6fc867c810efa128655008f79d67`). Its reader, API guard and tests are
now included in this working branch. The old Domains-mounted component was
adapted into `use-firewall-facts.ts`; it supplies `facts.security` to the shared
view and navigation. Security performs a read when opened and supports manual
refresh, error reporting and retention of the last successful observation.
Changing the application, server or deployment account invalidates that local
observation.

The provider response distinguishes applied, pending and absent firewalls.
Rules preserve exact protocols, port ranges and sources. They do not establish
service reachability, SSH authentication or unpublished host services; the
view explicitly leaves those unknown. The API verifies that the connected
Hetzner account matches the deployment's recorded authority. No infrastructure
settings were changed.

Validation:

- 876 application tests passed; 15 skipped, including opt-in Docker tests.
- TypeScript, ESLint and Prettier passed.
- The application conversation/navigation browser journey passed.
- The new firewall browser journey checks provider facts on the real application
  route, failed refresh retaining evidence, retry recovery and separate Domains
  navigation. It passed after correcting its initial locator to match the view.
- The real Grafana application returned HTTP 200 from the firewall endpoint,
  reporting an applied firewall with two incoming rules. The new Security view
  rendered those facts without browser exceptions; mobile width stayed at 390px.
- Earlier full UI comparison at `02be718`: 5 browser journeys passed and 3 failed
  identically on both the integration and base branch. See the UI integration
  report for the exact baseline failures; this consolidation does not fix them.

Screenshots are in `tests/results/runtime-consolidation/`. Changes are local;
no push or production deployment was performed.
