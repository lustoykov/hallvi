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

## Logs: Paper, and Monitoring: Tuner (`signal-prototype/`)

Chosen from three directions that each drew both pages from the same
record: the output Server Guy read from each process (the last 100 lines of
each, and only when asked; a process that had written more is marked cut),
the checks the deployment ran and when, the backup checks, and what nothing
watches (a health watch and restarts, CPU, memory and disk, alerts outside
the app). Nothing reads logs or checks the server; asking goes to the
conversation. With nothing recorded the shipped page stands in, and Logs
keeps the element labelled "Collected application logs" and the "Filter
collected logs…" input that the smoke journey uses.

- **Logs · Paper.** No diagram. The read is printed on continuous paper,
  torn where the read stopped and at the top when a process had written
  more than was read, with a highlighter for each process and index tabs
  for where a process said it was ready or warned. Earlier reads peek out
  from behind and come forward when picked.
- **Monitoring · Tuner.** A radio's glass dial with a station for each part
  and signal bars for how recently anything heard from it. Tune by
  clicking, dragging the needle or with the arrow keys; between stations
  there is only static. The tuned station reads what was heard and when,
  then the silence since, and the lamp lights only while something listens.

## Domains: Callers, and Security: Rings (`reach-prototype/`)

Chosen from two sets of three, because the two pages ask different
questions: what name this answers on and what is missing in front of it,
and who can reach it at all. Both read the same record — the address, the
name and certificate if any, the ports the deployment asked the provider
to open and who they were opened to, what listens behind them, and what
protects the server without being a way in. Nothing contacts a host: the
firewall read is the one the shipped Security view already makes, and the
page says plainly when the rules are only what was asked for. With nothing
recorded, the shipped page stands in.

- **Domains · Callers.** The page from the other side of the wire. Four
  visitors knock — you on your network, a stranger, someone typing a name,
  a browser asking for https — and each window shows what the record says
  they meet, with how sure that is: a check proved it, the deployment asked
  for it, or nothing is set up. Picking a window reads out what makes it
  true. Nothing is tried now; the only knocks on record are the
  deployment's own checks.
- **Security · Rings.** Reach as territory: the internet, your network, the
  server, the private network the processes share, each ring inside the
  last, with the wall you must pass written on the border between them.
  Every way in sits in the ring it is reachable from, with the sources
  exactly as they are stated; picking a ring says what someone standing
  there can reach and dims everything they cannot. A rule that opens a
  private service to the internet is drawn as a hole through every wall,
  and a provider read that reports no firewall at all says so where the
  walls would be. The shipped page's own "Check now" and its status note
  stay, so a provider read is still one click.

## The four remaining destinations (`supply-prototype/`)

Configuration, delivery, queued work and schedules, drawn in one round and
each in its own way — because three of the four are about something this
application does not have, which is the honest answer for most
applications and worth more than an empty state. Each says why the record
shows nothing, and what it would take.

- **Environment Variables · Manifest.** Everything the application was
  given, grouped by who decided it: what the repository states, and what
  only you could give. No value is printed, and the model does not carry
  one — a page cannot leak what it does not hold, and Server Guy cannot
  tell a harmless literal from a credential somebody pasted into a
  repository. Each entry says where its value lives instead, and opening
  one says what changing it would cost. Configuration that is a file is
  listed the same way, by what reads it, where, and at which checksum.
- **CDN · Origin.** The layer that is not there, drawn as an empty shelf
  above the one machine that is: its size, where in the world it stands,
  and the address every request ends at. Then the three questions Server
  Guy would answer before recommending a cache, and the failure a cache
  brings with it — a copy served long after the machine changed, which is
  why clearing one needs a place of its own.
- **Cache & queue · Queue.** The line of work waiting to be done, drawn
  empty, because nothing on record queues anything. The broker that would
  hold the line and the workers that would take from it are drawn where
  they would stand. A backlog appears only when a supported integration
  reported one; an empty line is never invented to fill the page.
- **Jobs · Rota.** What recurs on this server, in two columns: yours, and
  Server Guy's. With nothing of yours scheduled the first column draws the
  shape a job would take — its command, its schedule, its next run and its
  last result — beside the one thing that really does recur here, the
  nightly backup, which says plainly that the record does not name its
  hour.

## What is invented

- Record scenarios other than "Live record": _3 days later_ (same record,
  clock moved), _Prometheus failing_ (an invented monitoring check) and
  _Before deploy_ (the plan with nothing running). The bar labels each one.
  Deployment offers Live record, 3 days later and Before deploy; History,
  Processes, Database, Storage and Backups offer Live record and 3 days
  later; Logs and Monitoring offer Live record, 3 days later and Prometheus
  failing, where an invented collector finds a readiness check failing.
  Domains offers _Domain connected_, which invents a name, its certificate
  and public reach so the finished page can be seen at all, and Security
  offers _Firewall read back_, an invented provider read that includes a
  rule for a private service nobody asked for. The four remaining
  destinations offer _Fitted out_, which invents a cache, a queue with a
  backlog, a scheduled command, a waiting value and a CDN, so the pages can
  be seen with something on them. All are labelled invented in the bar and
  on the page.
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
On 12 Sep they took Paper for Logs and the Tuner for Monitoring, then asked
for separate concepts per page from then on; from six of those, Domains took
Callers and Security the Rings. They then asked for the four remaining
destinations in one go ("Redesign the rest of the pages that you haven't in
one go and push to main"), so CDN, Environment Variables, Cache & queue and
Jobs were each drawn once and merged.

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
Backups page and the Calendar's Storage page; on `claude/logs-monitoring`,
the Scope direction, the Tuner's Logs page and Paper's inspection reports;
on `claude/domains-security`, Domains' Address and Handover directions and
Security's Doors and Statement.
