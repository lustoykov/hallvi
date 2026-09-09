# Application view refinement: handoff

9 September 2026, Fable, in `.worktrees/app-ui-refinement` on branch
`claude/app-ui-refinement`, branched from `codex/operation-records` at
`05eea88` (verified before branching; `.worktrees/self-hosted-shell` was not
touched and has since moved on to `a6b607f` under another agent).

One commit: `284633d` — _Give every application view a lead, a grouping and a
picture worth drawing_.

## What the work was

The conversation-first direction was right, but individual views were long
sequences of equally weighted rows. Every view now follows one shape:

1. **Live activity** touching the destination (unchanged, `DestinationActivity`).
2. **Condition** — one sentence saying what is true here now.
3. **A visual**, only where a picture is read faster than a sentence.
4. **Grouped facts**, in two columns on a wide screen.
5. **The honest unavailable state**, when a capability records nothing yet.

## The visual vocabulary

New file `src/components/server-guy/views/visuals.tsx`. Every element returns
`null` when its data would not support it, so a simple application stays a
simple page and nothing is ever inferred from silence.

| Element | Renders when | Used by |
| --- | --- | --- |
| `Tally` | 3+ items in 2+ states | Monitoring checks, Backups coverage, Deployment history |
| `Composition` | A measured total the parts fit inside | Storage: volumes against the instance disk |
| `Meter` | A measurement and a capacity | Monitoring resources, Database size |
| `Flow` | A path whose stages carry their own state | Domains & CDN delivery, Deployment release |
| `Timeline` | 2+ recorded points | Backups recovery points |
| `OutcomeStrip` | 3+ recorded runs | Jobs |
| `Bars` | Observed magnitudes with no whole | Cache & queue backlog |
| `Stat` / `Stats` | A headline number worth its own block | Available, currently unused |
| `Loading` | The first record fetch has not returned | Every destination |

Styles live in the new `src/components/server-guy/views.css`, imported after
`application-shell.css` by both `operator-shell.tsx` and
`reference/reference-shell.tsx`, so it is the later word on shared selectors.

## Changed screens

| Screen | What changed |
| --- | --- |
| Overview | Rewritten. One state sentence in a hero, then Needs you only when something does, then "What is running" as a grid of small facts instead of nine label-and-value rows in a narrow column, then Recent changes without the per-row link pills, then Evidence as one line per fact |
| Architecture | Node dots now reflect the check on that node rather than one global live flag; a legend says what the dots mean; the detail strip links into that node's destination |
| Deployment | A release path (newest revision → checks → your approval → serving) above the existing candidate, history and preparation |
| History | Grouped by day, filters carry counts and disable when empty, unsettled work pinned above the days |
| Processes | Condition line, unhealthy process ordered first and tinted, worker's queue links to Cache & queue |
| Database | Condition line, size against the instance disk with the measured growth rate and rough headroom |
| Cache & queue | Condition line and a backlog bar, both only when a queue integration observed them |
| Jobs | Condition line, failing jobs tinted, an outcome strip per job from its recorded runs |
| Storage | Condition line and volumes drawn against the instance disk; unprotected rows tinted |
| Backups | Recovery points on a time axis with the restore test marked, a coverage tally, and a designed empty state |
| Logs | Stream tiles with volume bars, a match count, severity tinting from the words in the line, and a collecting state |
| Monitoring | Condition first, issues split into "Needs you" and "Recovered", a check tally, failing checks ordered first, resources as gauges marked at 75% and 90% |
| Domains & CDN | A delivery path: name → CDN → HTTPS → serves, each stage with its own state and the one manual DNS step called out. Label preserved |
| Environment Variables | Grouped by provenance, the source column dropped because the group heading says it, pending values and pending restarts marked |

## Two things raised mid-review

**The identity dropdown.** It moved out of the top bar into the sidebar head,
above the destinations it scopes, with a small "Server Guy" link back to all
applications. The top bar now says where you are (open destination, or the
current conversation) plus the work strip. `application-identity.tsx` is one
component with three placements — `navigation` (shipped), `topbar` (the old
one) and `breadcrumb` (a path with no menu) — compared live at
`/prototype/shell`. Changing the choice is the `identityVariant` default in
`operator-shell.tsx` and `reference-shell.tsx`.

**Marks blinking all at once.** A change touching five destinations set five
navigation marks pulsing. `navigationIndicators` now flags the destination an
operation names first as `primary`; only that one animates, and the rest are
5px, half-opacity and static. Conversation marks are always primary, since a
conversation owns the work it started. Reduced motion removes the pulse
entirely.

## Prototype-only behaviour

Everything rich in the screenshots comes from `/prototype`, which feeds the
product's own components from `reference/scenario-rich.ts` and
`scenario-simple.ts`. Real routes pass `facts = {}`, so they render the
unavailable states — verified against the QA fixture with a freshly created
application (Overview, Architecture, Deployment, History, Backups, Logs,
Monitoring, Domains & CDN, Environment Variables; Processes, Database and
Storage stay hidden because nothing is recorded, which is correct).

Two prototype additions: `/prototype/shell` (identity placements) and four new
entries in the reference index. No scenario data was invented beyond what the
existing scenarios already carried.

## Integration considerations for GPT

- `views.css` must load after `application-shell.css`. Both shells import it
  directly; any new shell must do the same.
- `NavigationIndicator` gained an optional `primary` flag. Anything else
  producing indicators should set it, or its marks will never animate.
- `Facts` gained a `wide` prop for values that are sentences.
- `ArchitectureCanvas` gained optional `facts` and `onOpenDestination`.
- `ApplicationSectionView` gained an optional `loading` prop;
  `operator-shell.tsx` sets it until the first deployment fetch returns.
- `formatLocalTimestamp` gained a `date` variant for day headings. It is
  deliberately absolute (no "Today"), because the prototype runs a simulated
  clock and the reader's clock is not the record's clock.
- No backend contract, endpoint, approval control or executor behaviour
  changed. `ApplicationFacts` is unchanged.

## Validation

- `npx tsc --noEmit`, `eslint .`, `prettier --check .` — all clean.
- `vitest`: 850 passed, 15 skipped, 0 failed.
- Playwright `application-shell`, `workspace-navigation`, `activity-history`:
  5 passed, 3 failed. Those same 3 fail identically on an untouched checkout
  of the base commit `05eea88`, so they are pre-existing, not caused here:
  - `activity-history.spec.ts:69`
  - `activity-history.spec.ts:184`
  - `application-shell.spec.ts:235`
- Manual review of every destination at 1440px and 390px in both scenarios,
  plus the real routes on an isolated QA fixture.
- `node tests/browser/ui-refinement.capture.mjs <base> <out> <width> <height>`
  captures all 26 screens; run it at 1440×1000 and 390×844.
