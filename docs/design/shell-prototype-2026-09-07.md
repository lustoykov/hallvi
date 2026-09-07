# Workspace shell prototype: top bar, inspector, action placement

Date: 2026-09-07. Branch `codex/phase23-experience-followups` (prototype
commit kept on `prototype/phase23-shell`). Throwaway code lives in
`src/components/server-guy/prototype/`; only `phase-copy.ts` is written to be
lifted. Walkthrough items addressed: 3, 10, 15, 16, 17, 18, 19, 22, 23 and the
action-placement clarification.

## The question

How should the application top bar, the right-hand inspector and the phase
actions be arranged so that a person can tell, without finding the first
chat message, what the phase is for, what is happening now and what the next
action is; so the record is not crowded; so history and evidence are
reachable; and so there is one authoritative current state and no duplicate
controls?

## How to run it

```bash
node tests/browser/qa-fixture.mjs 3210 success ready
# then, with the `state` path the fixture prints:
node src/components/server-guy/prototype/seed-fixture.mjs 3210 <state dir>
```

The seed prints one URL per application; add `?variant=A`, `B` or `C`
(the floating bar and the ← → keys switch too). Every action is stubbed and
reported in the bar; nothing is sent to the server. The variants are hidden
in production builds.

Applications the prototype was judged on (all synthetic `qa/…` repositories,
labelled as such in every variant):

| Case | Repository | State |
| --- | --- | --- |
| Phase 2, revised contract | `qa/fastapi-app` | v1 → v2, source-only change on the health path |
| Phase 3, waiting for review | `qa/fastapi-p3-nohealth` | staged change, preview passed, behavior checks v1 proposed |
| Phase 3, replaced proposal | `qa/fastapi-nohealth-replaced` | first proposal superseded by a second |
| Phase 3, verified | `qa/fastapi-nohealth-done` | accepted, approved, published, merged (scripted), candidate run passed |

## The three variants

All three read the same Operator View and the same derived "current step"
(`phase-copy.ts`: purpose, what is happening now, who the next move belongs
to, the distinct next actions, the Phase 3 stages, and an honest
remaining-work sentence including zero).

**A — Now panel + focused details.** Top bar carries identity only (name,
repository beneath), environment and policy as a muted context line, and a
Settings link that names its connection state in words; the phase appears
only in the strip. The right column is a "Now" panel: phase purpose, status
sentence, a waiting-on pill, the distinct actions, the Phase 3 stages, the
checks. Everything else (contract, saved versions, change and behavior
checks, runs, history with filters) opens in one wide Details overlay with a
left section nav. Actions live only in the Now panel; approving or accepting
first opens the change for review. The chat is a plain transcript.

**B — Chat cards + integrated header.** One navy header with two rows: identity
plus connection states in words (ChatGPT, GitHub, Docker) and Settings; then
a compact phase line that folds the strip into the header. Interactive cards
appear in the chat after the reply that produced the record (contract,
behavior checks, change, publication, run); a replaced proposal's card says so
and loses its buttons. The right column has two tabs: Record (checks, stages,
environment, contract) and History (activity plus source reads, filterable).

**C — Current-step bar + outline record.** Top bar: identity with the
repository, environment and policy as a subtitle; Settings; the strip
unchanged beneath. A persistent current-step bar sits above the transcript:
purpose, "Now" sentence, waiting-on, the actions, and the Phase 3 stages as a
row. The right column has no tabs: one outline with a jump nav (Checks,
Contract with saved versions, Change and behavior checks, Runs, Environment,
History) of collapsible sections, each with a one-line summary.

## What the prototype showed

**Top bar.** The current bar gives the app name, "Production", "Phase 2 ·
Inspect app", a Policy chip and a Settings chip equal weight, and the phase
pill duplicates the strip directly beneath it. Demoting environment and
policy to a subtitle (C) or a context line (A) loses nothing: both are
Phase 1 facts, not live status, and they stay visible. Naming the connection
that needs attention on the Settings link ("Settings · Connect ChatGPT") is
clearer than a coloured dot. B's separate ChatGPT/GitHub/Docker dots are
honest but add three controls most of the time; Docker only matters from
Phase 3 and the outline shows it there.

**Strip.** Folding the strip into the header (B) saves about 50 px but drops
the setup and live phase names to bare numbers and blurs the launch-map
reading the user asked to keep. Keep the strip as a separate row.

**Phase purpose and current work.** Both A and C make the purpose, the "Now"
sentence and the waiting-on state visible in every chat of the phase; B splits
them between the chat header text and the cards. The Phase 3 stage list
(propose → accept behavior checks → approve → publish → merge on GitHub →
verify) was the single most clarifying element: it shows the distinct
decisions the user asked to keep apart (accepting the test plan, authorizing
code and publication, execution passing, and, later, confirming the preview)
and whose move each one is. The remaining-work sentence ("Inspection
complete. No required changes remain; Phase 3 still has to verify that the
application runs.") replaces the misleading completion copy.

**Action placement.**

- Chat cards (B) put the explanation beside the action and read naturally
  for reviewing a proposal, but the actions scroll away with the transcript,
  every card must recompute current status so an old card cannot approve a
  replaced proposal, and actions with no producing message (verify the
  current revision, refresh after a merge, return an external change) have no
  natural home and land in a synthetic slot at the bottom. The transcript
  becomes a control surface with a second copy of state.
- A focused area only (A) gives one authoritative place with no duplicates,
  but the review content is behind an overlay, so the primary action is two
  clicks away and the chat context disappears while reviewing.
- The hybrid (C) keeps one authoritative current-step bar that never scrolls
  away, with the distinct actions always visible, while the things to review
  (behavior checks, the change and its diff, runs) sit in the outline beside
  it. The chat stays a conversation. Its cost is vertical space in the chat
  column (about 150 px in Phase 2, up to 250 px in Phase 3 with the stages)
  and a record that is still long, mitigated by the jump nav and collapsed
  sections.

**Inspector.** Replacing four tabs with one outline removed the "which tab is
it in?" question: source reads become "History · source reads" (Receipts),
the empty "Changes" placeholder folds into "Change and behavior checks", and
the contract's groups collapse to one preview line each with "Source" instead
of "Provenance". Saved versions under the contract answer item 15, but the
prototype only derives them from the phase's Activity, so from Phase 3 the
Phase 2 versions are missing and the "why" inherits the Activity's
"/health → /health" wording for a source-only change (item 14). A dedicated
history read is needed.

**Docker.** A one-line "Docker ready on <host> · checked <time> · Refresh"
when healthy, expanding into the recovery steps only when not, was enough in
all three variants; nobody needs "Check again" as a standing button.

**Honest demos.** Every GitHub link on a synthetic repository renders as a
non-clickable "demo · not a real link" label and each page carries a demo
banner. The prototype keys this on the `qa` owner; production needs an
explicit signal (the fixture root is only known to the server process).

## Decisions so far

- **Top bar: A** (user, 2026-09-07). Identity with the repository beneath the
  name, environment and policy as a muted context line, no phase pill, no
  Policy chip, Settings names its connection state in words. Moved into
  production in `operator-shell.tsx`.
- **Buttons** (user, 2026-09-07): smaller and quieter. One solid primary at a
  time; further pending decisions are outline buttons; card actions are
  small outline buttons; "Details" is a text row.
- Right column and action placement: open; recommendation below.

## Recommendation

Take C as the base, and borrow two things:

1. From A: use a focused view for deep evidence (a full diff, raw run
   output, the full history with filters) rather than inlining it in the
   column. The existing check drawer is the pattern.
2. From B: after a reply that produced a record, show a small reference line
   ("Saved: Proposed change · replaced · view") that jumps to the outline
   section. Never a second set of buttons.

Concretely for production:

- Top bar: brand, application switcher with a subtitle
  (`owner/name · Production · Always ask`), Settings that names a missing
  connection. Drop the phase pill and the Policy chip. Keep the strip.
- Chat column: the current-step bar from C, driven by a production
  `describeCurrentStep`, above the transcript in every chat of the phase.
  Completed phases show "Completed" and a link to the current phase.
- Right column: the outline from C. Sections: Checks, Application Contract
  (with Saved versions), Change and behavior checks (Phase 3), Runs
  (Phase 3), Environment (Phase 3; Docker line and publishing grant), History
  (activity and source reads). Deep evidence opens in a drawer.
- Every action stays a call to the existing operation; the bar and the
  outline read the same view, so a reload shows what the record shows and a
  replaced proposal cannot be approved from anywhere.

## Built independently of the open choices

- `src/components/server-guy/current-step.ts`: `describeCurrentStep`
  (purpose, now, waiting-on, distinct actions with one solid primary,
  Phase 3 stages, remaining work) with unit tests; the prototype delegates
  to it.
- `GET /api/applications/:id/contracts` (`src/server/contract-history.ts`):
  every saved version newest first, current one marked, field changes
  classified as value, source, both, work, added or removed, and the
  message that led to each version quoted. A source-only change is never
  reported as "x → x". Integration-tested over SQLite.
- "Saved versions" under the current Application Contract in the Record
  (`contract-versions.tsx`), read on demand from that route.
- The Variant A top bar in production.

Still to build once the right-column and action-placement choices land:
the current-step bar, the outline record, the demo signal from the page
(the fixture root is known to the server process), and the compact Docker
line.

## Needs from Codex (recorded, not blocking)

- `phase-two-spec.ts`: the profile check's definition says the profile
  matched even when the result is Blocked; a neutral definition ("Server Guy
  inspected the repository at an exact commit and compared it with the
  supported Application Profile; the criteria say what was found") is
  presentation copy in a Codex-owned file.
- `describeContractChanges` (Activity detail) formats only values, so a
  source-only change reads "/health → /health"; the history route will
  describe sources itself, but the Activity event text is Codex's.
- Preparation branch, preview and correction surfaces use the agreed
  interface shapes when they land; the current-step bar has slots for them
  (stages, waiting-on "github", actions).
