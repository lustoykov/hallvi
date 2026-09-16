# The presentation contract

How a record becomes a designed page.

Pi writes what it observed. The controller records what ran. Components draw.
This document is the join between them, and it is deliberately the size of
what is implemented — one page, Architecture, end to end on real records.
Everything the designs will eventually want is in [Deferred](#deferred), kept
apart so nobody mistakes a proposal for a contract.

The semantics this rests on, which are not up for renegotiation:

- **identity** — what a thing *is*, such that a change makes it a different
  thing. A rebuilt machine is a new subject, not an aged fact.
- **evidence** — every claim cites what established it, and when.
- **planned versus observed** — an intention is drawn differently from a
  reading, and never quietly promoted.
- **honest absence** — silence means nobody looked. Only a record can say a
  thing is not there.
- **historical versus current** — the same check is a recorded outcome on the
  page that records the event, and evidence about now in a lane that asks
  whether it still holds. Neither reading changes what is stored.

---

## 1. What a record carries

```ts
presentation: {
  about?: Ref[]                                   // everything it concerns
  states?: { ref: Ref; presence: "present" | "absent" }
  views: Destination[]
  role: "recommendation" | "status" | "outcome"
  status: "info" | "verified" | "failed" | "warning"
  checks: Check[]
  facts?: Fact[]
  nextStep?: string
  url?: string
  content?: Topology | Deployment | ApplicationAccess
}

type Ref   = { kind: SubjectKind; id: string }
type Claim = "identity" | "configuration" | "reachability" | "liveness" | "contents"
type Basis = "observed" | "planned" | "reported"

interface Fact  { key: string; label: string; value: string; mono?: boolean;
                  claim: Claim; basis: Basis; freshFor?: number }
interface Check { key: string; label: string; status: "passed" | "failed" | "info";
                  claim: Claim; basis: Basis; about?: Ref; detail?: string;
                  freshFor?: number }
```

`about` and `states` live inside `presentation` because that is what views
read, and because the `presentation` column is the one place a record's
readable shape is stored. There is no second home for them.

**`states` is what makes a record answerable as current state**, and there is
at most one. A record without it is an event: a deployment touches four
subjects and speaks for none of them, which is why it appears in Deployment's
history and never answers "what is the state of the database".

**Only `states` can say a thing is absent.** No record at all means nobody
looked. These are different pages and they must read differently.

### Subject kinds

`application` · `host` · `process` · `volume` · `door` · `certificate` ·
`monitor` · `access` · `backup-plan` · `backup-copy` · `restore-test` ·
`database` · `cache` · `queue` · `job` · `variable` · `domain` · `cdn` ·
`firewall`

Bounded on purpose, and each one earned by a view that reads it — the list in
`src/server/operator-data.ts` says which. A kind is added when a concrete view
needs it. A vocabulary nothing consumes is a second representation waiting to
disagree with the first.

The three that Backups rests on are separate subjects on purpose, because they
answer different questions and each can be absent on its own. A `backup-plan`
says copies are meant to happen. A `backup-copy` is one dated copy that
exists. A `restore-test` is the only thing that says a copy is worth
anything. None is inferred from another, and a page that merges any two of
them is wrong: a schedule with no copies is a promise, and copies with no
restore test are files nobody has opened.

**Pi reuses a reference.** `host:hetzner-165619823` is the same host on every
later observation, which is what lets a second look add to the first instead
of sitting beside it. Where the controller already owns an id — a provider's
server id, an execution id — that is the id to use.

---

## 2. Three typed contents, and no more this milestone

| Content | Job |
| --- | --- |
| `topology` | Composition: what the parts are and how they connect. |
| `deployment` | What was released: repository, revision, image, server, changes. |
| `application-access` | Where the application answers, and how privately. |

```ts
{ kind: "topology",
  from: "plan" | "observed",
  parts: { id; kind: PartKind; name; role; plain; owner? }[],
  edges: { from; to; network: "public" | "private" | "loopback" | "disk"; label? }[] }
```

**Topology describes composition and nothing else.** A part carries what it is
and what it is for. It carries no facts, no checks and no state: those are read
from the records that state that part. And it declares nothing absent — a
design may draw a placeholder where something could be, but only a record can
say there is none. Two authorities on one question eventually disagree, and a
reader has no way to tell which to believe.

`owner` on a volume says what mounts it. `loopback` is neither `public` nor the
container network: the current deployment is reached through a tunnel to the
host's own loopback, and drawing that as public was wrong.

---

## 3. Reading: three separate questions

Implemented in `src/server/record-projection.ts`. Every view asks it; no view
reads records directly.

### Presence

The newest unretired record stating the subject, and what it said. Three
answers, and the third is not a kind of the second:

| The view sees | Means |
| --- | --- |
| no record states it | **nobody looked** — "Not assessed" |
| newest says `absent` | **Pi established there is none** |
| newest says `present` | it is there |

### Outcome

What the checks say. `failed` and `warning` are judgements: they survive
everything, including the clock. A failure does not age into doubt.

Checks about a subject come from records stating it **and** from `check.about`
on records that do not — a deployment event saying its API answered is
evidence about the process it names. The newest observation of a key wins in either case. An explicit
`check.about` selects its subject; otherwise it inherits `states.ref`. A newer
failed check in an event must not be hidden by an older subject success.

### Freshness

Of the claim being drawn, for the reading the component presents. Never of the
subject as a whole.

```
expiry  identity never · configuration 7d · contents 3d · reachability 12h · liveness 15m
fresh(x, record) = record.establishedAt !== null
                   && now - establishedAt < (x.freshFor ?? expiry[x.claim])
```

Timestamps are inherited, never carried: a check is as of its record's
`establishedAt`. Observations gathered at materially different times belong in
different records — that is what keeps `establishedAt` meaningful.

| Reading | Where | Ages? |
| --- | --- | --- |
| recorded outcome | Deployment's check list, History | no — keeps passed, failed, noted |
| evidence about now | Architecture's part tag, Overview's lanes | yes — per claim |

Ageing never turns green into red. Stale is amber and says it may have
changed; only a check that ran and failed is red.

A claim we cannot age — no `claim` on the item, or nothing established — reads
as **recorded**, not as verified. A missing input renders unknown, never
healthy.

### Partial observations

The newest record carrying each key wins, and each value keeps the record it
came from, which is what dates it and cites its evidence. A later record
saying only "SSH answered" leaves the earlier location and size standing: they
were never contradicted, and Pi correctly did not re-assert what it did not
re-observe.

A replacement machine inherits nothing, because it is a different identity and
so a different subject. No epoch machinery is needed for that, and none
exists.

`retiredAt` is the one write-once flag, and it is a tombstone rather than an
edit: no word of what a record said ever changes. A retired record leaves
every current read — the previous record carrying that key becomes current
again — and stays in the series, marked withdrawn.

---

## 4. Who owns what

| | Owns | Never |
| --- | --- | --- |
| **Pi** | Meaning: what a thing is and is for, whether an outcome is good, what the parts are and how they connect, which claim a fact makes. Titles, descriptions and explanations are Pi's prose and are shown as written. | A relative time, a count, a colour, a layout slot, or a fact it did not observe. |
| **The controller** | Events: executions, messages, approvals, runs. Read directly; Pi never re-types what an execution proves. | — |
| **Components** | Layout, slots, ordering, counts, relative times, status labels, freshness arithmetic, interaction and every bit of local UI state. | Inventing a fact to complete a picture. |

**Layout slots are the component's, references are Pi's.** The map has one
place for a host; Pi calls it `hetzner-165619823`. The builder assigns parts to
slots by kind and keeps the reference for reading records. Neither side has to
know the other's naming.

---

## 5. Architecture: the state the page needs

Built by `architectureFromRecords`, drawn by the accepted Journeys design.

| Field | Source | Refreshed when |
| --- | --- | --- |
| parts, edges | newest `topology` on the record stating the application | Pi records a new map |
| a part's facts | `currentFacts(ref)` — newest record per key | Pi observes that part |
| a part's tag | its declared check, read as evidence about now | Pi observes it, or the clock passes the claim's horizon |
| presence | newest record stating the part | Pi records presence or absence |
| region | the host's `region` fact, by key | Pi re-reads the host |
| openness | `application-access` mode, else an inbound edge's network | Pi records access |
| revision | newest `deployment` content | Pi deploys |
| monitoring placeholder | records stating any `monitor` | Pi looks, or sets one up |
| condition | the application's own checks | Pi observes the application |
| journeys | composed from the parts present, in slot order | with the parts |

Declared keys, which are the only ones that may drive what the map says:

| Part | Tag check | Facts it draws |
| --- | --- | --- |
| host | `ssh` | `address` `region` `size` `server-id` `os` |
| web | `http`, `container` | `image` `port` `revision` |
| private | `reachable`, `container` | `image` `port` |
| volume | `persistence` | `path` |
| gate | `refused`, `open` | `port` `sources` |
| certificate | `valid` | `expires` |
| monitor | `answering` | `target` |
| backup-plan | `configured` | `schedule` `destination` `destination-kind` `keep` `covers` |
| backup-copy | `written` `verified` | `size` `destination` `destination-kind` `covers` |
| restore-test | `restored` | `covers` `took` |

A check under any other key still reads in the part's detail. It never decides
what the map says: an unknown key silently driving designed UI is how a page
starts asserting things nobody specified. A failure is the one exception — it
is worth saying even under a key this page does not know.

### The five reads this page has to get right

Implemented as `tests/application/integration/record-projection.test.ts`.

1. **The first observations produce the designed map.** A topology and a host
   observation draw every part, in its slot, with the host's facts and its
   tag; a deployment event's checks reach the parts they were `about`.
2. **A later SSH-only observation preserves the configuration and its
   timestamps.** The check comes from the newer record; the location still
   reads Helsinki, still dated to when it was actually read.
3. **A replacement machine inherits nothing.** Different identity, different
   subject. The old machine reads absent and stops being described.
4. **Monitoring goes unassessed → explicitly absent → present**, and leaves no
   ghost behind once a monitor is on the map.
5. **The same records read twice give the same page.** Refresh reconstructs it
   part for part; the page holds no state of its own.

---

## 6. Overview: the state the page needs

Built by `overviewFromRecords`, drawn by the accepted Overview design. It
reads the same projection as Architecture and adds no vocabulary of its own
except the one claim below.

| Field | Source | Refreshed when |
| --- | --- | --- |
| headline | the `web` part's name, else the application's | Pi records a new map |
| **needs** — a failed check | any check read as evidence about now that says `failed` | Pi observes |
| **needs** — a decision | an execution awaiting approval | immediately; the controller owns it |
| **needs** — a failed outcome | a record whose `status` is `failed` | Pi records one |
| **ideas** | records with `role: "recommendation"`, using Pi's own `nextStep` as the draft | Pi recommends something |
| **vitals** — lane state | that lane's checks, read as evidence about now, worst first | Pi observes, or the clock passes a claim's horizon |
| **vitals** — lane facts | `currentFacts` of the subjects in that lane | Pi observes them |
| **vitals** — plain words | the lane subject's `plain` or the record's title, as Pi wrote it | Pi rewrites it |
| **recent** | executions and established records, newest first | any work happens |
| Tomorrow, countdowns | **deferred** — needs `schedule`; the hero ships with history and now | — |

### Lanes

`lane(check) = laneOf(check.about ?? record.states.ref)`, restored to the
projection now that a view consumes it. `record.about` is never consulted: it
is unordered, so no element of it is privileged.

```
process, database, volume, application → checks
backup-plan                            → backups
host                                   → server
access, door, domain, certificate      → access
anything else                          → no lane, and no timeline
```

**A volume belongs to the application, not to Backups.** The design's own
slot-based mapping put volumes under Backups, which would have read "backups
are fine" on the strength of a restart test that never copied anything
anywhere. Surviving a restart is the application keeping its own data. Only a
`backup-plan` — and the copies and restores that reference one — speaks to
whether a copy exists somewhere else.

### The application's own health

The `checks` lane, and Overview's headline condition, ask what is true of the
application itself. No record answered that: a deployment event speaks for
none of the four subjects it touches, by design.

So Pi records a health claim **stating the application**, carrying the checks
the evidence establishes, with `establishedAt` set to when that evidence was
gathered rather than when the record is written. That single rule is what lets
one lane distinguish four readings without any of them being guessed:

| Overview reads | Because |
| --- | --- |
| healthy | a check passed and its claim is still in window |
| stale | it passed, and enough time has passed that it may have changed |
| failed | a check ran and did not pass |
| unassessed | no record states the application |

Preserving the original timestamp is the whole point. A record written now
about evidence gathered an hour ago is stale, and saying so is the difference
between a page that reports and a page that reassures.

---

## 7. Deployment: the state the page needs

The accepted Transit design tells the story of one release: what was
deployed, what changed, what was verified, and how it is reached. Its model
is the first that needs **execution evidence as much as records** — the
phases are what actually ran, and the controller owns those.

| Field | Source | Refreshed when |
| --- | --- | --- |
| revision, image, server, changes | the newest `deployment` content | Pi deploys |
| repository | that content's `repositoryUrl` | with it |
| statement, detail | the record's title and body, as Pi wrote them | with it |
| tone, word | `tagFor(record, shown, now)` — the record's status aged by the claims the page shows | with it, or the clock |
| checks | that record's checks: label, `detail` as the probe, `establishedAt` as the time | with it |
| `check.inside` | derived: a check about a `process` or `volume` was made on the server; one about `access` was made from this PC | with it |
| phases, lines | **executions** of the run that produced the record, in order, with their output | as they run |
| started, took | the run's first execution to its last | as they run |
| attempts | how many `deployment` records exist — each release is its own event | Pi deploys again |
| state | `awaiting` from an execution awaiting approval, `working` from a running one, then the record's own status | immediately for the first two |
| access | the newest `application-access` record: mode, ports, and its URL | Pi records access |
| gaps | recommendations whose views include deployment | Pi recommends |

**Attempts are records, not a counter.** A deployment is a historical event
and each one is written once, so "the third attempt" is the third record
rather than a number anybody increments. That is also what lets History show
the failures: they are still there.

`logs` is the newest execution's captured output, with the time it was
captured — never re-run to fill the panel.

---

## 8. History and Logs

Both are mostly **controller evidence**, which is why they came last and
cost least: the controller already records what ran, and Pi never re-types
what a command proves.

### History

| Field | Source |
| --- | --- |
| an event | every record with an `establishedAt`, and every execution |
| its kind | `change` for a release or an access record and for commands that alter; `inspection` for everything else |
| its state | the record's status, or the execution's |
| where it came from | the record's cited message, or the execution's conversation |
| what it touched | the record's `views` |
| its words | the record's title and body, or the command and its exit |
| a withdrawal | a retired record stays visible and says Pi took it back |

A record with no `establishedAt` is left out: it would be dated to the
moment somebody wrote it rather than to an event.

**`resolves` stays deferred.** Nothing Pi writes says which later work
addressed an earlier failure, and inferring it from adjacency would put a
claim on the page nobody made. The consequence is named rather than hidden:
every failure reads as still wanting you, which is true and coarse.

### Logs

| Field | Source |
| --- | --- |
| a captured run | an execution with output |
| its place | the server, the repository copy, the provider, or Server Guy — from the tool |
| when it was captured | `finishedAt`, else `createdAt` |
| its outcome | the exit code, where there is one |
| streams | those places, with line counts and the newest capture |

**Logs collects nothing.** Re-running a command to fill a panel would make
the page a cause of work rather than a record of it, and this page gets
Navigate and Ask only. Asking is a message; the next captured output is what
changes the page.

Streams are places, not services, because a line's meaning depends on where
it was read — a port bound on the server is not the same claim as a port
bound in a throwaway copy of the repository.

---

## 9. Refused at the door

`src/server/record-contract.ts` runs at save. Zod settles shape; this settles
what shape cannot: a check with no claim has no horizon, two facts sharing a
key mean one silently erases the other, a record that says a thing is absent
and then describes it says two things at once. None of that fails to parse and
all of it produces a page that either lies or renders nothing.

Findings are written for Pi — which check, what is missing, a suggested key,
what to write instead — and arrive as a tool error it can correct in the same
turn. Only the mechanical floor: whether a body is meaning-first is a
judgement about prose and is not decided here.

---

## 10. Where a copy goes

`destination-kind` is the one fact that decides what losing a machine costs,
and it is declared rather than read off prose: `/var/backups/shop` and
`s3://bucket/shop` are both destinations and one of them dies with the server.
Exactly four values, and a plan that declares none reads as **unclassified**,
which the page treats as unproven rather than safe.

| | Survives losing the application host | Survives losing the controller | Application-aware |
| --- | --- | --- | --- |
| `same-server` | no | yes | yes |
| `controller` | yes | no | yes |
| `off-site` | yes | yes | yes |
| `provider` | yes | yes | **no** — a whole-disk snapshot, which can rebuild a machine and says nothing about the data being consistent |

A record's own `status` is read alongside its checks wherever a lane or a
verdict is formed. `failed` and `warning` are judgements and do not age, and a
`warning` outranks a passing check on the same record: Pi recording a
same-host plan as a warning is what stops a passing "the timer is active"
printing green under the word Backups.

Three pictures of the same rule: [what a record is allowed to claim](architecture/recovery-claims.html),
[wording that outruns its record](architecture/wording-and-records.html), and
[what a page may print, and where](architecture/page-evidence-and-labels.md).

## 11. Actions

**Navigate** and **Ask**. Nothing on a designed page executes anything. A
re-check is a question in the conversation, and the records it produces are
what change the page.

---

## What the old facts model carried, and where it landed

Traced against `buildModel` in `architecture-prototype/model.ts`, which is
what the accepted designs were built on. The design is unchanged; this is
only where each of its inputs now comes from.

| Original input | Now | State |
| --- | --- | --- |
| `facts.services` | `topology` parts of kind `private`, state from `process:<id>` | covered |
| `facts.security` | parts of kind `gate`, with `port` and `sources` facts from the `door` or `access` record | covered, proved on the real deployment |
| `facts.monitoring` | a `monitor` subject, and a `monitor` part when one exists | covered, proved |
| `deployment.address`, `serverId` | the host's `address` and `server-id` facts | covered, proved |
| `deployment.bundleHashes` | `deployment` content's `image` and `revision` | covered, proved |
| `deployment.events` | controller executions, read directly | covered, proved |
| `facts.domains.tls.*` | a `certificate` subject, keys `valid` and `expires` | **in the vocabulary, unexercised** — this deployment has no domain, so nothing proves it |
| `facts.protection.*` — coverage, history, restore tests | nothing | **deliberate gap.** `backup-plan` is deferred, so an `offsite` part draws with no state and the Backups lane reads "Not assessed" until it lands. That is honest, and it is also permanent until then: no record can currently say a copy exists. |

Two mis-mappings found while tracing, both fixed in the components rather
than in the data:

- Overview's subline read the **web part's** check, so the page could say
  "passed its checks" about the process while nothing had been established
  about the application. It reads `condition` now.
- A lane with nothing on record borrowed the timeline window's edge and
  printed a duration — "No copy for 36 h" for something nobody had looked at.
  An empty lane says so instead.
- The design's own part-to-lane map put volumes under Backups. One rule now:
  only an off-site copy speaks to Backups.

## Deferred

Proposals, not contract. Each arrives when a concrete view needs it, and each
brings its own read rules and its own worked example.

- **`schedule` and recurrence** — the Backups calendar, Overview's Tomorrow,
  a job's next run. A recurrence that cannot be expanded may be printed and
  never computed from.
- **Combining a copy and a restore into one reading automatically.** The three
  subjects are live and the Backups page reads all three, with a verdict over
  them (`protectionVerdict`) that Overview's lane shares. What is still
  deferred is the arithmetic that would let a page decide protection *without*
  Pi's judgement: today a plan Pi declines to warn about, whose copies are all
  off-site and restored, reads verified, and a plan Pi marks `warning` reads
  limited whatever its checks say. That is the right default and it does lean
  on Pi getting the judgement right.
- **`doors` with `complete`** — Security's walls and Domains' callers. Until
  then a port with no rule on record is unknown, not closed.
- **`inventory`** — Variables' manifest, Processes beyond what topology gives.
- **`measurement`** — numbers with units. A number is not a pass or a fail and
  is never coloured.
- **`resolves`** — pairing a failure with its repair, for History.
- **Withdrawing a fact without replacing it.** Write a new observation, or an
  `absent`.
- **Ongoing synchronisation** — a deterministic check that re-reads the
  server, saves the observation and updates the page without a model call,
  waking Pi only when interpretation is needed. Its first rule is already
  settled: a failed connection produces "could not check", never "the
  application stopped".
- **Execute actions** — a capability the controller runs without a model call.
  The happy path ships none.

Every one of these is additive. None of them changes what section 3 says about
presence, outcome or freshness.
