# The presentation contract

A proposal, 12 September 2026, revised after review. It describes the data and interaction contract the accepted reference designs need in order to run on real Pi output. Nothing here is implemented: no schema, database, migration or deployment change is proposed, and no view is rewritten.

Written against every reference destination and its states on the reference build, and against what exists on `codex/hetzner-provisioning`: `src/server/operator-data.ts`, `src/server/pi.ts`, `src/components/server-guy/record-overview.tsx`, `application-section-view.tsx`, [component design](../src/components/server-guy/DESIGN.md) and [operator design](operator-design.md).

**The premise throughout: Pi supplies facts, components own layout.** Every sentence the reference speaks is composed by a component from fields. Pi is never asked to write a relative time, a colour, a count, a lane, a journey sentence or a headline.

Two documents in one. Sections 2–9 are the **full contract** the accepted designs need. Section 11 is the **smallest slice** — what the deployment we already have needs to run its existing screens on real records, with backups, scheduling and recovery deliberately left out.

---

## 1. What exists, and what is missing

Today a surfaced record is prose plus a flat list of checks, with two typed contents (`deployment`, `application-access`) and four authored check subjects. That is enough for a card and a first timeline. Six things the designs do are not expressible in it.

1. **A record cannot say what it is about.** Every record is new. Nothing says this observation of `todo.db` concerns the same thing as the last one, so no view can show a current state.
2. **A record cannot say how long a fact stays true**, and different facts about the same thing age differently. "This host is in Helsinki" and "SSH answered" are both about the host; one is permanent and one is worth hours.
3. **A record cannot say what is going to happen.** Overview runs into Tomorrow; the Backups calendar draws scheduled days with no copy on record.
4. **A record cannot say how we know.** Security exists to say "these are the rules the deployment asked for, not a read of what is in place".
5. **A record cannot distinguish not-yet, not-there and not-looked.** Before deployment every lane reads "Planned". After it, Backups reads "Not set up". Neither is the same as nobody having checked.
6. **Several of the designs' fields are prose.** "Daily at 03:15" cannot drive a calendar; a door's sources cannot be a sentence.

---

## 2. Records are append-only; "current" is a read

The first draft said both "updates in place" and "keeps every observation". That was a contradiction. The write behaviour is:

**Nothing is ever mutated or deleted. Every record is written once and kept.** What changes is which record a view reads.

Two independent fields carry the relationships, and only one of them makes a record answerable as current state.

```ts
/** Everything this record concerns. Links, never replacement. */
about: Ref[]

/** At most one subject whose current state this record asserts. */
states?: { ref: Ref; presence: "present" | "absent" }

type Ref = { kind: SubjectKind; id: string }
```

### 2.1 A record is a partial observation, not a snapshot

**A record states only what Pi observed this time.** It does not restate what it did not look at. The consequence is that "the current state of X" is not one record — it is assembled, key by key, from the newest record that carries each key.

Every fact and check therefore needs a stable machine key alongside its display label:

```ts
interface Fact  { key: string; label: string; value: string; mono?: boolean; claim: Claim; basis: Basis }
interface Check { key: string; label: string; status: "passed" | "failed" | "info";
                  claim: Claim; basis: Basis; about?: Ref; detail?: string }
```

| Read | Definition |
| --- | --- |
| **Presence of X** | the newest record stating X; its `presence` |
| **Current fact `k` of X** | the `k` fact from the newest record stating X that carries `k`, within the current presence epoch |
| **Current check `k` of X** | the same, for checks |
| **Series for X** | every record stating X, oldest first |
| **Everything about X** | every record with X in `about` **or** `states.ref` |

The **presence epoch** is the run of records since the newest change in `presence`. Assembly never reaches past it: a host that was destroyed and rebuilt does not show the old machine's address, because those facts are on the far side of an `absent`. Within one epoch, a record that says only "SSH answered" leaves the earlier location and size facts standing — they were never contradicted, and Pi correctly did not re-assert what it did not re-observe.

Withdrawing a fact without replacing it (Pi learns a value is simply no longer true, and has no new one) is deliberately **not** in the first slice; write a new observation or an `absent` instead.

Consequences, stated as rules:

- A record with `states` supersedes nothing physically. The previous record for that subject is still stored, still readable, still in the series and still in History. "Superseded" is a property of a read, not a write.
- **A record without `states` never becomes current state of anything, no matter how many things it is about.** A copy of the database is `about` `database:todo` and `backup-plan:daily` and stays an event: it appears in Database's copies lane, on the Backups calendar and in Storage's off-the-server node, and it never answers "what is the state of the database".
- `states` is at most one subject. A record that would state two is two records. This keeps "current" unambiguous.
- `about` is additive and unordered. It is what every "show me everything that touched this" read uses.
- **`retiredAt` is the one exception to "nothing mutates", and it is a tombstone rather than an edit.** No word of what a record said ever changes: not its title, body, checks, facts, `about`, `states`, `establishedAt` or evidence. `retiredAt` is a write-once flag meaning "Pi no longer stands behind this observation", and it changes visibility only. Retiring is a correction, not a way to say a thing stopped existing — that is a new record with `presence: "absent"`.
- **A retired record leaves every current read.** Assembly skips it, so the previous unretired record carrying that key becomes current again, and the subject's presence falls back to the newest unretired record stating it. The retired record stays in the series and in History, marked withdrawn: the reader can still see that Pi once said it and then took it back.

### 2.1 Presence, so absence is written and never inferred

`presence` is on the `states` field because only a record that speaks for a subject can say the subject is not there.

| What the view sees | Means | Reference wording |
| --- | --- | --- |
| no record states the subject | **nobody has looked** | "Backup protection hasn't been assessed", "Monitoring hasn't been assessed" |
| newest record has `presence: "absent"` | **Pi established there is none** | "Nothing is listening", "No cache or broker", "No cache here", "Not set up" |
| newest record has `presence: "present"` | it exists; its state is that record's status | — |

This is the correction the review asked for, and it changes several screens: **every design that says "there is none" needs two empty states, not one.** Monitoring, Cache & queue, CDN, Jobs, off-site copies and HTTPS each get an unassessed state that offers the Ask, and a designed absence that only appears once Pi has written it. Section 8 lists both for every destination.

`topology.absent[]` and `inventory.absent[]` are the same declaration in list form, for the ghosts a map or a table draws inline; they are written by Pi for the same reason and carry the same weight.

---

## 3. Claims and freshness

The review's example is exactly right: one expiry per subject kind cannot be correct, because "the host is in Helsinki" and "SSH answered" are both about `host:hetzner-165600952`.

**Freshness belongs to the claim, not the subject.** Every check and every fact names what kind of claim it is making, from a closed list:

| Claim | What it asserts | Ages | Example |
| --- | --- | --- | --- |
| `identity` | what a thing **is**, such that a change makes it a different thing | never | image digest, repository revision, checksum, instance id, volume name, mount path |
| `configuration` | what was **chosen**, and can be changed without replacing the thing | slowly | region, instance size, public address, firewall rules, env applied, port bindings, systemd unit installed |
| `reachability` | something answered | quickly | SSH connected, HTTP 200, probe passed |
| `liveness` | it is running now | very quickly | container up, process running |
| `contents` | what is inside, or how much | moderately | disk used, row count, backup size, queue depth |

The review was right that instance size and public address are not permanent, and the first draft filed them under `identity` along with the region. They are `configuration`: chosen, changeable, and worth re-reading. `identity` is now only what cannot change without the thing becoming a different thing — a digest, a revision, a volume name. That keeps `never` safe, because a rebuilt host is a new `presence` epoch rather than an expired fact.

```ts
type Claim = "identity" | "configuration" | "reachability" | "liveness" | "contents"
type Basis = "observed" | "planned" | "reported"
```

The expiry table lives in the component layer, because how long a fact is worth trusting is a presentation judgement:

```
identity       never
configuration  7 days
contents       3 days
reachability   12 hours
liveness       15 minutes
```

Pi may override per check or per fact with `freshFor` in seconds when it knows the real horizon — a certificate expiry, a lease, a token. Choosing the claim kind is semantic, which is why it is Pi's; choosing the number is arithmetic, which is why it is not.

### 3.1 The rule

The first draft applied one formula to two different vocabularies. Checks say `passed | failed | info`, records say `info | verified | failed | warning`, and only records carry a time. Both are needed, and they are not the same function.

**Timestamps are inherited, never carried.** A check and a fact have no time of their own: they are as of `record.establishedAt`. If two observations were gathered at materially different times they belong in two records — that is the rule that keeps `establishedAt` meaningful, and it is why a per-check `at` is deliberately not in this contract. A record with `establishedAt: null` was written but nothing was established: its checks render as recorded, never as verified, and they never age because they never started.

```
age(record)      = now - record.establishedAt
fresh(x, record) = record.establishedAt !== null
                   && age(record) < (x.freshFor ?? expiry[x.claim])
```

**A check, read as evidence about now** (for example, an Overview lane status). Historical check lists retain the recorded outcome, as specified below:

| `check.status` | fresh | not fresh |
| --- | --- | --- |
| `passed` | verified | **stale** |
| `failed` | failed | failed — a failure does not age into doubt |
| `info` | noted | noted — a note makes no claim, so it never ages |

**A record, drawn as a card** — its tag takes the record's own `status`, aged by the soonest-expiring claim among the checks and facts that card is showing:

```
soonest(record, shown) = min over x in shown of (x.freshFor ?? expiry[x.claim])
tag(record, shown)     = record.status === "verified"
                         && age(record) >= soonest(record, shown) ? "stale" : record.status
```

`failed` and `warning` pass through unaged; `info` renders as recorded. A card showing only `identity` facts never goes stale; the same record in Overview's Server lane, where the `reachability` check is what the lane draws, goes stale in twelve hours.

**Ageing depends on the reading the component presents.** `about` and `states` determine relationships and current-state assembly; they do not choose whether a particular rendering is historical or about now. The same event check can be read both ways:

| Reading | Example | Do its checks age? |
| --- | --- | --- |
| Historical outcome, as of the record | Deployment's check list; History's recorded result | no; retain passed, failed or noted and show the observation time |
| Evidence about now | Overview's lane status, including checks sourced from a deployment event; Architecture's current part tag | yes; apply the claim's freshness rule |

So Deployment's "Checks it passes" shows the three checks that deployment ran, plainly, under "They ran when it deploys". A liveness check that passed at 16:05 retains that historical result an hour later. The same check in Overview's Checks lane is evidence about the application now and becomes stale after fifteen minutes. Neither rendering changes the stored outcome.

The deployment card's headline tag is a freshness summary of the claims it shows and follows `tag(record, shown)` above, even though its check list is historical. When stale it must communicate "last verified" with the observation time, rather than imply the deployment failed. A historical result label in History retains the recorded outcome. This choice belongs to the component, not a new Pi-authored field.

Freshness is computed **per claim, and a component asks for the freshness of the claim it is drawing.** The same host record therefore reads differently in different places, correctly:

| Where | Claim drawn | Three days later | Ten days later |
| --- | --- | --- | --- |
| Architecture's host tag | `reachability` — "SSH connected" | amber, "Reached 3 days ago" | amber |
| CDN's "where it stands" | `configuration` — Helsinki, CX23 | plain, still in window | "Last read 10 days ago" |
| Overview's Server lane | `reachability` | the band of not-knowing | the band, wider |
| Deployment's "Server" fact row | `identity` — the machine's name | plain, no ageing | plain |

A record's own headline tag, when a component needs one, takes **the soonest-expiring claim it is showing** — never an average.

### 3.2 States

Six states. Three are Pi's, three the UI's.

| State | Means | Set by |
| --- | --- | --- |
| **unknown** | no record states this subject | UI |
| **planned** | in the approved plan; has not run | Pi (`basis: "planned"` and no observation) |
| **working** | running right now | controller, from a live execution |
| **verified** | checked, and the claim is in window | Pi writes; UI confirms |
| **stale** | verified once; the window has passed | **UI only** |
| **failed** | a check ran and did not pass | Pi |

`absent` is not a state: it is `presence`, above. `warning` stays as a judgement — true, and it wants looking at — and survives ageing.

**Ageing never turns green into red.** Stale is amber and says it may have changed; only a check that ran and failed is red.

---

## 4. Three sources

| Source | Owns | Rule |
| --- | --- | --- |
| **Pi writes** | Meaning. What a thing is and is for, whether an outcome is good, what the parts are and how they connect, what is missing and why it matters, which claim a fact makes. | Only what it established. Never a relative time, count, colour, lane, or a fact it did not observe. |
| **The controller records** | Events. Executions (command, target, exit code, output, start, finish), messages, approvals, conversation identity, run grouping. | Automatic and already true. Pi never re-types what an execution proves; it cites the execution as evidence. |
| **The UI derives** | Time, arithmetic, layout. Relative times, freshness, ordering, counts, timeline windows, gaps, expected-but-not-recorded, journey sentences, lane assignment, caller outcomes, a door's reach from its sources. | Derivation never invents a fact. Missing inputs render unknown, never healthy and never absent. |

The line that settles most arguments: **anything with an exit code is automatic; anything with a meaning is Pi's; anything with a clock or a comparison in it is the UI's.**

### 4.1 Replacing `check.subject`

Today `check.subject: "application" | "backups" | "server" | "access"` does two jobs: it marks a check as timeline-worthy, and it chooses a lane. The replacement covers both without an authored lane.

```
lane(check) = laneOf(check.about ?? record.states?.ref)   // never record.about
timelineWorthy(check) = lane(check) !== null && record.establishedAt !== null

laneOf(ref) = process, database, volume, application → "application"
              backup-plan                            → "backups"
              host                                   → "server"
              access, door, domain, certificate      → "access"
              anything else                          → null
```

Two corrections the review asked for.

**`about[]` is never consulted for a lane.** It is unordered, so `about[0]` was meaningless; it is gone. A check takes its lane from its own `about`, or from the subject the record speaks for, or it has no lane and does not reach the timeline — which is exactly what a check with no `subject` does today.

**The Backups lane is about protection, not about storage.** `volume` moved to Application. "SQLite persistence survived a restart" is a claim that the application kept its data through a restart; no copy was made and nothing was protected, so it belongs with the application's own health. Only `backup-plan` — and the copy and restore events that reference a plan — speak to whether a copy exists somewhere else. The earlier mapping put a restart test in Backups, which would have read as "backups are fine" on the strength of a check that never touched a backup.

Naming a subject is still not the same as naming what was checked, which is why `check.about` exists: it is the escape hatch that reproduces `check.subject`'s expressiveness exactly, while naming a thing rather than a column. A deployment record touching four subjects places each of its checks itself. The gain over `check.subject` is that the same field then also drives Architecture, Processes and History, and a new lane never requires re-teaching Pi.

---

## 5. Typed content, with concrete schemas

`presentation.content` is the right home for shapes a component cannot draw from prose.

### 5.1 `topology` — Architecture, Overview's map

One per application; the newest record stating `application:<id>` is the map. Parts carry identity and description and **no state**: a part's state is the newest record stating that part.

```ts
{ kind: "topology",
  from: "plan" | "observed",
  parts: { id, kind: PartKind, name, role, plain, owner?, facts?: Fact[] }[],
  edges: { from, to, network: "public" | "private" | "loopback" | "disk", label? }[],
  absent: { id, kind: PartKind, name, would: string }[] }
```

`PartKind`: `controller | source | gate | tls | host | web | private | volume | offsite | monitor`. `from: "plan"` is what lets the pre-deployment screen draw the whole map in ghost with every part planned. `loopback` was added in this revision: the reference's current deployment is reached through an SSH tunnel to the host's loopback, which is neither public nor the container network, and drawing it as `public` was the inconsistency the review caught.

### 5.2 `doors` — Security, Domains, Processes

Ports as the provider or the plan states them. **`reach` is derived, not authored** — one less judgement for Pi to get wrong.

```ts
{ kind: "doors",
  /** True only when this is the provider's whole rule set, read back. */
  complete: boolean,
  at: string, basis: Basis,
  doors: {
    id, port: number, protocol: "tcp" | "udp",
    serves: { partId: string; port?: number } | null,
    sources: ({ cidr: string } | { tag: string })[],
    basis: Basis, at: string | null,
    unasked?: boolean, concern?: string
  }[] }
```

`reach` is derived from the door, and **closure has to be established like anything else**:

```
reach(port) =
  a door exists      → sources contain 0.0.0.0/0 or ::/0 → "internet"
                       sources non-empty and narrower     → "restricted"
                       sources empty, bound to loopback   → "private"
  no door, complete  → "closed"      · "as the provider reports its rules"
  no door, a knock from outside was refused → "closed" · "a knock was refused"
  otherwise          → "unknown"
```

The previous draft said "no door for that port → closed", which broke this contract's own rule in the section that exists to enforce it: our not having a rule on file is not evidence that a port is shut. Closure needs either `complete: true` — the provider's entire rule set read back, which is what `check-firewall` would produce — or a `reachability` check about `door:<port>` that was refused from outside. Everything else is unknown, and Security draws an unknown wall rather than a solid one.

`sources` is structured so Security can print each rule verbatim *and* nest the rings correctly; `unasked` is the provider reporting a rule this deployment never requested; `at` with `basis: "planned"` is what produces "Asked for, never read back".

### 5.3 `schedule` — Backups, Jobs, Monitoring, Overview's future

`cadence: "Daily at 03:15"` cannot drive a calendar. Recurrence is computable or explicitly unknown, never prose to be parsed.

```ts
{ kind: "schedule",
  what: string,
  recurrence:
    | { rule: "cron"; expression: string; timezone: string }
    | { rule: "interval"; everySeconds: number }
    | { rule: "unknown"; words: string },
  installedAt: string,
  nextAt?: string,
  keep?: number,
  paused?: boolean }
```

- `cron` + IANA `timezone` is what a systemd timer or crontab actually is, and the UI expands occurrences from it.
- `interval` covers "every 15 minutes" without inventing a cron.
- **`unknown` forbids calculation.** Jobs' "At what hour · Not on record" is this case: the schedule is installed, its time was not captured, and the calendar draws no expected marks — it says the cadence in words and nothing more. This is the only honest answer, and making it a separate rule means a component cannot accidentally compute from prose.

`nextAt` is Pi's when the installer reported it (systemd does); otherwise the UI expands `recurrence`.

### 5.4 `backup-plan` and its events — Backups, Storage, Database

The calendar needs to know what the plan covers, what each copy actually contained, and what a restore proved. Three shapes, linked by id.

```ts
// states backup-plan:<id>
{ kind: "backup-plan",
  destination: { where: string; offServer: boolean },
  covers: { volumeId: string; piece: string; method: string }[],
  excludes: { volumeId: string; piece: string; why: string }[],
  keep?: number }

// an event, about backup-plan:<id> and each volume it touched
{ kind: "backup-copy",
  planId: string,
  contents: { volumeId: string; piece: string }[],
  bytes?: number, checksum?: string, verified: boolean }

// an event, about backup-plan:<id>
{ kind: "restore-test",
  planId: string, copyAt: string,
  proved: string[], untested: string[] }
```

This makes every cell on the calendar a lookup rather than a guess: a solid cell is a `backup-copy` whose `contents` include that piece; a hatched cell is `covers` with no copy that day; a pale cell is `excludes`; an outlined cell is an expansion of `recurrence` with no copy. `untested` is what keeps "a backup success does not imply a tested restoration" true in data rather than in a sentence.

### 5.5 `inventory` — Processes, Storage, Variables, Jobs

Membership and shape; each member's state is its own record.

```ts
{ kind: "inventory", of: SubjectKind,
  members: { id, name, role, plain, owner?, facts?: Fact[] }[],
  absent?: { id, name, would: string }[] }
```

### 5.6 `measurement` — the numbers

```ts
{ kind: "measurement", of, value, unit, at, total?, note? }
```

Separate from checks because a number is not a pass or a fail, and the reference never colours one.

---

## 6. Subject kinds

`application`, `host`, `process`, `volume`, `database`, `door`, `domain`, `certificate`, `value`, `config-file`, `job`, `monitor`, `backup-plan`, `access`, `cache`, `cdn`. Grows one entry at a time as a destination earns it.

---

## 7. Actions

**Navigate** — no backend, no record: open a destination, open the conversation at a message, open a part on the map, open the application, and every in-view selection (journey, ring, caller, station, day, folded/to-scale, earlier reads, filters).

**Ask** — drafts a message into the main conversation. No new capability, no new permission surface. The contract is one optional field on the thing drawn: `ask?: string`. Components compose drafts from facts they hold; Pi supplies one only through `nextStep` on a recommendation.

Every Ask in the reference: check processes now (Processes) · check the database now, back it up now (Database) · list the copies (Backups) · measure the volumes (Storage) · print the latest output (Logs) · set up a health watch (Monitoring) · what a stranger can reach (Security) · a knock test (Domains) · change a value, give it in the conversation (Variables) · release or update (Deployment) · would it help / is one needed / what could be scheduled (CDN, Cache, Jobs) · look into it (Overview attention) · re-check this part (Architecture) · per-lane ask (Overview).

**Execute** — a capability the controller runs without a model call. The happy path ships **none**. Each must earn its place by being idempotent, explicable in one sentence, and genuinely worse as an Ask; only `check-firewall` and `refresh-logs` are plausible, both read-only.

---

## 8. Destination by destination

**From**: `pi`, `auto` (controller), `derived`. The last two columns are the two empty states the presence rule requires.

### Overview — Timeline

| Component | Needs | From | Nobody looked | Pi established none |
| --- | --- | --- | --- | --- |
| Headline, subline | failing/waiting records; newest observation | derived | "Nothing has been established here yet" | — |
| Access chip, Open app | `application-access` + url | pi | chip hidden | "Not reachable from here" |
| Attention card | records `failed`/`warning` in `overview`, with `partId` | pi | section absent | — |
| Four lanes | every check with a lane (§4.1) | pi + derived | lane shown, "Not assessed" | "Not set up" |
| Lane status line | newest per lane + freshness of its claim | derived | "Not assessed" | "Not set up" |
| Freshness band | newest observation → now | derived | full-width hatch | none drawn |
| Future column | `schedule.recurrence` expansion, `nextAt` | pi + derived | empty | empty |
| Changing observations | the series per subject | pi + derived | — | — |
| Log console | executions: command, output, exit, time | auto | "Nothing done yet" | — |
| Map | `topology`; part states from records | pi | map from plan, in ghost | ghosts from `absent[]` |
| Recent work | events + executions with origin | auto | "Nothing has run yet" | — |
| Ideas | `role: "recommendation"` | pi | section absent | — |

### Architecture — Journeys

Parts, boundaries and edges from `topology`; each part's tag from the newest record stating it, aged by the claim being shown; facts from `facts[]` with their `basis`; ghosts from `absent[]`; journeys and their sentences **derived** from `edges`; re-check is an Ask. Unassessed part → unknown dot and no claim. Declared-absent part → dashed ghost with its `would`.

### Deployment — Transit

Headline, tone and facts from the deployment event and `deployment` content; "Checks it passes" from `checks[]` with `detail` and `basis`; "Against the N checks listed below" counted; transit stops, durations and attempts from executions grouped by run; "Deploy when you push · Not set up" is a declared absence; the Now stop is freshness of the soonest-expiring claim; latest-logs link is the newest collection execution. Never deployed → "Not deployed yet".

### History — Transit

Counts and filters over every event and execution; entry state, title and summary from the event record, falling back to the execution alone; origin from conversation id or the automatic flag; touched destinations from `presentation.views`; evidence from `evidence[]` plus the executions; needs-you from unanswered approvals; **`resolves: recordId`** pairs a repair with its failure — the one field only Pi can supply.

### Storage — Flow, Backups — Calendar, Database — Timeline

All three read `inventory` of `volume`, the `backup-plan`, and `backup-copy` / `restore-test` events (§5.4), plus `schedule` and `measurement`. Cells, gap labels, "the scheduled copies for Sep 10, 11 and 12 aren't on record here" and "newer copies may exist; none is on record here" are all the plan-versus-events subtraction, and stay statements about **the record**. Unassessed → "Backup protection hasn't been assessed", with the Ask. Declared none → "No copies are made".

### Processes — Line

`inventory` of `process` with per-member facts; the reaching line from `topology.edges`; the private boundary from `network`; per-process check ratios from that subject's newest record; "Health watch and restarts · Not set up" and "Background workers · None declared" are declared absences, not empty lists; recent changes from executions.

### Logs — Paper

**No Pi record at all.** The headline, the lines, speakers, levels, truncation, earlier reads and "Nothing printed since" are all a designed read of collection executions. This is the model for anything the controller already captures.

### Monitoring — Tuner

Stations from `inventory` of `monitor` plus the subjects watched; signal strength from the count and freshness of each subject's observations; station log from the series; "Silence since …" derived. **"Nothing listens between deployments" requires a `monitor` record with `presence: "absent"`.** Until Pi writes one the page says monitoring has not been assessed and offers the Ask — this was the clearest instance of inferring absence in the previous draft.

### Domains — Callers, Security — Rings

Doors from §5.2, plus `domain` and `certificate` subjects. The four caller windows and the ring nesting are **derived** from doors, the certificate and the access content; each window's footer comes from `basis` and `establishedAt` ("A check proved this" / "What the deployment asked for" / "Nothing is set up"). Holes come from declared absences and from `basis: "planned"` with no observation. Unassessed → every window unknown, the page says so.

### Variables — Manifest

`inventory` of `value` and `config-file`; groups from `who`; `held` and `where` in words; pending derived by comparing against the newest deployment; the files table from `facts[]`; waiting-for-you from inputs with no value and their reason. **The model never carries a value.** A page cannot leak what it does not hold.

### CDN, Cache & queue, Jobs

No new content. CDN draws the host from its `identity` facts and an empty shelf; Cache draws an empty line; Jobs draws Server Guy's own recurring work from `schedule` and a component-owned ghost for a command of yours. Each needs its `presence: "absent"` record before it may say "there is none"; before that, each says it has not been assessed.

---

## 9. One deployment, completely

The deployment we actually have, as the records that would populate the screens. Every id, port and address below is consistent with the others: the application is reached **only** through an SSH tunnel from the controller PC to the host's loopback, and no public web door exists.

### 9.1 The host

```json
{
  "id": "rec-host-1",
  "applicationId": "app-dgs",
  "title": "Server reachable over SSH",
  "body": "CX23 in hel1/Helsinki, 2 vCPU, 4 GB, 40 GB disk, Ubuntu 24.04. Root SSH uses the controller-managed key.",
  "establishedAt": "2026-09-12T15:48:00Z",
  "about": [{ "kind": "host", "id": "hetzner-165600952" }],
  "states": { "ref": { "kind": "host", "id": "hetzner-165600952" }, "presence": "present" },
  "evidence": [{ "type": "execution", "id": "exec-b7" }],
  "presentation": {
    "views": ["overview", "architecture"],
    "role": "status",
    "status": "verified",
    "checks": [
      { "key": "ssh", "label": "SSH connected as root", "status": "passed", "claim": "reachability", "basis": "observed" }
    ],
    "facts": [
      { "key": "server-id", "label": "Provider id", "value": "165600952", "mono": true, "claim": "identity", "basis": "reported" },
      { "key": "region", "label": "Where", "value": "Helsinki, Finland", "claim": "configuration", "basis": "reported" },
      { "key": "size", "label": "Size", "value": "CX23 · 2 vCPU · 4 GB", "claim": "configuration", "basis": "reported" },
      { "key": "address", "label": "Public address", "value": "46.62.253.6", "mono": true, "claim": "configuration", "basis": "reported" }
    ]
  }
}
```

Three days on, Overview's Server lane and Architecture's host tag read "Reached 3 days ago" in amber, because `reachability` expires in twelve hours. CDN still names the machine as a CX23 in Helsinki with no tag, because `configuration` is good for seven days — and after ten it says when it was last read rather than pretending. Only the provider id never ages: a different id is a different machine, which is a new presence epoch, not an expired fact.

### 9.2 The map

```json
{
  "id": "rec-topo-1",
  "applicationId": "app-dgs",
  "title": "How the application is put together",
  "body": "One host runs the app behind Nginx on its own loopback. Nothing on the public internet reaches the web; you reach it through an SSH tunnel.",
  "establishedAt": "2026-09-12T16:05:00Z",
  "about": [{ "kind": "application", "id": "app-dgs" }],
  "states": { "ref": { "kind": "application", "id": "app-dgs" }, "presence": "present" },
  "presentation": {
    "views": ["architecture", "overview"],
    "role": "status",
    "status": "verified",
    "content": {
      "kind": "topology",
      "from": "observed",
      "parts": [
        { "id": "source", "kind": "source", "name": "docker/getting-started-app", "role": "The repository", "plain": "Where the code comes from" },
        { "id": "controller", "kind": "controller", "name": "Server Guy", "role": "This PC", "plain": "Where you are reading this" },
        { "id": "hetzner-165600952", "kind": "host", "name": "Hetzner CX23", "role": "The server", "plain": "The one machine everything runs on",
          "facts": [{ "key": "region", "label": "Where", "value": "Helsinki, Finland", "claim": "configuration", "basis": "reported" }] },
        { "id": "door-22", "kind": "gate", "name": "22", "role": "SSH", "plain": "The only way in from the network", "owner": "hetzner-165600952" },
        { "id": "process-nginx", "kind": "web", "name": "nginx", "role": "The front door inside the server", "plain": "Answers on the server's own loopback, port 80", "owner": "hetzner-165600952" },
        { "id": "process-app", "kind": "private", "name": "getting-started", "role": "Your application", "plain": "The Node app, reachable only from the server", "owner": "hetzner-165600952" },
        { "id": "volume-todo", "kind": "volume", "name": "todo.db", "role": "The database file", "plain": "Where your list is kept", "owner": "process-app" }
      ],
      "edges": [
        { "from": "controller", "to": "door-22", "network": "public", "label": "SSH" },
        { "from": "door-22", "to": "process-nginx", "network": "loopback", "label": "tunnel 8080 → 80" },
        { "from": "process-nginx", "to": "process-app", "network": "private", "label": "127.0.0.1:3000" },
        { "from": "process-app", "to": "volume-todo", "network": "disk" }
      ],
      "absent": [
        { "id": "door-80", "kind": "gate", "name": "Public web door", "would": "let anyone on the internet reach the application" },
        { "id": "tls", "kind": "tls", "name": "HTTPS", "would": "encrypt what travels between you and the server" },
        { "id": "offsite", "kind": "offsite", "name": "Off-site copies", "would": "keep a copy of todo.db away from this server" },
        { "id": "watch", "kind": "monitor", "name": "Monitoring", "would": "watch the application between deployments" }
      ]
    }
  }
}
```

No `public` edge reaches the web: the only public edge is the controller's SSH connection, and the application is behind a `loopback` hop. Architecture draws seven parts and four ghosts; Overview draws the same in miniature.

### 9.3 How you reach it

```json
{
  "id": "rec-access-1",
  "applicationId": "app-dgs",
  "title": "Private application access ready",
  "body": "SSH forwards local 127.0.0.1:8080 to the server's loopback port 80, where Nginx listens. The public HTTP rules were removed; only SSH remains allowed. The tunnel lasts while its SSH process is alive.",
  "establishedAt": "2026-09-12T16:16:00Z",
  "about": [
    { "kind": "access", "id": "app-dgs" },
    { "kind": "host", "id": "hetzner-165600952" },
    { "kind": "process", "id": "process-nginx" }
  ],
  "states": { "ref": { "kind": "access", "id": "app-dgs" }, "presence": "present" },
  "evidence": [{ "type": "execution", "id": "exec-e1" }],
  "presentation": {
    "views": ["overview", "domains", "security"],
    "role": "status",
    "status": "verified",
    "url": "http://127.0.0.1:8080",
    "checks": [
      { "key": "tunnel-200", "label": "Local browser endpoint returns HTTP 200", "status": "passed", "claim": "reachability", "basis": "observed",
        "about": { "kind": "access", "id": "app-dgs" } },
      { "key": "loopback-bind", "label": "Application ports bind only to server loopback", "status": "passed", "claim": "configuration", "basis": "observed",
        "about": { "kind": "process", "id": "process-nginx" } },
      { "key": "public-refused", "label": "Public HTTP unavailable from this PC", "status": "passed", "claim": "reachability", "basis": "observed",
        "about": { "kind": "access", "id": "app-dgs" } }
    ],
    "nextStep": "Ask Pi to reopen private access if the tunnel stops.",
    "content": { "kind": "application-access", "mode": "private", "server": "docker-getting-started-4bda8854", "localPort": 8080, "remotePort": 80 }
  }
}
```

The three checks land in two lanes via `check.about`: two in Access, one in Application — which is what today's `check.subject` did, without Pi naming a column.

### 9.4 The deployment, as an event

```json
{
  "id": "rec-deploy-1",
  "applicationId": "app-dgs",
  "title": "Docker Getting Started is deployed and answering",
  "body": "The app runs as a non-root Node 22 container behind Nginx, managed by systemd with resource limits and automatic recovery after reboot. SQLite data persists at /var/lib/docker-getting-started/todo.db.",
  "establishedAt": "2026-09-12T16:05:00Z",
  "about": [
    { "kind": "host", "id": "hetzner-165600952" },
    { "kind": "process", "id": "process-app" },
    { "kind": "process", "id": "process-nginx" },
    { "kind": "volume", "id": "volume-todo" }
  ],
  "evidence": [
    { "type": "execution", "id": "exec-a1" },
    { "type": "execution", "id": "exec-a2" },
    { "type": "message", "id": "msg-77" }
  ],
  "presentation": {
    "views": ["deployment", "overview", "history"],
    "role": "outcome",
    "status": "verified",
    "checks": [
      { "key": "api-round-trip", "label": "Web page and CRUD API answered", "status": "passed", "claim": "reachability", "basis": "observed",
        "detail": "GET /api/items → 200, POST then GET round-tripped",
        "about": { "kind": "process", "id": "process-app" } },
      { "key": "restart-persistence", "label": "Data survived a container restart", "status": "passed", "claim": "contents", "basis": "observed",
        "about": { "kind": "volume", "id": "volume-todo" } },
      { "key": "reboot-recovery", "label": "Container healthy and recovered after reboot", "status": "passed", "claim": "liveness", "basis": "observed",
        "about": { "kind": "process", "id": "process-app" } }
    ],
    "content": {
      "kind": "deployment",
      "repositoryUrl": "https://github.com/docker/getting-started-app",
      "revision": "6b025fc53bc7b9bef435d6b09bcd1da5a871c9cc",
      "image": "getting-started:6b025fc",
      "server": "docker-getting-started-4bda8854",
      "changes": ["First deployment", "systemd unit installed", "Public HTTP rules removed"]
    }
  }
}
```

**No `states`.** It is about four subjects and is the current state of none of them. It appears in chat as a card, in Deployment as the headline and its three checks, in Overview's Recent work and three lane marks, and in History as an entry. It never answers "is the app running now"; the process records do.

All three checks land in the **Application** lane: two through `process:process-app`, and `restart-persistence` through `volume:volume-todo`, which now maps to Application rather than Backups. Nothing was copied anywhere, so nothing should appear under Backups — that lane stays empty until a `backup-plan` exists, and Overview reads "Backups · Not assessed".

### 9.5 A declared absence

```json
{
  "id": "rec-watch-1",
  "applicationId": "app-dgs",
  "title": "Nothing watches the application between deployments",
  "body": "No health check, log watcher or uptime probe is installed. The only evidence is what a deployment or an ask produces at the time.",
  "establishedAt": "2026-09-12T16:06:00Z",
  "about": [{ "kind": "monitor", "id": "app-dgs" }],
  "states": { "ref": { "kind": "monitor", "id": "app-dgs" }, "presence": "absent" },
  "evidence": [{ "type": "execution", "id": "exec-f2" }],
  "presentation": {
    "views": ["monitoring", "overview"],
    "role": "status",
    "status": "verified",
    "nextStep": "Ask Server Guy to set up a health watch."
  }
}
```

`status: "verified"` with `presence: "absent"` is the honest combination: Pi checked, and there is none. **Only with this record may Monitoring say "Nothing is listening."** Without it the page says monitoring has not been assessed.

### 9.6 A later observation of one process

```json
{
  "id": "rec-proc-2",
  "applicationId": "app-dgs",
  "title": "The application answered",
  "body": "GET / returned 200 in 41 ms through the tunnel.",
  "establishedAt": "2026-09-13T09:12:00Z",
  "about": [{ "kind": "process", "id": "process-app" }],
  "states": { "ref": { "kind": "process", "id": "process-app" }, "presence": "present" },
  "evidence": [{ "type": "execution", "id": "exec-g4" }],
  "presentation": {
    "views": ["processes", "overview"],
    "role": "status",
    "status": "verified",
    "checks": [{ "key": "http-root", "label": "GET / returned 200", "status": "passed", "claim": "reachability", "basis": "observed" }]
  }
}
```

Processes now shows one row for `process-app` reading this record. Overview's Checks lane shows **both** this mark and yesterday's from the deployment, because the lane is a series read. Nothing was overwritten.

---

### 9.7 Proving the reads

Six cases, each one a rule from sections 2 to 4 with the answer worked out. Times are the host's series; "now" moves down the table.

The series for `host:hetzner-165600952`:

| # | Written | Record | `states` | Carries |
| --- | --- | --- | --- | --- |
| 1 | Sep 12 15:48 | `rec-host-1` | present | facts `server-id`, `region`, `size`, `address`; check `ssh` |
| 2 | Sep 13 09:12 | `rec-host-2` | present | check `ssh` only |
| 3 | Sep 15 11:00 | `rec-host-4` | **absent** | nothing; "the server was destroyed" |
| 4 | Sep 15 11:40 | `rec-host-5` | present | facts `server-id` (new), `address` (new); check `ssh` |

**A · A later partial observation does not erase what it did not mention.** Read at Sep 13 10:00, after record 2:

| Read | Answer | From |
| --- | --- | --- |
| `presence` | present | record 2 |
| check `ssh` | passed, 48 min ago → **verified** | record 2 |
| fact `region` | Helsinki | record 1, still the newest carrying `region` |
| fact `size`, `address`, `server-id` | CX23 · 2 vCPU · 4 GB, 46.62.253.6, 165600952 | record 1 |

Record 2 says only that SSH answered. Pi did not re-read the region and correctly did not re-assert it, and the location did not blink out of Architecture. Architecture's host tag is verified (the `reachability` check is 48 minutes old); CDN's "where it stands" is plain (the `configuration` facts are 18 hours old, inside seven days).

**B · Retiring falls back; it does not edit.** Pi realises record 2's check ran against the wrong host and sets `retiredAt` on it. Nothing in record 2 changes — not a word of its title, checks or time. Read again at Sep 13 10:00:

| Read | Answer | From |
| --- | --- | --- |
| check `ssh` | passed Sep 12 15:48, 18 h ago → **stale** | record 1, now the newest unretired record carrying `ssh` |
| facts | unchanged | record 1 |

Overview's Server lane loses its Sep 13 mark and grows its band of not-knowing back to Sep 12. History still shows record 2, marked withdrawn, because the reader is entitled to know Pi said it and took it back.

**C · Assembly stops at a presence change.** Read at Sep 15 12:00, after records 3 and 4:

| Read | Answer | Why |
| --- | --- | --- |
| `presence` | present | record 4 |
| fact `address` | the new address | record 4 |
| fact `server-id` | the new id | record 4 |
| fact `region` | **unknown** | record 1 is on the far side of record 3's `absent` |
| fact `size` | **unknown** | the same |

The rebuilt machine does not inherit the dead one's region and size. Architecture draws the host with its new address and no size until Pi reads one; nothing claims Helsinki on the strength of a server that no longer exists. This is also why `identity` may safely never expire: a different machine is a new epoch, not an aged fact.

**D · Lanes, on the deployment record (§9.4).** The record has no `states`, so every lane comes from `check.about`:

| Check | `about` | `laneOf` | Lane |
| --- | --- | --- | --- |
| `api-round-trip` | `process:process-app` | process → application | Application |
| `restart-persistence` | `volume:volume-todo` | volume → application | **Application** |
| `reboot-recovery` | `process:process-app` | process → application | Application |

Backups stays empty, and Overview reads "Backups · Not assessed". Under the previous mapping `restart-persistence` would have landed in Backups and put a green mark on a lane where nothing had ever been copied. `record.about` is never consulted, so its order cannot matter.

**E · A port with no rule is unknown, not closed.** Only door 22 is on record.

| When | Port 80 reads | Security draws |
| --- | --- | --- |
| after deployment, `doors.complete: false` | **unknown** | an unknown wall; the hole "the firewall has not been read back" |
| after a firewall read returning only 22, `complete: true` | closed · "as the provider reports its rules" | a solid wall |
| after a knock from outside is refused | closed · "a knock was refused" | a solid wall, cited to the knock |

The deployment's own `public-refused` check (§9.3) is the third row: it is a `reachability` check about `access:app-dgs` that establishes the public address does not answer **from this PC**, which is what the reference's Domains window says and no more.

**F · A check's tone, one hour after deployment.** All three checks come from the same event. Deployment reads their historical outcomes; Overview reads their freshness as evidence about now:

| Check | Claim | Expiry | On Deployment | In Overview's Checks lane |
| --- | --- | --- | --- | --- |
| `api-round-trip` | reachability | 12 h | passed, plain | verified |
| `restart-persistence` | contents | 3 d | passed, plain | verified |
| `reboot-recovery` | liveness | 15 min | passed, plain | **stale** |

Deployment does not grey a check that passed an hour ago, because the page is the record of an event. Overview's lane is a claim about the application now, so the liveness mark goes stale after fifteen minutes while the other two stand. When it shows all three claims, the deployment card's own tag reads verified for fifteen minutes and stale after — `record.status` aged by the soonest claim it shows. At the one-hour point in this table, the card's tag is therefore stale while its historical check list still records three passes.

---

## 10. The full contract, in one list

`about[]` · `states {ref, presence}` · `key` on every check and fact · `Claim` and `Basis` on every check and fact · optional `freshFor` · `check.about` · `resolves` · contents: `topology`, `doors` (with `complete`), `schedule`, `backup-plan`, `backup-copy`, `restore-test`, `inventory`, `measurement`, plus today's `deployment` and `application-access`.

---

## 11. The smallest slice

What the deployment we already have needs to run **its existing screens** — chat, Overview, Architecture, Deployment, History, Processes, Logs — on real records. Backups, scheduling and recovery are deliberately out.

**In:**

1. `about[]` and `states {ref, presence}`. Records are append-only in content; `retiredAt` stays the one write-once visibility flag.
2. `key` on every check and fact, and key-by-key assembly within a presence epoch (§2.1, proofs A–C). This is what makes a partial observation safe to write.
3. `claim` and `basis` on checks and facts, the expiry table in the component layer, `stale` owned by the UI, and the two component-selected readings — evidence about now versus historical outcome, independent of whether the source record has `states` (§3.1, proof F).
4. `presence: "absent"`, and the two empty states everywhere a design says "there is none".
5. `topology` content with `from`, `loopback` edges, part states resolved from records, and `absent[]`.
6. `check.about` and lane derivation (§4.1, proof D), retiring `check.subject`.
7. `planned` as a state, so the pre-deployment screens draw.
8. Actions: Navigate and Ask only.

**Out of the first slice**, each when its destination is taken:

- `schedule` and everything that expands a recurrence — the Backups calendar, Overview's future column, Jobs' next run. Overview's timeline ships with history and now, and no Tomorrow.
- `backup-plan`, `backup-copy`, `restore-test` — all of Backups and Storage's flow.
- `resolves` — History ships without failure/repair pairing.
- `doors` — Security and Domains keep their current views.
- `inventory` beyond what `topology.parts` already gives Processes.
- `measurement`.
- Any Execute action.

These eight have no useful subset. Without `states` there is no current state; without `key` a second observation silently erases the first; without `claim` freshness is wrong for half the facts; without `presence` the screens lie about absence. Everything else is additive and can land per destination.

Three things the review raised are worth naming as deliberately deferred rather than solved: withdrawing a fact without replacing it, a per-check timestamp, and `doors.complete` — which matters for Security and arrives with it.

---

## 12. What this contract refuses

- **No health from absence, and no absence from absence.** A missing record means nobody looked. Only a record with `presence: "absent"` licenses "there is none".
- **No invented infrastructure.** A diagram draws what Pi found plus what Pi explicitly declared missing.
- **No generic cards where a design exists.** The card is for records no designed component claims, and for chat.
- **No prose where a field belongs.** A number, a time, an identity, a basis, a claim or a recurrence gets a field. `"Daily at 03:15"` is not a schedule.
- **No computing from an unknown.** `recurrence: {rule:"unknown"}` may be printed and never expanded.
- **No values, ever.** Variables carries names, places and reasons.
