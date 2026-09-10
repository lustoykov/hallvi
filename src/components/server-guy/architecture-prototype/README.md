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

## What the owner validated (10 Sep 2026)

Journeys (A) is the reference for every page designed from now on:

- **Bird's-eye first, depth on demand.** The whole picture is visible at once;
  clicking a box opens plain words, evidence, facts, a link to its destination
  and "Ask in the conversation".
- **Alive, with purpose.** Light travels the flows and stops light up as it
  passes; a re-check streams step by step; Little Server reacts. Reduced
  motion is honoured.
- **Honest and crafted.** Crafted cards on a quiet canvas, one certainty per
  part (verified, out of date, failed, planned, not set up), and what is
  missing drawn as a ghost where it would go.

Settled: Server Guy's report (Little Server, the verdict and the console)
belongs on Overview; Architecture keeps the map.

## Overview (`overview-prototype/`)

Open `/applications/<id>?variant=A#overview`; the same bar, keys and record
scenarios as Architecture.

This round asks what the top of Overview should be: how it is doing, and
whether anything needs you. The owner found the first version "scrambled
together" (a report, a console strip and four cards repeating each other).
Each direction below replaces all three with one composition; the header, the
map in miniature, recent work and one quiet line of ideas stay the same.

| Key | Name | Structure | Signature interaction |
| --- | --- | --- | --- |
| A | Timeline | The last day and a half and the next half day as four lanes (checks, backups, server, access); the stretch since anything looked is drawn and named; Little Server's log folds underneath (B's terminal, at the owner's request) | Little Server stands at now; a re-check lands on the lanes and streams into the log; point at a log line and its moment lights up, point at a moment and its lines do |
| B | Little Server's note | A short note in Little Server's words; every fact is a highlighted phrase in the certainty's colour | Phrases open their evidence in place; the countdown ticks inside the sentence; the console folds under the signature |
| C | Console | Server Guy's console as the centrepiece; the vital signs are its status lines, the recorded work runs underneath | Rows open in place; a re-check streams into the log while the rows turn from checking to verified |

What needs you is only ever real, and each direction shows it first. The map
in miniature pings a failing part, lights the part you point at anywhere on
the page, and opens Architecture with that part's details already open.

Earlier round, parked at commit a64b165: how ideas are offered (Quiet, Little
Server suggests, Two lanes). The owner wants ideas optional and calm, so every
direction keeps the quiet line.
