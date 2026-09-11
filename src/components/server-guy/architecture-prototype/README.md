# Overview and Architecture redesign — prototype

The designs the owner chose in `claude/architecture-directions`, rendered
inside the real application shell on the real routes. They are opt-in:
development only, and only with `NEXT_PUBLIC_SERVER_GUY_PROTOTYPES=1`, so CI,
the browser tests and every other dev server keep the shipped pages. Nothing
here is production code yet; it gets rewritten properly when it replaces the
shipped pages.

## Run

- Start a dev server with `NEXT_PUBLIC_SERVER_GUY_PROTOTYPES=1 npm run dev`.
- Open `/applications/<id>?variant=A#overview` or `#architecture`. The bar at
  the bottom (or the ← → keys) switches between the design (A) and the
  shipped page (0), the record scenario, and a reduced-motion preview.
- The live record is read from the app's own API with GET requests only; the
  firewall read is the same provider read the Security view makes.
- Little Server in every mood, pointing included: `/prototype/little-server`.

## Architecture: Journeys (`architecture-prototype/`)

The one server as a place a visit, your data and a release travel through,
drawn as a transit map. A tactile selector picks the journey; light travels
the path and lights each stop as it passes, and every stop opens its plain
words, evidence and facts. Missing pieces (monitoring, HTTPS) are drawn as
ghosts where they would go, and the firewall is a wall with two doors.

## Overview: Timeline (`overview-prototype/`)

The last day and a half and the next half day as four lanes: checks,
backups, server and access. The stretch since anything looked is drawn and
named ("No check for 26 h"). Little Server stands at now; a re-check lands on
the lanes and streams into his log, which sits open underneath. A line in
the log lights its moment on the lanes, and a moment lights its lines. What
needs you is only ever real and comes first. The map in miniature pings a
failing part and opens Architecture with that part's details open.

The log's label, "What I did last", reads like an agent at work, after Claude
Code's spinner and the ultracode shimmer. At rest it is a quiet slate star.
While a check runs, the star steps through its rays, a cool light crosses the
words and the seconds count. After a pass, or with news since your last
visit, it answers once. Little Server points at it rarely: once to introduce
the log, then at most weekly and only for news; never during a check or when
something needs you, and with reduced motion he only says it. To review it,
`&looked=never` replays the introduction and `&looked=20h` pretends you were
away for 20 hours.

## What is invented

- Record scenarios other than "Live record": _3 days later_ (same record,
  clock moved), _Prometheus failing_ (an invented monitoring check) and
  _Before deploy_ (the plan with nothing running). The bar labels each one.
- "Check now" runs a simulated check: nothing is contacted, and every line
  it produces is tagged simulated. In the product this would be a request in
  the conversation, and its receipt would drive the same motion.

`model.ts` owns every fact and every certainty; the designs only render it.
Verified green requires evidence under a day old.

## What the owner validated (10 Sep 2026)

Journeys is the reference for every page designed from now on:

- **Bird's-eye first, depth on demand.** The whole picture is visible at
  once; clicking a part opens plain words, evidence, facts, a link to its
  destination and "Ask in the conversation".
- **Alive, with purpose.** Light travels the flows; a re-check streams step
  by step; Little Server reacts. Reduced motion is honoured.
- **Honest and crafted.** One certainty per part (verified, out of date,
  failed, planned, not set up), and what is missing drawn where it would go.

For Overview the owner chose the Timeline ("let's use the A Timeline now"),
with the log from Little Server's note folded underneath.

## Where the exploration lives

Everything explored along the way stays on `claude/architecture-directions`,
not here: Architecture's plain-sentence and exploded-server (Three.js)
directions with their kits, Overview's note and console directions, and the
mascot family.
