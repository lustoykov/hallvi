# Backups, as the chain it actually is

15 September 2026. Branch `claude/cp6-backups`, stacked on
`claude/cp5-deployment-history-logs`. Checkpoint 6.

Synthetic throughout: three scenario applications, an isolated scenario
database, and a preview server on a scratchpad copy. No owner runtime, data or
credentials were touched, and nothing was bought.

Direction F is in place **provisionally**. All six backup directions A–F stay
runnable on `prototype/backups-directions` (`89b2769`), and the owner chooses.

## What the page did

One verdict sentence, with three separate facts folded into it: whether
anything is set up, whether a copy exists, and whether anybody has opened one.
Every bug this page has had was two of those read as one — a schedule reported
as protection, a copy reported as a recovery, a successful restore reported as
complete coverage. Folding was a thing to be careful about rather than a thing
the page could not do.

## What changed

**Three stages, each reporting its own result.** Set up, Latest backup, Last
restore test, with four states apiece. Merging two of them is now structural
rather than editorial. When all three hold the track collapses to one line: a
page of three ticks is three sentences saying nothing is wrong, which one
sentence does better.

**A coverage gap belongs to the record that names it.** If the restore
recorded what came back, the gap is the restore stage's and its line says
*opened the latest copy, without Customer uploads*. If only the copy's own
record names what went in, the gap is the copy stage's. If neither recorded
anything, **nothing is marked** — that is a thing to find out, not a finding,
and the page offers to look inside the copy. A plan is intent at any age and
never answers this. `docs/architecture/backup-stages.html` is the decision.

**Server Guy's own recovery is a second track, not a fourth stage.** The same
three questions about a different subject. Reading the two as one is the
confusion this page exists to end, and the page now says in as many words that
connecting storage here sets up nothing for the application above.

**Two projection fixes carried in from checkpoint 1's parking list.**
`protection.planned` no longer counts a record that states a plan is *absent*
as a plan. And subject ids are resolved to the owner's own words, so the page
prints *Customer uploads* where a record says `shop-uploads`.

**One meaning for a destination class.** The banner's word for a destination
and the projection's explanation of it were two tables that had drifted;
they are one, `CLASS_MEANING`.

## Evidence

Synthetic. Scenario applications `overclaimed`, `everything` and `absent` on an
isolated database, measured with Playwright at 1280 and 1440, collapsed and
with each stage opened in turn.

| Criterion | Result | Where |
|---|---|---|
| A restore that came back short is not a tick | pass | `backup-stages.test.ts`; `stages-gap.png` shows the restore amber and the line naming what was missing |
| A restore that brought everything back is a tick | pass | `backup-stages.test.ts` |
| An unrecorded copy does not turn a good restore amber | pass | `backup-stages.test.ts`; the page offers *Check what the copy holds* |
| A copy whose own record says it left something out says so | pass | `backup-stages.test.ts` |
| A schedule alone leaves the later stages waiting | pass | `backup-stages.test.ts`; `stages-none.png` |
| Subject ids never reach the reader | pass | `backup-stages.test.ts`, `protection-verdict.test.ts` |
| A record stating an absent plan is not a plan | pass | `protection-verdict.test.ts` |
| Nothing clipped, truncated, overlapping or outside its panel | pass | measured at 1280 and 1440, collapsed and each stage open: zero findings in all three scenarios |
| One type scale across the track | pass | measured: one size for titles, one for the lines under them |

```
npm test        1002 passed, 3 skipped
npm run build   ok
npx tsc         clean
npm run lint    2 pre-existing errors (pi-activity.tsx), unchanged
```

## Not settled here

**The verdict sentence above the track.** It still leads with the most
positive true thing and puts the caveat in the line below it. The stages now
carry the specifics, so the two do not contradict each other, but which of
them should lead is part of the direction the owner picks.

**Nothing observes the live `restored-copy` path.** Every restore here is
synthetic. Confirming that Pi writes that fact against a real copy is a
checkpoint 7 item, as Codex asked.
