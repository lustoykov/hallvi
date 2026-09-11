# Dashboard redesign — prototype

The designs the owner chose in `claude/architecture-directions`, rendered
inside the real application shell on the real routes. They are the default
Overview and Architecture; the bar at the bottom still switches to the
shipped page for comparison. Deployment and History have two directions each
on `claude/deployment-history`, not chosen yet. The code is still prototype
code, and gets rewritten properly as it settles.

## Run

- Start the app as usual (`npm run dev`).
- Open `/applications/<id>?variant=A#overview`, `#architecture`,
  `#deployment` or `#history`. The bar at the bottom (or the ← → keys)
  switches between the designs and the shipped page (0), the record
  scenario, and a reduced-motion preview.
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

## Deployment and History (`deployment-prototype/`, `history-prototype/`)

Two directions each, after the owner's note that the app should not become
all diagrams. Each page has at most one visual; plain words come first and
exact values open on click; nothing animates when a page opens. The same
now holds for Architecture and Overview on this branch: their entrance
animations are gone, and the flows and state changes still move.

- **Deployment · A Story.** A release card says what is serving and how sure
  Server Guy is, with the one next step, which goes to the conversation:
  release an update, review and approve, or look into a failure. Its four
  facts open their exact values. One band shows how it got there: the
  recorded events grouped into plain phases, the wait for your approval
  hatched and a failure in red. Hovering a phase lights it on the band, and
  each phase opens the recorded lines behind it. Then the checks it passes
  and where from, ghosts for what isn't set up (rolling back, deploying on
  push) and the latest logs.
- **Deployment · B Ledger.** The same record as typography: the statement, a
  sheet of exact facts, and tables for the phases, the checks and every
  recorded action.
- **History · A Story.** One sentence reads the record, a tactile filter
  narrows it, and each operation says what happened in plain words on a
  quiet rail of days. A failure links to the work that resolved it, and the
  link lands there; evidence opens in place as a console.
- **History · B Ledger.** One table: filter tabs with counts, day rows, and
  the evidence as a row that opens beneath.

When nothing is deployed, Deployment still shows the product's panel that
connects Hetzner and starts the first deployment. Approval, retry and cancel
stay in the conversation's receipts.

Found on the way: History places each operation by its `updatedAt`, and the
deployment's is its record's, which moves whenever the record is rewritten.
In this copy the verified deploy reads this morning although its last event
was on Sep 9, so the shipped History files it under Today. The prototype
places finished work by its newest recorded step instead.

## What is invented

- Record scenarios other than "Live record": _3 days later_ (same record,
  clock moved), _Prometheus failing_ (an invented monitoring check) and
  _Before deploy_ (the plan with nothing running). The bar labels each one.
  Deployment offers Live record, 3 days later and Before deploy; History
  offers Live record and 3 days later.
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

On 11 Sep the owner loved Architecture and its data flows but found the
entrance animation too much, and asked for a balance so the app doesn't
become all diagrams.

## Where the exploration lives

Everything explored along the way stays on `claude/architecture-directions`,
not here: Architecture's plain-sentence and exploded-server (Three.js)
directions with their kits, Overview's note and console directions, and the
mascot family.
