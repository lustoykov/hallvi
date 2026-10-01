# Overview alternatives — throwaway prototype

Five ways to make Overview useful at a glance, using plain labels, dated
observations, recent work and the existing Visitors presentation. No design has
been selected. These alternatives belong on this exploration branch, not main.

Use Node 22, run `npm ci`, then:

```sh
npm run prototype:overview
```

Open <http://127.0.0.1:3741/prototype/traffic?page=overview&scenario=busy&variant=A>.
An optional port follows `--`, for example `npm run prototype:overview -- 3742`.

| Variant | Layout | What it emphasizes |
| --- | --- | --- |
| A — At a glance | Status strip, two-column summary, recent work | A balanced overview |
| B — Daily brief | Written account with an evidence margin | Reading what changed |
| C — Status sheet | Evidence table with an analytics band | Comparing recorded status |
| D — Activity first | Chronological work with a summary column | Following recent work |
| E — Visitors first | Selectable daily bars with operational context below | Understanding usage |

The bottom control and left/right arrow keys cycle through the five alternatives.
The URL keeps the selection across reloads. Arrow keys are left alone in form
controls. E also has a week/month switch and selectable day readings.

All five use the same record projections and traffic source. The review link
uses synthetic records inside the existing Hallvi application shell; its
**Sample data** selector includes quiet traffic, missing logs, history turned
off and errors after a release. **Ask Hallvi** displays a draft in this preview
and sends nothing. Destination links open the existing fixture-backed pages.

The same alternatives can be viewed on a development controller's ordinary
application route by appending `?variant=A` (or B–E) and opening Overview.
That path retains the controller's existing data fetching and draft/navigation
actions. The alternative renderer and switcher are disabled in production;
without the parameter the existing Overview is unchanged.

This is a desktop design comparison. No provider operations, production
changes, new data collection or persistent prototype choices are involved.
The fixed five-minute request window, daily visitor estimates, latest recorded
release and dated checks remain distinct; absent evidence remains unknown.

Select a direction or combine particular sections before implementing a winner.
The full exploration stays on `codex/overview-five-prototypes`. Keep per-run
screenshots and review notes in ignored `work/overview-review/`.
