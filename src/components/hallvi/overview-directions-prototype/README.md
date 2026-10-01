# PROTOTYPE · Overview directions

Throwaway. Lives on `prototype/overview-directions` and never merges to `main`.

**The question.** What should a deployed application's Overview look like, so
that it gives a good account of what is going on without alarming anyone? The
owner found today's tiles precious ("The way in" in particular) and liked one
of them, Visitors.

**The plan.** Five variants of Overview, switchable via `?variant=`, on the
existing Overview route (`OverviewLive`), plus today's page for comparison.

| `?variant=` | Direction | The bet |
| --- | --- | --- |
| `now` | Today's page | The tile grid that ships. |
| `a` | Visitors first | The liked tile gets the page: 30 days, the usual day as a line, releases marked on their day. |
| `b` | The brief | A short written report. One subject a row, a figure in the margin only where it is faster than the sentence. |
| `c` | One day, one axis | Visitors, errors, speed, load, releases and Hallvi's work share a 24-hour axis that ends at now. |
| `d` | The path of a visit | Visitors, address, application, server, data: one stop each, with how it is doing. |
| `e` | One line per page | The register: four figures, then a table with the first line of every other page. |

All five share one thing: the head. It says how the address reads in plain
words ("Answering", "Private connection closed") beside the application, and
that sentence replaces the tile with the beating dot. Open things follow the
rule already in `DESIGN.md`: drawn as marks, named for the thing and its
state, never for the reader.

## Run it

```sh
npm run scenarios -- 3480
```

Then open <http://127.0.0.1:3480/prototype/overview>. The bar at the bottom,
or the left and right arrow keys, switches variant. The two selects in the
top bar pick a kind of traffic and what is on record (nothing open, two things
open, a new application, a closed private connection, an address that stopped
answering).

`?variant=` also works on a real application's Overview, on real records.

## Where things are

- `variant.ts`, `switcher.tsx`: the variant in the address, and the bar.
- `facts.ts`: what Overview knows, worked out once. No layout.
- `head.tsx`: the shared head and the smallest shared vocabulary.
- `variant-a.tsx` to `variant-e.tsx`: one direction each. They share no layout.
- `prototype.css`: `ovx-` is shared; `ova-` to `ove-` belong to one direction.
- `src/app/prototype/overview/`: the preview route and its invented records.

The real files it touches, each marked `PROTOTYPE`: `overview-live.tsx`
(switches on the variant, exports `liveReading`), `overview-page.tsx` (passes
the records through) and `src/app/prototype/page.tsx` (a link).
