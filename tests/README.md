# Testing Server Guy

## The 80/20 bar

We are discovering and polishing the product. Tests should help us change it
confidently without turning every change into a hardening project. Optimize for
useful failures caught versus authoring, maintenance, runtime and review cost.
There is no target test count, coverage percentage or deletion quota.

Keep or add a test when it protects a current, important behavior and catches a
realistic failure that existing coverage would miss. Prioritize:

- The main journey: deploy, open the application, return after a refresh, and
  continue the conversation after a turn completes.
- Concrete risks to data or credentials, such as an incomplete recovery archive
  or discarding the working password after a partially successful change.
- Consequential boundaries and claims: approval before execution when required,
  acting on the intended application/server, and backup or deployment success
  supported by the relevant result.

A small regression test for a serious observed bug can be valuable even if that
bug is uncommon. This does not justify testing every imagined variation.

Delete or consolidate tests for retired behavior, duplicated scenarios, trivial
wrappers, internal call sequences, or exact wording/markup with no meaningful
user contract. Keep wording assertions where the wording itself carries an
important warning or claim. Do not remove a useful test merely because it fails;
first distinguish a product bug from an obsolete expectation or broken fixture.

Use the cheapest check that gives useful confidence. Prefer one representative
integration or journey test over many mocks that repeat the implementation; use
focused unit tests for consequential logic when they give a clearer signal.
For prototypes, spacing and copy edits, inspect the rendered UI and exercise the
changed interaction. Do not build permanent test suites around designs awaiting
selection, or write tests that merely assert the CSS you just added.

A shared rule is proved once, against the thing that implements it, and each
page that reads it keeps one small check that it does. The clock rules live in
`unit/state-matrix.test.ts`, the same-origin rule in `unit/mutation-origin.test.ts`,
and the size parser in `unit/parsers.test.ts`; re-asserting them through another
projection buys nothing and doubles what a change has to update.

Run relevant checks once; broaden or repeat them only for a new change, failure
or concrete unresolved concern. Documentation-only edits need document/link
review. Real provider claims need representative real verification, but that
proof need not become a recurring test for unrelated edits. A pruning pass should
run the retained default suite once to catch broken fixtures and imports.

When pruning, explain removals by group and name the important behavior still
covered. No scoring framework, exhaustive audit spreadsheet, mandatory
counterfactual run for every test, or new test harness is needed. If a decision
would remove the only coverage of an important behavior and its value is unclear,
ask the owner with that concrete example; continue the unambiguous cleanup.

## Commands and limits

`npm test` runs the application tests; `npm run test:e2e:smoke` runs the browser
smoke subset; `npm run test:operator` runs the Python checks for the host-side
scripts under `scripts/` — the scheduled-backup runner's bounded failures,
receipts and recovery path, and the SQLite backup proof. They need only
`python3` and take under a second, and nothing invoked them before this
command existed. Nothing in `src/` currently installs
`scripts/scheduled-backups/runner.py`; its coverage stays until that is
decided rather than being dropped on the way past. Select checks relevant to the change rather than running both by
default. Tests use disposable databases and synthetic provider/model responses.
The shared-information browser case covers rich cards in chat and Deployment
after refresh. `npx tsc --noEmit` and `npm run build` check the application bundle.

The native-session cases, whose synthetic prompts called retired decision tools, are gone; `tests/application/integration/pi-sessions.test.ts` retains persistence, isolation and missing-history checks, while `tests/application/unit/chat-recovery.test.tsx` covers the recovery UI. These do not reproduce the entire removed browser journey. Current transcript regression coverage is `tests/browser/pi-transcript.spec.ts`; run it together with the smoke suite after transcript changes.

A browser case asserts what the product says, not what a past layout said. Scope
by landmark and accessible name rather than by layout class: a routine record is
one compact line in a transcript and its content is behind a disclosure, and a
destination is a page composed from records rather than a list of the cards from
the conversation. `[data-information-id]` is the stable way to ask whether a
record is on the page at all. This fixture does not establish a reachable application — a private one is proved by a live SSH control socket, and a
loopback address is refused as a public target — so this journey checks closed access. It does not prove that a reader can open
a deployed application; that still needs verification against a running host.

The `/prototype/app` reference shell, and the `views/*-view.tsx` layouts that
only it renders, carry no tests. A real application's destinations are the
`*-page.tsx` components, and what they may claim is settled by the record
projections behind them; that is where this coverage lives.

The old workflow/decision model-eval runner and compatibility deployment scripts have been retired with their implementation. `npm run eval:pi` explains this and exits without making model calls. Historical model answers and their optional judge remain available; they do not verify the redesigned operator. New live deployment evals follow provisioning.

The local testing dashboard is available through `npm run test:dashboard`. Opening it makes no model calls. Its live-case catalog still describes historical cases; do not treat those as current implementation requirements. This cleanup removes dedicated coverage of the dashboard, saved-answer judge and browser-fixture harness because they are outside the current product acceptance work. Local tooling can still fail silently or affect data, credentials and spending: its location is not an exemption from the 80/20 bar. Check the relevant behavior when changing these tools; add a focused regression only when a concrete risk warrants it.

Install Chromium with `npx playwright install chromium`. Browser fixtures run on 3180+ with synthetic credentials; they never open the normal application database. Failure artifacts and the rich-card screenshots are under `tests/results/`. The workspace Docker test is opt-in and requires a reachable engine.
