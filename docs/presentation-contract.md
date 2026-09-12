# The presentation contract

A proposal, 12 September 2026. It describes the data and interaction contract the accepted reference designs need in order to run on real Pi output, and nothing has been implemented from it. No schema, database or deployment change is proposed here; the staging section at the end says what the lightweight happy path needs first.

It is written against the reference at `/applications/<id>` on the reference build (the selected directions for all sixteen destinations) and against what exists today on `codex/hetzner-provisioning`: `src/server/operator-data.ts`, `src/server/pi.ts`, `src/components/server-guy/record-overview.tsx`, `application-section-view.tsx`, [DESIGN.md](../src/components/server-guy/DESIGN.md) and [operator design](operator-design.md).

## What we have, and where it stops

Today a surfaced record is prose plus a flat list of checks, with two typed contents (`deployment`, `application-access`) and four check subjects (`application`, `backups`, `server`, `access`). That is enough for a card and for a first timeline, and it was the right first cut. Three things the reference designs do are not expressible in it:

1. **It cannot say what a fact is about.** Every record is a new record. Nothing states that this observation of `grafana.db` replaces the previous observation of `grafana.db`, so a view cannot show a current state — only a pile of past statements. Every inventory in the reference (processes, volumes, doors, values, jobs, checks) needs identity.
2. **It cannot say how long a fact stays true.** `establishedAt` is recorded but nothing says when it stops meaning "now". The reference says "Checked 3 days ago", "No check for 3 days", "may have changed" everywhere; those sentences need an expectation, not just a timestamp.
3. **It cannot say what is going to happen.** The Overview timeline runs twelve hours into the future and the Backups calendar draws scheduled days that have no copy on record. Both need installed schedules as data.

Everything else the reference needs is either a small addition to the typed-content union or something the UI should derive and never store.

## Three sources, and the rule for each

| Source | What it owns | Rule |
| --- | --- | --- |
| **Pi writes** | Meaning. What a thing is, what it is for, whether an outcome is good, what to do next, what the parts are and how they connect. | Pi writes only what it established. It never writes a relative time, a count, a colour, a status word that belongs in a tag, or a fact it did not observe. |
| **The controller records** | Events. Executions (command, target, exit code, output, start and finish), messages, approvals, conversation identity. | Automatic and already true. Pi must not re-type into a record what an execution already proves; it cites the execution as evidence. |
| **The UI derives** | Time, arithmetic and layout. Relative times, freshness, ordering, counts, timeline windows and ticks, the gaps between observations, "expected but not recorded", journey sentences, which lane a check belongs to. | Derivation never invents a fact. If the inputs are missing the component renders unknown, never healthy. |

The dividing line that resolves most arguments: **anything with an exit code is automatic, anything with a meaning is Pi's, anything with a clock in it is the UI's.**

## The five states, and where each one comes from

The reference speaks five states. Only three of them are Pi's to write.

| State | Means | Set by |
| --- | --- | --- |
| **unknown** | Nothing has been established. Not a claim of health. | The UI, whenever no record covers the subject. |
| **working** | Something is running right now. | The controller, from a live execution or run. |
| **verified** | Pi checked it, and the check is still within its freshness window. | Pi writes `verified`; the UI confirms it is still in window. |
| **stale** | It was verified once and the window has passed. It may have changed. | **The UI only.** Pi cannot write `stale`; it has no way to know the future. |
| **failed** | A check ran and did not pass. | Pi writes `failed`. |

`warning` in today's enum is a sixth thing — "true, and it wants looking at". Keep it, but it is a judgement, not a freshness state; it survives ageing and reads as attention.

### The freshness rule

This is the single rule that makes the reference's copy possible, and it is the thing today's code cannot do.

```
fresh(record)  = establishedAt + freshFor(subject.kind) > now
displayed      = record.status === "verified" && !fresh(record) ? "stale" : record.status
```

`freshFor` belongs to the component layer, per subject kind, not to Pi — a container health check goes stale in hours, a firewall rule in days, a server's identity effectively never. Pi may override it with `freshFor` in seconds when it knows better (a certificate expiring, a lease). The consequences the reference depends on:

- A lane can say "No check for 3 days" by measuring from the newest observation of that subject to now.
- Overview's headline can honestly say "Nothing needed you when Server Guy **last looked**" instead of "everything is fine".
- Ageing never turns green into red. A stale check is amber and says it may have changed; only a check that ran and failed is red.
- A subject with no record at all is unknown and says so. **Missing data is never health.**

## Current state versus history

One mechanism, and it is the main addition this proposal asks for: a record may name its subject.

```ts
subject?: { kind: SubjectKind; id: string }
```

- **With a subject** the record is a *current state*. A newer record with the same `(kind, id)` supersedes the older one. Views showing "what is true now" read only the newest per subject. The superseded record is not deleted — it is how the timeline shows that an observation changed.
- **Without a subject** the record is an *event*. Events accumulate and are never superseded: a deployment, a restore test, an incident, a handover.

`SubjectKind` for the destinations we have designs for: `application`, `host`, `process`, `volume`, `database`, `door`, `domain`, `certificate`, `value`, `job`, `monitor`, `backup-plan`, `access`. The list is expected to grow one entry at a time as a destination earns it, never all at once.

This answers three questions the designs kept asking:

- *What updates in place?* Anything with a subject. Pi re-checks `process:grafana` and writes a new record for the same subject; Processes shows one row, Overview's Checks lane gains a mark, History keeps both.
- *What must remain?* Every event, and every superseded observation. The Overview timeline, the Monitoring log and History are all reads over the full series; only the "current" views collapse to the newest.
- *What does retiring mean?* `retiredAt` says the subject no longer exists (a container removed, a rule deleted) — not that the record is wrong. It renders absent, dashed, and the history stays.

## Typed content

`presentation.content` is the right place for the shapes a component needs beyond prose. Today it has two kinds. This proposes four more, chosen because a designed component cannot be drawn without them and a paragraph of prose cannot substitute.

### `topology` — Architecture, and Overview's map

One record per application, updated in place (`subject: {kind:"application", id}`). Parts carry identity and description; **they carry no state.** A part's state is the newest record whose subject is that part. A part with no record renders unknown. This is what stops the map from inventing infrastructure to look complete.

```ts
{ kind: "topology",
  parts: { id, kind: PartKind, name, role, plain, owner?, facts?: {label,value,mono?}[] }[],
  edges: { from, to, label?, network: "public" | "private" | "disk" }[],
  absent?: { id, kind, name, would: string }[] }
```

`PartKind` matches the reference: `controller | source | gate | tls | host | web | private | volume | offsite`. `absent` is how the reference draws its ghosts — "Off-site copies · Not set up", "Monitoring · would watch Grafana". They are drawn because **Pi declared them missing**, never because a field was empty.

### `schedule` — Backups' calendar, Overview's future, Jobs

Written when Pi installs recurring work, updated in place (`subject: {kind:"job"|"backup-plan"|"monitor", id}`).

```ts
{ kind: "schedule", what: string, cadence: string, timezone: string,
  nextAt?: ISO, installedAt: ISO, keep?: number, paused?: boolean }
```

The UI derives the future marks, the "expected but not recorded" days the Backups calendar draws in outline, and the countdown on Overview's Backups vital. It never asserts that a scheduled run happened; a run only exists as an event record or an execution.

### `inventory` — Processes, Storage, Domains, Security, Variables

A list whose members are subjects in their own right. The record holds the *membership and shape*; each member's state is its own record.

```ts
{ kind: "inventory", of: SubjectKind,
  members: { id, name, role, plain, facts?: {label,value,mono?}[], owner? }[] }
```

This keeps the schema small: one shape serves six destinations, and a destination becomes real the moment Pi writes its inventory, without a new content kind per view.

### `measurement` — the numbers views show

```ts
{ kind: "measurement", of: string, value: number, unit: string, at: ISO,
  total?: number, note?: string }
```

Disk used, backup size, queue backlog, line counts. Separated from checks because a number is not a pass or a fail, and the reference never colours one.

## Destination by destination

What each accepted design needs, and where it comes from. **Pi**, **auto** (controller), **derived** (UI).

### Overview — Timeline

| Component | Needs | Source |
| --- | --- | --- |
| Headline and subline | Whether anything is failing or waiting; the newest observation time | derived from records |
| Access chip, "Open <app>" | `application-access` content and its url | Pi |
| Four lanes (Checks, Backups, Server, Access) | Every observation with a `subject`, mapped to a lane by subject kind | Pi writes the observation, derived lane |
| Lane status line ("Out of date", "Not set up") | Newest observation per lane + freshness | derived |
| **Freshness bands** ("No check for 3 days") | The interval between the newest observation and now, drawn as not-knowing | derived |
| **Future marks** (the Tomorrow column) | `schedule` content: `nextAt` | Pi |
| **Changing observations** | The full series per subject, not the newest | Pi writes each, derived series |
| Log console | Executions with their command, output and exit, newest last | auto |
| Map | `topology` content, part states from subject records | Pi |
| Recent work | Executions and event records with origin and conversation | auto |
| Ideas | Records with `role: "recommendation"` | Pi |

The lane mapping replaces today's `check.subject` enum: a check inherits its lane from the record's subject kind (`process`/`database` → Checks, `backup-plan`/`volume` → Backups, `host` → Server, `access`/`door`/`domain` → Access). Pi stops choosing a lane, which is one fewer thing to get wrong.

### Architecture — Journeys

`topology` content plus one observation per part. Journeys (`A visit`, `Your data`, `A release`) are **derived** from the edges: the ordered stops of a path through the graph, and the sentence under the selector is composed by the component from the parts it passes. Pi does not write journey prose.

### Deployment — Transit, and History — Transit

Both read events, not state.

| Component | Needs | Source |
| --- | --- | --- |
| Phases with start/end and lines | Executions grouped by the run that made them | auto |
| Statement, tone, what it means | The deployment event record | Pi |
| Facts (revision, image, server, url) | `deployment` content — exists today | Pi |
| Checks that proved it | `checks[]` on the deployment record, each citing its execution | Pi + auto |
| Attempts, duration | Counted from executions | derived |
| History days, filters, counts | All event records and executions by day | derived |
| "What resolved this failure" | A later event record citing the earlier one | Pi (`resolves: recordId`) |

`resolves` is the one addition History needs: a failure and its repair are drawn as a pair, and only Pi knows they are the same story.

### Backups — Calendar, Storage — Flow

| Component | Needs | Source |
| --- | --- | --- |
| Rows (copies off the server, each volume, restore tests) | `inventory` of `volume` + `backup-plan` subject | Pi |
| Cells: copy on record | Event records for each copy, with size | Pi + auto |
| Cells: scheduled, no copy recorded | `schedule` content vs the copies on record | derived |
| Cells: in the copy per the plan / left out | The plan's `pieces` per volume | Pi |
| Restore test row | Event records for restore tests, with what they proved and what they did not | Pi |
| Disk used | `measurement` | Pi |

The calendar's honesty — "the scheduled copies for Sep 10, 11 and 12 aren't on record here" — is exactly the schedule-versus-events subtraction, and it must stay a statement about *the record*, never about the copies.

### Monitoring — Tuner, Logs — Paper

| Component | Needs | Source |
| --- | --- | --- |
| Stations and signal strength | `inventory` of `monitor` + observations per subject | Pi |
| "Nothing listens between deployments" | No `monitor` subject with a `schedule` | derived |
| Per-station log of checks | The series of observations for that subject | Pi |
| Silence since … | Newest observation to now | derived |
| Collected log lines, speakers, levels | An execution's output, parsed | auto + derived |
| "Its output reached the cap" | The execution's own truncation | auto |

Monitoring is where "don't infer health from missing data" matters most: a station with no signal means *nothing is listening*, and the design says so rather than showing a healthy meter.

### Domains — Callers, Security — Rings

`inventory` of `door` with each door's reach and sources, plus `domain` and `certificate` subjects. Callers are **derived**: each caller is a component-composed question ("someone typing the name", "a browser asking for https") answered from the doors, the certificate and the access content. Pi supplies the doors as the provider states them; it does not write four caller stories.

### Processes — Line, Database — Timeline, Variables, CDN, Cache, Jobs

`inventory` of `process`, `value`, `job` with per-member observations; `schedule` for jobs; `measurement` for queue depth. The three destinations that are about absence (CDN, Cache, Jobs) need **nothing new**: their design is a statement that the record shows none, which is the unknown state rendered deliberately. They must not be given invented infrastructure to draw.

## Actions

Three kinds, and the reference uses the first two almost everywhere.

**1. Navigate** — no backend. `onOpenDestination(section)`, open a part on the map, open the conversation at the message that started the work, open the application url. Every "Open Architecture →", "Open History →", every destination pill on a card.

**2. Ask** — drafts a message into the main conversation and lets the operator do the work. This is how the reference asks for everything consequential: "Check that Grafana's database is healthy now", "Back up Grafana's database now and verify the copy", "Ask Server Guy to list the copies", "Ask Server Guy to set up a health watch", "Give it in the conversation". It needs **no new capability and no new permission surface** — the message enters the main conversation and the permission mode governs what happens next.

The contract for an Ask is one field on the thing being drawn: `ask?: string`, the draft. A component may compose its own draft from facts it already has; Pi may supply one on a recommendation via `nextStep`.

**3. Execute** — a capability the controller can run without a model call. Today's `ViewAction` union has twelve. The proposal is that the happy path ships **none of them**, and that each one must earn its place afterwards by being (a) idempotent, (b) explicable in a sentence, and (c) genuinely worse as an Ask. `check-firewall` and `refresh-logs` are the two plausible survivors, because both are read-only.

This is deliberate: chat stays the place to act, which is the product's premise, and it keeps the first implementation small.

## Concrete example: one deployment

The lightweight application Pi has actually deployed, shown as the records it would write. Ids abbreviated.

**1. The deployment, as an event.** Appears in chat under the reply, in Deployment and in History.

```json
{
  "title": "Docker Getting Started is deployed and answering",
  "body": "The app runs as a non-root Node 22 container behind Nginx, managed by systemd. It answers on the host's loopback only; see the access record for how to open it.",
  "establishedAt": "2026-09-12T16:05:00Z",
  "evidence": [
    { "type": "execution", "id": "exec-a1" },
    { "type": "execution", "id": "exec-a2" }
  ],
  "presentation": {
    "views": ["deployment", "overview"],
    "role": "outcome",
    "status": "verified",
    "checks": [
      { "label": "Public web page and CRUD API answered", "status": "passed" },
      { "label": "SQLite persistence survived a restart", "status": "passed" },
      { "label": "HTTPS and off-server backups not configured", "status": "info" }
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

**2. The host, as a subject.** Supersedes the previous host observation; Overview's Server lane gains a mark.

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
    "checks": [{ "label": "SSH connected as root", "status": "passed" }]
  }
}
```

At 15:48 Overview's Server lane reads "Reached just now". Three days later **the same record** reads "Reached 3 days ago" with a freshness band across the gap, because `freshFor(host)` has passed — Pi wrote nothing new and nothing pretended otherwise.

**3. The map, as topology.** One record, updated in place.

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
      "parts": [
        { "id": "source", "kind": "source", "name": "docker/getting-started-app", "role": "The repository", "plain": "Where the code comes from" },
        { "id": "hetzner-165600952", "kind": "host", "name": "Hetzner CX23", "role": "The server", "plain": "The one machine everything runs on", "facts": [{ "label": "Where", "value": "Helsinki" }] },
        { "id": "door-80", "kind": "gate", "name": "80", "role": "HTTP", "plain": "The way in from the network", "owner": "hetzner-165600952" },
        { "id": "process-app", "kind": "web", "name": "getting-started", "role": "Your application", "plain": "The pages you open", "owner": "hetzner-165600952" },
        { "id": "volume-todo", "kind": "volume", "name": "todo.db", "role": "The database file", "plain": "Where your list is kept", "owner": "process-app" }
      ],
      "edges": [
        { "from": "door-80", "to": "process-app", "network": "public", "label": "80" },
        { "from": "process-app", "to": "volume-todo", "network": "disk" }
      ],
      "absent": [
        { "id": "offsite", "kind": "offsite", "name": "Off-site copies", "would": "keep a copy of todo.db away from this server" }
      ]
    }
  }
}
```

Architecture draws five parts and one ghost. `process-app` shows verified because a record with `subject: {kind:"process", id:"process-app"}` exists and is fresh; `volume-todo` shows unknown until one does. **Nothing on the map is coloured by the topology record itself.**

**4. The backup schedule.** Makes the Backups calendar and Overview's countdown possible.

```json
{
  "subject": { "kind": "backup-plan", "id": "daily-todo" },
  "title": "Daily copy of the database, seven kept",
  "body": "A systemd timer copies todo.db at 03:15 UTC after an integrity check.",
  "establishedAt": "2026-09-12T16:02:00Z",
  "evidence": [{ "type": "execution", "id": "exec-c3" }],
  "presentation": {
    "views": ["backups", "overview"],
    "role": "status",
    "status": "verified",
    "content": { "kind": "schedule", "what": "Copy todo.db", "cadence": "Daily at 03:15", "timezone": "UTC", "nextAt": "2026-09-13T03:15:00Z", "installedAt": "2026-09-12T16:02:00Z", "keep": 7 }
  }
}
```

Tomorrow's 03:15 appears as an outlined, not-yet-happened mark on both the calendar and the Overview timeline. If 03:15 passes with no copy event, the calendar draws the day in outline and says the copy is not on record — never that the backup failed, because nothing checked.

## What the lightweight happy path needs now

**Now**, to make Overview, Architecture, Deployment and History real for one simple application:

1. `subject` on the record, and newest-per-subject reads. Everything else depends on it.
2. The freshness rule in the component layer, with `freshFor` per subject kind and a `stale` state the UI owns.
3. `topology` content, with part states resolved from subject records and `absent` for declared gaps.
4. `schedule` content, for the future column and the Backups calendar.
5. Lane derivation from subject kind, retiring the authored `check.subject`.
6. `resolves` on event records, for History's pairs.
7. Actions limited to Navigate and Ask.

**Later**, each when its destination is taken:

- `inventory` content, one subject kind at a time (processes first, then volumes, doors, values, jobs).
- `measurement` content, when a view first needs a number.
- Log collection parsing for Logs and Monitoring.
- Any Execute action, each argued for on its own.
- Side-conversation reads over the same records.

## What this proposal refuses

- **No health from absence.** A missing record is unknown, drawn as unknown, worded as unknown. There is no path in this contract from "nothing recorded" to a green mark.
- **No invented infrastructure.** A diagram draws what Pi found, plus what Pi explicitly declared missing. Never a placeholder to balance a layout.
- **No generic cards where a design exists.** A destination with an accepted design renders that design from these facts. The card is for records a designed component does not claim, and for chat.
- **No prose where a field belongs.** If a component needs a number, a time or an identity, it gets a field. Parsing it back out of Pi's sentences is how the freshness and lane bugs would return.
