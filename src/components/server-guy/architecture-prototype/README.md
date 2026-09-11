# Dashboard redesign — prototype

The designs the owner chose, rendered inside the real application shell on
the real routes: Overview and Architecture from
`claude/architecture-directions`, Deployment and History from
`claude/deployment-history`. They are the defaults; the bar at the bottom
still switches to the shipped page for comparison. The code is still
prototype code, and gets rewritten properly as it settles.

## Run

- Start the app as usual (`npm run dev`).
- Open `/applications/<id>?variant=A#overview`, `#architecture`,
  `#deployment` or `#history`. The bar at the bottom (or the ← → keys)
  switches between the design (A) and the shipped page (0), the record
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

## Deployment and History: Transit (`deployment-prototype/`, `history-prototype/`)

Journeys' transit language, applied to time. Each page has one visual,
plain words come first and exact values open on click, and nothing animates
when a page opens; Architecture and Overview lost their entrance animations
in the same round, and their flows and state changes still move.

- **Deployment.** Now on the left: what is serving, how sure Server Guy is,
  the one next step (which goes to the conversation), the facts with their
  exact values, the checks it passes and the latest logs. On the right, the
  way here as one line of stops: the recorded events grouped into plain
  phases, the wait for your approval dashed and a failure in red. Pointing
  at a stop lights the line up to it, stop by stop, and a stop opens the
  lines recorded there. What isn't set up sits on the line as dashed ghosts
  where it would go: deploying on push before the first stop, rolling back
  after now. Little Server waits at now.
- **History.** A line with a timetable. A sticky almanac says how the record
  reads, filters it and lists its days. Each operation is a stop with its
  time in a timetable column and its evidence opening in place. A thread in
  the gutter ties each failure to the work that resolved it; pointing at
  either sends a light along it, from the failure to the fix.

When nothing is deployed, Deployment still shows the product's panel that
connects Hetzner and starts the first deployment. Approval, retry and cancel
stay in the conversation's receipts.

History places finished work by its newest recorded step. The deployment
operation's `updatedAt` is its record's and moves whenever the record is
rewritten, which files an old deploy under Today in the shipped page.

## Processes: Line (`stack-prototype/`)

Chosen from three directions. Transit's language, as on Deployment and
History: now on the left, and on the right how a visit reaches the
processes, from your network through port 80 to the web app, with the
private processes behind a wall and ghosts where missing pieces would go.
It reads the stack derived from the deployment and the checks the
deployment passed for each process; nothing is observed live. With nothing
recorded, the shipped page stands in.

## Database: Timeline (`data-prototype/`)

Chosen from three directions that don't use Transit's line. Overview's
lanes, for the database: the check that read it, its copies off the server
and its restore tests. Quiet stretches longer than two hours fold, so
minutes of work and two quiet days share one line, and "To scale" slides
every moment to its clock time. The stretch since the newest copy is shaded
and named, and Little Server stands at now. Nothing is observed live:
scheduled backups may have run since the newest copy on record, and the page
says so. With nothing recorded, the shipped page stands in. Storage gets
its own round with Backups, below.

## Storage: Flow, and Backups: Calendar (`backup-prototype/`)

Chosen from three directions that each drew both pages from the same
record: the volumes and what each holds, what the backup plan copies from
them (`persistentState`: a SQLite volume through its database file alone, a
files volume whole), the copies and restore tests on record, and the
container replacement that kept the volumes. Nothing runs a backup or a
restore; asking goes to the conversation. Scheduled copies the record
doesn't show are unknown, never green. With nothing recorded, the shipped
page stands in.

- **Storage · Flow.** The data drawn as it travels: each piece of a volume
  wired into the daily copy, off the server and down to the tested restore.
  A piece the plan leaves out ends at a wall, and the way back into
  production is dashed because nobody has tried it. Pointing at a part
  sends light along its wires; a part opens its facts below.
- **Backups · Calendar.** One column a day, from the day before the first
  record to a week ahead, with Little Server over today: the copies, each
  piece of data and whether each copy holds it, and the restore tests. A
  day opens what is on record for it.

## What is invented

- Record scenarios other than "Live record": _3 days later_ (same record,
  clock moved), _Prometheus failing_ (an invented monitoring check) and
  _Before deploy_ (the plan with nothing running). The bar labels each one.
  Deployment offers Live record, 3 days later and Before deploy; History,
  Processes, Database, Storage and Backups offer Live record and 3 days
  later.
- "Check now" runs a simulated check: nothing is contacted, and every line
  it produces is tagged simulated. In the product this would be a request in
  the conversation, and its receipt would drive the same motion.

`model.ts` owns every fact and every certainty; the designs only render it.
Verified green requires evidence under a day old.

## What the owner validated

Journeys is the reference for every page designed from now on (10 Sep 2026):

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
become all diagrams. For Deployment and History they chose Transit ("D is
great, let's take it"), and later its Line for Processes too. For Database
they asked for directions without the line and chose the Timeline. From a
round of its own with Backups, Storage took Flow and Backups the Calendar.

## Where the exploration lives

Everything explored along the way stays off main: on
`claude/architecture-directions`, Architecture's plain-sentence and
exploded-server (Three.js) directions with their kits, Overview's note and
console directions, and the mascot family; on `claude/deployment-history`,
Deployment and History's Story, Narrated and Replay directions and the first
round's Ledger; on `claude/processes-database`, the Machine and Console
directions for Processes and Database; on `claude/database-storage`, the
Cutaway and Answers directions for Database and Storage, and the Timeline's
Storage page; on `claude/storage-backups`, the Drill direction, Flow's
Backups page and the Calendar's Storage page.
