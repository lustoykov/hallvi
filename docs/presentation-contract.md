# The presentation contract

A proposal, 12 September 2026. It describes the data and interaction contract the accepted reference designs need in order to run on real Pi output. Nothing here is implemented: no schema, database, migration or deployment change is proposed, and no view is rewritten. The staging section says what the lightweight happy path needs first.

Written against every reference destination and its states on the reference build, and against what exists today on `codex/hetzner-provisioning`: `src/server/operator-data.ts`, `src/server/pi.ts`, `src/components/server-guy/record-overview.tsx`, `application-section-view.tsx`, [component design](../src/components/server-guy/DESIGN.md) and [operator design](operator-design.md).

**The premise throughout: Pi supplies facts, components own layout.** Every sentence the reference speaks is composed by a component from fields. Pi is never asked to write a relative time, a colour, a count, a lane, a journey sentence or a headline.

---

## 1. What exists, and the five things missing

Today a surfaced record is prose plus a flat list of checks, with two typed contents (`deployment`, `application-access`) and four authored check subjects. That is enough for a card and a first timeline. Five things the designs do are not expressible in it.

1. **A record cannot say what it is about.** Every record is new. Nothing says this observation of `grafana.db` replaces the last one, so no view can show a current state — only a pile of past statements. Every inventory in the reference (processes, volumes, doors, values, jobs, checks, monitors) needs identity.
2. **A record cannot say how long a fact stays true.** `establishedAt` exists but nothing says when it stops meaning "now". "Checked 3 days ago", "No check for 3 days", "it may have changed" and "As recorded: nothing here is observed live" are on nearly every reference screen.
3. **A record cannot say what is going to happen.** Overview's timeline runs into Tomorrow; the Backups calendar draws scheduled days with no copy on record; Jobs shows "Next: the next time it would run". All need installed schedules as data.
4. **A record cannot say how we know.** Security states outright: "These are the rules the deployment asked for, not a read of what is in place." Domains marks one caller "A check proved this" and another "What the deployment asked for". A fact's basis is as load-bearing as its value.
5. **A record cannot distinguish not-yet from not-there.** Before deployment every lane reads "Planned"; after it, Backups reads "Not set up". Same absence of evidence, opposite meanings, different drawings.

Everything else is either a small addition to the typed-content union, or something the UI should derive and never store.

---

## 2. The state vocabulary

Six states, not five. The reference uses all six, and only three are Pi's to write.

| State | Means | Reference wording | Set by |
| --- | --- | --- | --- |
| **unknown** | Nothing has been established. Not a claim of health. | "Size not measured", "No copy on record", "Not on record" | UI, when no record covers the subject |
| **planned** | In the approved plan; has not run yet. | "Planned", "After deployment", "Nothing runs yet" | Pi, on the plan record |
| **working** | Running right now. | the spinner, "Checking now" | Controller, from a live execution |
| **verified** | Pi checked it and the check is still in its window. | "Checked 3 days ago", "A check proved this" | Pi writes it; UI confirms it is in window |
| **stale** | Verified once; the window has passed. It may have changed. | "Out of date", "No check for 3 days", "may have changed" | **UI only** |
| **failed** | A check ran and did not pass. | "Failed", "isn't answering" | Pi |

`absent` is not a state but a **declared fact**: Pi establishing that a thing does not exist ("Not set up", "No cache or broker", "Nothing listens between deployments"). It is verified knowledge about a nothing, which is why the reference draws it in dashed confidence rather than in doubt. `warning` stays as a judgement — true, and it wants looking at — and survives ageing.

### 2.1 The freshness rule

The single rule that makes the reference's copy possible, and the thing today's code cannot do.

```
fresh(record) = establishedAt + freshFor(subject.kind) > now
shown(record) = record.status === "verified" && !fresh(record) ? "stale" : record.status
```

`freshFor` belongs to the component layer, per subject kind, because it is a presentation judgement: a container health check goes stale in hours, a firewall rule in days, a server's identity effectively never. Pi may override with `freshFor` in seconds when it knows the real horizon (a certificate expiry, a lease, a token).

Consequences the designs depend on:

- A lane measures from its newest observation to now and draws the gap as **not-knowing**, which is where "No check for 3 days" and "No copy on record for 2 days 20 h" come from.
- Overview can honestly say "Nothing needed you when Server Guy **last looked**" rather than "everything is fine".
- **Ageing never turns green into red.** Stale is amber and says it may have changed; only a check that ran and failed is red.
- A subject with no record is unknown and says so. Missing data is never health.

### 2.2 Basis: how we know

Every check and every fact carries where it came from. Three values cover every reference screen:

| Basis | Means | Reference |
| --- | --- | --- |
| `observed` | Something ran and saw it. | "A check proved this · Sep 9, 15:03" |
| `planned` | The deployment asked for it; nobody read it back. | "What the deployment asked for · Sep 9, 15:01" |
| `reported` | A third party states it (the provider, the registrar). | the firewall as Hetzner returns it |

Security's whole design rests on this: rings drawn from `planned` rules say so, and the page lists "The firewall has not been read back" as a hole. Without `basis`, a planned rule and a verified rule look identical, which is the one mistake that page exists to prevent.

---

## 3. Three sources

| Source | Owns | Rule |
| --- | --- | --- |
| **Pi writes** | Meaning. What a thing is, what it is for, whether an outcome is good, what the parts are and how they connect, what is missing and why it matters. | Only what it established. Never a relative time, a count, a colour, a lane, or a fact it did not observe. |
| **The controller records** | Events. Executions (command, target, exit code, output, start, finish), messages, approvals, conversation identity, run grouping. | Automatic and already true. Pi never re-types what an execution proves; it cites the execution as evidence. |
| **The UI derives** | Time, arithmetic, layout. Relative times, freshness, ordering, counts, timeline windows and ticks, gaps between observations, expected-but-not-recorded, journey sentences, lane assignment, caller outcomes. | Derivation never invents a fact. Missing inputs render unknown, never healthy. |

The line that settles most arguments: **anything with an exit code is automatic; anything with a meaning is Pi's; anything with a clock in it is the UI's.**

---

## 4. Current state versus history

One mechanism, and the main addition this proposal asks for: a record may name its subject.

```ts
subject?: { kind: SubjectKind; id: string }
```

- **With a subject**, the record is *current state*. A newer record with the same `(kind, id)` supersedes the older. "What is true now" views read the newest per subject. The superseded record is kept — it is how a timeline shows an observation changing.
- **Without a subject**, the record is an *event*. Events accumulate and are never superseded: a deployment, a restore test, a copy made, an incident, a handover.

`SubjectKind`, for the destinations that have designs: `application`, `host`, `process`, `volume`, `database`, `door`, `domain`, `certificate`, `value`, `config-file`, `job`, `monitor`, `backup-plan`, `access`. The list grows one entry at a time as a destination earns it.

This answers the three questions the designs kept asking:

- **What updates in place?** Anything with a subject. Pi re-checks `process:grafana`; Processes shows one row, Overview's Checks lane gains a mark, History keeps both.
- **What must remain?** Every event, and every superseded observation. Overview's timeline, Database's lanes, Monitoring's station log and History are all reads over the full series; only "current" views collapse to the newest.
- **What does retiring mean?** `retiredAt` says the subject no longer exists (a container removed, a rule deleted), not that the record was wrong. It renders absent and the history stays.

---

## 5. Typed content

`presentation.content` is the right home for shapes a component cannot draw from prose. Today it has two kinds; this proposes four more, each because a designed component is impossible without it.

### `topology` — Architecture, Overview's map

One per application, updated in place (`subject: {kind:"application"}`). Parts carry identity and description and **no state**: a part's state is the newest record whose subject is that part. A part with no record renders unknown. This is what stops a map inventing infrastructure to look finished.

```ts
{ kind: "topology",
  from: "plan" | "observed",
  parts: { id, kind: PartKind, name, role, plain, owner?, facts?: Fact[] }[],
  edges: { from, to, network: "public" | "private" | "disk", label? }[],
  absent: { id, kind: PartKind, name, would: string }[] }
```

`PartKind`: `controller | source | gate | tls | host | web | private | volume | offsite | monitor`. `from` is what lets Before-deploy draw the whole map in ghost from the plan, with every part planned — the reference's most convincing empty state, and impossible if topology only came from observation. `absent` is how the ghosts are drawn ("Off-site copies · would keep a copy of the data away from this server"): **drawn because Pi declared them missing**, never because a field was empty.

### `schedule` — Backups' calendar, Overview's future, Jobs, Monitoring

Written when Pi installs recurring work; updated in place.

```ts
{ kind: "schedule", what, cadence, timezone, installedAt,
  nextAt?, keep?, paused?, hour?: null }
```

The UI derives future marks, countdowns, and the expected-but-not-recorded days the Backups calendar draws in outline. It never asserts a scheduled run happened: a run exists only as an event record or an execution. `hour: null` is meaningful — Jobs says "At what hour · Not on record" because the schedule was installed but its time was not captured.

### `inventory` — Processes, Storage, Domains, Security, Variables, Jobs, Cache

A list whose members are subjects in their own right. The record holds membership and shape; each member's state is its own record.

```ts
{ kind: "inventory", of: SubjectKind,
  members: { id, name, role, plain, owner?, facts?: Fact[] }[],
  absent?: { id, name, would: string }[] }
```

One shape serves seven destinations. A destination becomes real when Pi writes its inventory, with no new content kind per view.

### `measurement` — the numbers

```ts
{ kind: "measurement", of, value, unit, at, total?, note? }
```

Disk used, volume size, backup size, queue depth, line counts. Separate from checks because a number is not a pass or a fail, and the reference never colours one. `note` carries "Not measured", which several screens say out loud.

`Fact` throughout is `{ label, value, mono?, basis?: Basis }`.

---

## 6. Destination by destination

**From**: `pi` (Pi writes), `auto` (controller records), `derived` (UI computes). Every state column lists what the component draws when the input is missing.

### Overview — Timeline

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| Headline | Whether anything is failing or waiting; else the newest observation time | derived | "Nothing has been established here yet" |
| Subline | Newest observation and its freshness | derived | — |
| Access chip + "Open <app>" | `application-access` content + url | pi | chip hidden, no button |
| Attention card | Records with `status: failed \| warning` in view `overview`; title, detail, `partId` | pi | section absent |
| Four lanes | Every observation with a subject; lane from subject kind | pi + derived | lane shows "Planned" or "Not set up" |
| Lane status line | Newest per lane + freshness | derived | "Not set up" (absent declared) or unknown |
| **Freshness band** | Newest observation → now | derived | full-width not-knowing hatch |
| **Future column** | `schedule.nextAt` | pi | "After deployment" when planned, else empty |
| **Changing observations** | The whole series per subject | pi (each) + derived | single mark |
| Log console | Executions: command, output, exit, time; day headings | auto | "Nothing done yet" |
| Map | `topology`; part states from subject records | pi | map from plan in ghost |
| Recent work | Events + executions with origin, state, conversation | auto | "Nothing has run yet" |
| Ideas | Records with `role: "recommendation"` and `nextStep` | pi | section absent |

Lane assignment replaces today's authored `check.subject`: `process`/`database` → Checks, `backup-plan`/`volume` → Backups, `host` → Server, `access`/`door`/`domain`/`certificate` → Access. Pi stops choosing a lane — one fewer thing to get wrong.

### Architecture — Journeys

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| Parts, boundaries, edges | `topology` | pi | nothing drawn; "Not deployed yet" |
| Each part's tag | newest record for that subject + freshness | pi + derived | unknown dot, no claim |
| Part facts panel | `facts[]` with `basis` | pi | name and role only |
| Ghosts ("Off-site copies", "Monitoring") | `topology.absent[]` | pi | omitted entirely |
| Journey selector and its sentence | ordered path through `edges` | derived | selector hidden |
| Re-check control | an Ask draft | derived | — |

Journeys are derived: the stops are a path through the graph and the sentence is composed from the parts it passes. Pi never writes journey prose.

### Deployment — Transit

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| Headline + tone | the deployment event record | pi | "Not deployed yet" |
| "Against the 4 checks listed below, and nothing else" | count of `checks[]` | derived | — |
| Facts (revision, images, server, access) | `deployment` + `application-access` content | pi | row omitted, never guessed |
| "Checks it passes" | `checks[]` with probe detail, `inside`, evidence | pi | "No checks recorded" |
| "They ran when it deploys" | `basis: observed` at deploy time | derived | — |
| Transit stops with start/end/duration | executions grouped by run | auto | single stop |
| "Deploy when you push · Not set up" | declared absence | pi | omitted |
| "Now" stop | freshness of the newest check | derived | — |
| Latest logs link | newest log-collection execution | auto | link hidden |
| Release or update | Ask | derived | — |

### History — Transit

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| Counts and filters (All, Changes, Inspections, Outside chat, Needs you) | every event + execution, with kind and origin | auto + derived | "Nothing has run yet" |
| Entry: state, title, summary | event record, or execution when Pi wrote none | pi + auto | execution alone |
| Origin line ("Automatic · Backups", "From Deploy application · …") | conversation id or automatic flag; touched views | auto + pi | "automatic" |
| Touched destinations | `presentation.views` | pi | none listed |
| Evidence disclosure | `evidence[]` + the executions | pi + auto | disclosure hidden |
| "Resolves the failure at 15:01 →" | `resolves: recordId` | pi | pair not drawn |
| Needs-you flag | an unanswered approval | auto | 0 |

`resolves` is History's one addition: only Pi knows a repair and a failure are the same story.

### Storage — Flow

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| Volumes with mount, owner, docker name | `inventory` of `volume` | pi | "No volumes recorded" |
| Pieces inside a volume, and the method | per-volume `pieces: {label, method\|null}` | pi | volume drawn whole, uncovered |
| "not in the backup plan" (dashed) | `method: null` | pi | — |
| "kept through a replacement" | event record for the replacement | pi | "Not recorded" |
| Size | `measurement`, else "Size not measured" | pi | "Size not measured" |
| Daily backups node | `schedule` for `backup-plan` | pi | node absent, edge dashed |
| Off-the-server node | newest copy event + count | pi | "No copy on record" |
| Restore-tested node | newest restore event and what it left untested | pi | "Never tested" |
| Selected-piece fact table | `facts[]` | pi | — |
| Measure them | Ask | derived | — |

### Backups — Calendar

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| Rows (copies off the server, each piece, restore tests) | `inventory` of `volume` + the plan | pi | "Backups have not been assessed" |
| Cell: copy on record | copy event on that day | pi | — |
| Cell: **scheduled, nothing recorded** | `schedule` minus copy events | derived | — |
| Cell: in the copy per the plan | `method` | pi | — |
| Cell: left out of the plan | `method: null` | pi | — |
| Cell: restore test passed | restore event | pi | — |
| Headline ("the schedule keeps 7") | `schedule.keep` | pi | omitted |
| "The scheduled copies for Sep 10, 11 and 12 aren't on record here" | the same subtraction | derived | — |
| List the copies | Ask | derived | — |

The calendar's honesty is exactly schedule-minus-events, and it must stay a statement about **the record**, never about the copies.

### Database — Timeline

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| Headline | newest copy event | derived | "No copy on record" |
| Three lanes (check, copies, restore tests) | series per subject: `database`, copy events, restore events | pi | empty lane, named |
| Gap labels ("No check for 3 days 2 h") | newest → now | derived | — |
| Folded / To scale | the same series, two scales | derived | — |
| Footnote "Daily backups are scheduled, so newer copies may exist; none is on record here" | `schedule` + absence of events | derived | — |
| Back it up now | Ask | derived | — |

### Processes — Line

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| Count and headline | `inventory` of `process` | pi | "Nothing recorded runs" |
| Each process: role, port mapping, reach | member `facts[]` | pi | name only |
| Per-process check ratio ("2 of 2 checks") | that subject's newest record `checks[]` | pi | unknown |
| The reaching line (your network → port → web → private) | `topology.edges` | pi | list without the line |
| "Inside the server: nothing outside reaches past here" | `network: private` boundary | derived | — |
| "Health watch and restarts · Not set up" | declared absence | pi | omitted |
| "Background workers · None declared" | declared absence | pi | omitted |
| Recent changes | events touching `processes` | auto | — |
| Check now | Ask | derived | — |

### Logs — Paper

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| Headline + "Printed 3 days ago" | newest collection execution | auto + derived | "No output has been read" |
| Lines with time, speaker, level | the execution's output, parsed | auto + derived | — |
| Speaker chips and counts | parsed | derived | — |
| "earlier ones weren't read" | the execution's own truncation | auto | — |
| Earlier reads selector | older collection executions | auto | single read |
| "Nothing printed since · 3 days 2 h" | newest → now | derived | — |
| Print the latest output | Ask | derived | — |

Logs needs **no Pi record at all**: it is a designed read of executions. That is the model for anything the controller already captures.

### Monitoring — Tuner

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| Stations | `inventory` of `monitor` + the subjects watched | pi | "Nothing is listening" |
| Signal strength per station | count and freshness of that subject's observations | derived | no signal |
| "NOT LISTENING · Nothing listens between deployments" | no `monitor` with a `schedule` | derived | — |
| Station log rows (time, name, probe, outcome) | the subject's series with `checks[]` | pi | empty, named |
| "Silence since Sep 9, 15:03 · 3 days 2 h" | newest → now | derived | — |
| Set up a health watch | Ask | derived | — |

Monitoring is where "no health from missing data" matters most: no signal means **nothing is listening**, and the design says that instead of drawing a healthy meter.

### Domains — Callers

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| Four caller windows | composed from doors, `domain`, `certificate`, access | derived | all four still drawn, as unknown |
| What each caller meets | `door.reach` + `sources` + certificate presence | pi | — |
| Footer per window ("A check proved this" / "What the deployment asked for" / "Nothing is set up") | `basis` + `establishedAt` | pi + derived | "Nothing is set up" |
| The opened caller's facts (Who, Typed) | `facts[]` | pi | — |
| Ask for a knock test | Ask | derived | — |

Callers are **derived**: the component asks four questions and answers them from the doors. Pi supplies doors as the provider or the plan states them; it never writes four caller stories.

### Security — Rings

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| The four rings | reach levels present in the `door` inventory | derived | the internet ring alone |
| Gate on each wall | door: port, what is behind it, `sources` verbatim | pi | wall with no gate, marked unknown |
| "Asked for, never read back" | `basis: planned` on every door | derived | — |
| Ring contents ("Every container, and the output it has written") | `inventory` of `volume` + `process` | pi | ring named, empty |
| Holes ("The firewall has not been read back", "Traffic is not encrypted") | declared absences + derived from `basis` | pi + derived | — |
| Check now | **Execute** (`check-firewall`), or Ask when no provider is connected | auto | Ask |
| Ask what a stranger can reach | Ask | derived | — |

### Variables — Manifest

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| Count and headline | `inventory` of `value` and `config-file` | pi | "Nothing configures it on record" |
| Groups (stated by the plan / only you could give / made by Server Guy / wired to services) | `who` per member | pi | one ungrouped list |
| Where a value lives, never the value | `held` + `where` in words | pi | — |
| Pending ("not live yet") | recorded after the newest deployment | derived | — |
| Files table (file, read by, size, checksum, mode) | `inventory` of `config-file` with `facts[]` | pi | section absent |
| Waiting for you | inputs with no value yet, with the reason | pi | section absent |
| Change a value | Ask | derived | — |

**The model never carries a value.** A page cannot leak what it does not hold; this is a contract requirement, not a rendering choice.

### CDN, Cache & queue, Jobs — Origin, Queue, Rota

These three are designs about absence and need **no new content**. Each draws the one thing that exists and names the missing layer where it would go.

| Component | Needs | From | Missing → |
| --- | --- | --- | --- |
| CDN: the one machine, where it stands | `host` facts | pi | "Location not recorded" |
| CDN: the empty shelf | absence of a `cdn` subject | derived | the shelf, labelled |
| Cache: the empty line | absence of a `broker` subject | derived | "Nothing puts work here" |
| Cache: "No worker" | `inventory` of `process` with no worker role | derived | — |
| Jobs: Server Guy's own recurring work | `schedule` for `backup-plan` | pi | "Nothing recurs" |
| Jobs: the ghost "A command of yours" | component-owned shape | derived | — |
| Jobs: "At what hour · Not on record" | `schedule.hour: null` | pi | — |

They must never be given invented infrastructure to draw.

---

## 7. Actions

Three kinds. The reference uses the first two almost everywhere.

**Navigate** — no backend, no record.

| Action | Where |
| --- | --- |
| Open a destination | every card footer; "Open Architecture →", "Open History →", "The processes that run", "The name and certificate in front of it" |
| Open the conversation at a message | History entries, Deployment's origin line |
| Open a part on the map | Overview attention card → "Show on the map →" |
| Open the application | the header's "Open <app> ↗", `application-access.url` |
| Select within a view | journey selector, ring, caller window, station, day, Folded/To scale, earlier reads, filters |

**Ask** — drafts a message into the main conversation. This is how the reference does everything consequential, and it needs no new capability and no new permission surface.

| Draft | Where |
| --- | --- |
| "Check that <processes> are running and healthy now" | Processes |
| "Check that <app>'s database is healthy now" | Database |
| "Back up <app>'s database now and verify the copy" | Database |
| "Ask Server Guy to list the copies" | Backups |
| "Ask Server Guy to measure them" | Storage |
| "Ask Server Guy to print the latest output" | Logs |
| "Ask Server Guy to set up a health watch" | Monitoring |
| "Ask what a stranger can reach" | Security |
| "Ask for a knock test" | Domains |
| "Change a value" / "Give it in the conversation" | Variables |
| "Release or update" | Deployment |
| "Ask whether it would help" / "one is needed" / "what could be scheduled" | CDN, Cache, Jobs |
| "Look into it" | Overview attention card |
| per-part re-check | Architecture |
| per-vital ask | Overview lanes |

The contract for an Ask is one optional field on the thing drawn: `ask?: string`. Components compose their own drafts from facts they hold; Pi supplies one only on a recommendation, through `nextStep`.

**Execute** — a capability the controller runs without a model call. Today's `ViewAction` union has twelve. The proposal: the happy path ships **none**, and each must earn its place by being idempotent, explicable in one sentence, and genuinely worse as an Ask. Only `check-firewall` and `refresh-logs` are plausible survivors, both read-only. Chat stays the place to act, which is the product's premise.

---

## 8. One deployment, across chat and the views

The lightweight application, as the records it would produce. Ids abbreviated.

### 8.1 In chat — the deployment, as an event

```json
{
  "title": "Docker Getting Started is deployed and answering",
  "body": "The app runs as a non-root Node 22 container behind Nginx, managed by systemd. It answers on the host's loopback only; the access record says how to open it.",
  "establishedAt": "2026-09-12T16:05:00Z",
  "evidence": [{ "type": "execution", "id": "exec-a1" }, { "type": "execution", "id": "exec-a2" }],
  "presentation": {
    "views": ["deployment", "overview"],
    "role": "outcome",
    "status": "verified",
    "checks": [
      { "label": "Public web page and CRUD API answered", "status": "passed", "basis": "observed" },
      { "label": "SQLite persistence survived a restart", "status": "passed", "basis": "observed" },
      { "label": "HTTPS and off-server backups not configured", "status": "info", "basis": "observed" }
    ],
    "content": {
      "kind": "deployment",
      "repositoryUrl": "https://github.com/docker/getting-started-app",
      "revision": "6b025fc",
      "image": "getting-started:6b025fc",
      "server": "docker-getting-started-4bda8854",
      "changes": ["First deployment", "systemd unit installed"]
    }
  }
}
```

**In chat** it renders as the information card, under the reply, with `showInChat`.
**In Deployment** it is the headline, the tone, the facts row and "Checks it passes" — three checks, so the page says "Against the 3 checks listed below, and nothing else".
**In Overview** it is the first mark on the Checks lane and the newest entry in Recent work.
**In History** it is an entry on 12 September with its evidence and its origin conversation.

### 8.2 The host, as a subject

```json
{
  "subject": { "kind": "host", "id": "hetzner-165600952" },
  "title": "Server reachable over SSH",
  "body": "CX23 in hel1/Helsinki, 2 vCPU, 4 GB, Ubuntu 24.04. Root SSH uses the controller-managed key.",
  "establishedAt": "2026-09-12T15:48:00Z",
  "evidence": [{ "type": "execution", "id": "exec-b7" }],
  "presentation": {
    "views": ["overview", "architecture"],
    "role": "status",
    "status": "verified",
    "checks": [{ "label": "SSH connected as root", "status": "passed", "basis": "observed" }]
  }
}
```

At 15:48 Overview's Server lane reads "Reached just now". Three days later **the same record** reads "Reached 3 days ago" with a freshness band across the gap, Architecture's host tag turns amber, and CDN still names the machine and its city — because `host` facts do not expire the way a check does. Pi wrote nothing new; nothing pretended otherwise.

### 8.3 The map

```json
{
  "subject": { "kind": "application", "id": "app-e16000ed" },
  "title": "How the application is put together",
  "body": "One host answers the web, with the database on disk beside it.",
  "establishedAt": "2026-09-12T16:05:00Z",
  "presentation": {
    "views": ["architecture", "overview"],
    "role": "status",
    "status": "verified",
    "content": {
      "kind": "topology",
      "from": "observed",
      "parts": [
        { "id": "source", "kind": "source", "name": "docker/getting-started-app", "role": "The repository", "plain": "Where the code comes from" },
        { "id": "hetzner-165600952", "kind": "host", "name": "Hetzner CX23", "role": "The server", "plain": "The one machine everything runs on", "facts": [{ "label": "Where", "value": "Helsinki", "basis": "reported" }] },
        { "id": "door-80", "kind": "gate", "name": "80", "role": "HTTP", "plain": "The way in from the network", "owner": "hetzner-165600952" },
        { "id": "process-app", "kind": "web", "name": "getting-started", "role": "Your application", "plain": "The pages you open", "owner": "hetzner-165600952" },
        { "id": "volume-todo", "kind": "volume", "name": "todo.db", "role": "The database file", "plain": "Where your list is kept", "owner": "process-app" }
      ],
      "edges": [
        { "from": "door-80", "to": "process-app", "network": "public", "label": "80" },
        { "from": "process-app", "to": "volume-todo", "network": "disk" }
      ],
      "absent": [
        { "id": "offsite", "kind": "offsite", "name": "Off-site copies", "would": "keep a copy of todo.db away from this server" },
        { "id": "watch", "kind": "monitor", "name": "Monitoring", "would": "watch the application between deployments" }
      ]
    }
  }
}
```

**In Architecture** this draws five parts, two ghosts, the private boundary and the disk boundary; `process-app` shows verified because a `process:process-app` record exists and is fresh; `volume-todo` shows unknown until one does. **Nothing on the map is coloured by the topology record itself.**
**In Overview** the same record draws the small map, and the two ghosts explain why Backups reads "Not set up".
**In Storage** the volume part contributes its mount and owner; its pieces come from the volume inventory.
**Before deployment** the identical shape with `from: "plan"` draws every part in ghost and every lane as Planned.

### 8.4 The backup schedule

```json
{
  "subject": { "kind": "backup-plan", "id": "daily-todo" },
  "title": "Daily copy of the database, seven kept",
  "body": "A systemd timer copies todo.db at 03:15 UTC after an integrity check.",
  "establishedAt": "2026-09-12T16:02:00Z",
  "evidence": [{ "type": "execution", "id": "exec-c3" }],
  "presentation": {
    "views": ["backups", "overview", "jobs", "storage"],
    "role": "status",
    "status": "verified",
    "content": { "kind": "schedule", "what": "Copy todo.db", "cadence": "Daily at 03:15", "timezone": "UTC", "installedAt": "2026-09-12T16:02:00Z", "nextAt": "2026-09-13T03:15:00Z", "keep": 7 }
  }
}
```

**In Backups** it names the rows and draws tomorrow's 03:15 in outline.
**In Overview** it fills the Backups lane and puts one mark in the Tomorrow column.
**In Jobs** it is the "Server Guy's own backup" card.
**In Storage** it is the "Daily backups · keeping the latest 7" node between the volumes and off-the-server.

If 03:15 passes with no copy event, every one of those says the copy is **not on record** — never that the backup failed, because nothing checked.

### 8.5 A copy actually made, as an event

```json
{
  "title": "Copied todo.db off the server",
  "body": "6.1 MB archive verified by size and SHA-256 after download.",
  "establishedAt": "2026-09-13T03:15:41Z",
  "evidence": [{ "type": "execution", "id": "exec-d9" }],
  "presentation": {
    "views": ["backups", "storage", "database"],
    "role": "outcome",
    "status": "verified",
    "checks": [{ "label": "Archive matched its checksum", "status": "passed", "basis": "observed" }],
    "content": { "kind": "measurement", "of": "backup", "value": 6.1, "unit": "MB", "at": "2026-09-13T03:15:41Z" }
  }
}
```

It fills the outlined cell on the calendar, adds a mark to Database's copies lane, updates Storage's "Off the server · Newest copy" and never supersedes anything: tomorrow's copy is a second event beside it.

---

## 9. What the lightweight happy path needs now

**Now**, to make Overview, Architecture, Deployment, History and Logs real for one simple application:

1. `subject` on the record, and newest-per-subject reads. Everything else depends on it.
2. The freshness rule in the component layer: `freshFor` per subject kind, `stale` owned by the UI, optional `freshFor` override from Pi.
3. `basis` on checks and facts.
4. `topology` content with `from`, part states resolved from subject records, and `absent` for declared gaps.
5. `schedule` content, for the future column and the calendar.
6. Lane derivation from subject kind; retire the authored `check.subject`.
7. `resolves` on event records, for History's pairs.
8. Actions limited to Navigate and Ask.
9. `planned` as a state, so the pre-deployment screens are drawable.

**Later**, each when its destination is taken:

- `inventory`, one subject kind at a time: `process` first, then `volume`, `door`, `value`, `config-file`, `job`, `monitor`.
- `measurement`, when a view first needs a number.
- Log parsing for Logs' speakers and levels (the collection itself is already an execution).
- Restore-test and copy events for the Backups calendar's full behaviour.
- Any Execute action, each argued for on its own.
- Side conversations reading the same records.

---

## 10. What this contract refuses

- **No health from absence.** A missing record is unknown, drawn as unknown, worded as unknown. There is no path from "nothing recorded" to a green mark.
- **No invented infrastructure.** A diagram draws what Pi found plus what Pi explicitly declared missing. Never a placeholder to balance a layout.
- **No generic cards where a design exists.** A destination with an accepted design renders that design from these facts. The card is for records no designed component claims, and for chat.
- **No prose where a field belongs.** If a component needs a number, a time, an identity or a basis, it gets a field. Parsing it back out of Pi's sentences is how the freshness and lane bugs return.
- **No values, ever.** Variables carries names, places and reasons. A page cannot leak what it does not hold.
