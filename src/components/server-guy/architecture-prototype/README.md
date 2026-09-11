# Dashboard redesign — prototype

The designs the owner chose in `claude/architecture-directions`, rendered
inside the real application shell on the real routes. They are the default
Overview and Architecture; the bar at the bottom still switches to the
shipped page for comparison. Deployment and History carry Story and three
takes on it on `claude/deployment-history`, not chosen yet. The code is
still prototype code, and gets rewritten properly as it settles.

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

After the owner's note that the app should not become all diagrams, each
page has at most one visual, plain words come first and exact values open
on click, and nothing animates when a page opens. Architecture and Overview
lose their entrance animations on this branch too; the flows and state
changes still move. The owner found Story a good start, so B, C and D are
three takes on it that disagree about structure. Each applies to both
pages.

- **A · Story.** Deployment: a release card, one band of plain phases that
  open their recorded lines, then the checks, ghosts for what isn't set up
  and the logs. History: a calm feed on a rail of days, where a failure
  links to the work that resolved it.
- **B · Narrated.** Words first. Deployment is Server Guy's own account, in
  the first person: each sentence opens the lines recorded behind it, and a
  thin ribbon under the words lights with them. The facts, checks and gaps
  sit in a margin. History is his diary: a few sentences a day, one for each
  stretch of work. Everything he did is a link that opens its record under
  the words, and a failure is told with the retry that fixed it.
- **C · Replay.** Time first. The page opens still, at now. On Deployment
  the band becomes a recording: drag the playhead or press Replay, and the
  card, the recorded lines and the checks show the deployment as it was at
  that moment, while Little Server walks the track. On History a ruler runs
  over the whole record with quiet stretches folded and labelled; scrubbing
  it dims everything after the playhead, and the ruler stays in view while
  the record scrolls under it.
- **D · Transit.** Space first, in Journeys' transit language. Deployment
  puts now on the left and the way here as one line of stops on the right.
  Pointing at a stop lights the line up to it, stop by stop, and what isn't
  set up sits on the line as dashed ghosts where it would go. History is a
  line with a timetable: a sticky almanac filters the record and lists its
  days, and a thread in the gutter ties each failure to its fix, with a
  light that runs along it when you point at either.

The first round's Ledger is gone; it stays in this branch's history.

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
- Replay replays the recorded events only; it contacts nothing.

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
become all diagrams. Of the first Deployment and History round, Story was
"a good start", with three more versions to follow.

## Where the exploration lives

Everything explored along the way stays on `claude/architecture-directions`,
not here: Architecture's plain-sentence and exploded-server (Three.js)
directions with their kits, Overview's note and console directions, and the
mascot family.
