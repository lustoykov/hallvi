# Architecture directions — throwaway prototype

Branch `claude/architecture-directions`. Three directions for the Architecture
destination, rendered inside the real application shell on the real route
(development builds only). Nothing here is production code; the chosen
direction gets rewritten properly when it is folded in.

## Run

- Dev server: the `architecture-directions` entry in the main checkout's
  `.claude/launch.json` (port 3340, webpack, symlinked `node_modules`).
- Open `/applications/<id>?variant=A#architecture`. The bar at the bottom (or
  the ← → keys) switches A, B, C and 0 (the shipped canvas), the record
  scenario, and a reduced-motion preview.
- The live record is read through `/live-record/*`, a development-only
  rewrite to the main dev server on :3270 (GET only; the firewall read is the
  same provider read the Security view makes). If :3270 is down, the page
  falls back to this worktree's copy of the database.

## Directions

| Key | Name | Structure | Signature interaction |
| --- | --- | --- | --- |
| A | Journeys | The one server as a place a visit, your data and a release travel through (transit map) | Tactile journey selector; a token travels and lights the path; stops unfold their evidence |
| B | Plain sentence | A paragraph composed from the record, beside a cross-section that answers to it | Depth slider rewrites the words plain → exact; phrases open evidence in place; freshness ribbon |
| C | Exploded server | A Three.js assembly: host, disk, private network, services, cover with doors | Spring pull-apart control; question lenses; engineering-plate callouts; scanning re-check |

## What is invented

- Record scenarios other than “Live record”: *3 days later* (same record,
  clock moved), *Prometheus failing* (invented monitoring check), *Before
  deploy* (the plan with nothing running). The bar labels each one.
- “Ask Server Guy to re-check” runs a simulated check; results are tagged
  invented and nothing is contacted. In the product this would be a request in
  the conversation, and the receipt would drive the same motion.
- The caretaker is a placeholder character; mascot concepts live at
  `/prototype/mascots`.

`model.ts` owns every fact and every certainty; the directions only render it.
Verified green requires evidence under a day old, as on Overview.
