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

| Read | Definition |
| --- | --- |
| **Current state of X** | the newest record whose `states.ref` is X |
| **Series for X** | every record whose `states.ref` is X, oldest first |
| **Everything about X** | every record with X in `about` **or** `states.ref` |

Consequences, stated as rules:

- A record with `states` supersedes nothing physically. The previous record for that subject is still stored, still readable, still in the series and still in History. "Superseded" is a property of a read, not a write.
- **A record without `states` never becomes current state of anything, no matter how many things it is about.** A copy of the database is `about` `database:todo` and `backup-plan:daily` and stays an event: it appears in Database's copies lane, on the Backups calendar and in Storage's off-the-server node, and it never answers "what is the state of the database".
- `states` is at most one subject. A record that would state two is two records. This keeps "current" unambiguous.
- `about` is additive and unordered. It is what every "show me everything that touched this" read uses.
- `retiredAt` withdraws a record Pi no longer stands behind — a correction. It is not how you say a thing stopped existing; that is a new record with `presence: "absent"`.

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
| `identity` | what a thing is | never | region, instance type, image digest, mount path, checksum |
| `configuration` | what was set | slowly | firewall rules, env applied, systemd unit installed |
| `reachability` | something answered | quickly | SSH connected, HTTP 200, probe passed |
| `liveness` | it is running now | very quickly | container up, process running |
| `contents` | what is inside or how much | moderately | disk used, row count, backup size, queue depth |

```ts
type Claim = "identity" | "configuration" | "reachability" | "liveness" | "contents"
type Basis = "observed" | "planned" | "reported"

interface Fact  { label: string; value: string; mono?: boolean; claim: Claim; basis: Basis }
interface Check { label: string; status: "passed" | "failed" | "info";
                  claim: Claim; basis: Basis; about?: Ref; detail?: string }
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

```
fresh(x)  = x.establishedAt + (x.freshFor ?? expiry[x.claim]) > now
shown(x)  = x.status === "verified" && !fresh(x) ? "stale" : x.status
```

Freshness is computed **per claim, and a component asks for the freshness of the claim it is drawing.** The same host record therefore reads differently in different places, correctly:

| Where | Claim drawn | Three days later |
| --- | --- | --- |
| Architecture's host tag | `reachability` — "SSH connected" | amber, "Reached 3 days ago" |
| CDN's "where it stands" | `identity` — Helsinki, CX23 | unchanged, no tag |
| Overview's Server lane | `reachability` | the band of not-knowing |
| Deployment's "Server" fact row | `identity` | plain, no ageing |

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
lane(check) = laneOf(check.about ?? record.states?.ref ?? record.about[0])
timelineWorthy(check) = lane(check) !== null && record.establishedAt !== null

laneOf(ref) = process, database        → "application"
              backup-plan, volume      → "backups"
              host                     → "server"
              access, door, domain, certificate → "access"
              anything else            → null
```

`check.about` is an optional per-check override, which is what preserves today's behaviour exactly: a deployment record that touches several subjects can still place each check in its own lane. The difference is that Pi names a thing rather than a column, so the same field also drives Architecture, Processes and History, and a new lane never requires re-teaching Pi.

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
  doors: {
    id, port: number, protocol: "tcp" | "udp",
    serves: { partId: string; port?: number } | null,
    sources: ({ cidr: string } | { tag: string })[],
    basis: Basis, at: string | null,
    unasked?: boolean, concern?: string
  }[] }

reach(door) = sources contains 0.0.0.0/0 or ::/0        → "internet"
              sources non-empty, all narrower           → "restricted"
              sources empty and the port is loopback    → "private"
              no door for that port                     → "closed"
```

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
      { "label": "SSH connected as root", "status": "passed", "claim": "reachability", "basis": "observed" }
    ],
    "facts": [
      { "label": "Where", "value": "Helsinki, Finland", "claim": "identity", "basis": "reported" },
      { "label": "Size", "value": "CX23 · 2 vCPU · 4 GB", "claim": "identity", "basis": "reported" },
      { "label": "Public address", "value": "46.62.253.6", "mono": true, "claim": "identity", "basis": "reported" }
    ]
  }
}
```

Three days on, Overview's Server lane and Architecture's host tag read "Reached 3 days ago" in amber, because `reachability` expires in twelve hours. CDN still names the machine as a CX23 in Helsinki, with no tag at all, because those facts are `identity` and do not age. One record, two correct readings.

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
          "facts": [{ "label": "Where", "value": "Helsinki, Finland", "claim": "identity", "basis": "reported" }] },
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
      { "label": "Local browser endpoint returns HTTP 200", "status": "passed", "claim": "reachability", "basis": "observed",
        "about": { "kind": "access", "id": "app-dgs" } },
      { "label": "Application ports bind only to server loopback", "status": "passed", "claim": "configuration", "basis": "observed",
        "about": { "kind": "process", "id": "process-nginx" } },
      { "label": "Public HTTP unavailable from this PC", "status": "passed", "claim": "reachability", "basis": "observed",
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
      { "label": "Web page and CRUD API answered", "status": "passed", "claim": "reachability", "basis": "observed",
        "detail": "GET /api/items → 200, POST then GET round-tripped",
        "about": { "kind": "process", "id": "process-app" } },
      { "label": "Data survived a container restart", "status": "passed", "claim": "contents", "basis": "observed",
        "about": { "kind": "volume", "id": "volume-todo" } },
      { "label": "Container healthy and recovered after reboot", "status": "passed", "claim": "liveness", "basis": "observed",
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

**No `states`.** It is about four subjects and is the current state of none of them — which is the correction the review asked for. It appears in chat as a card, in Deployment as the headline and its three checks, in Overview's Recent work and three lane marks, and in History as an entry. It never answers "is the app running now"; the process records do.

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
    "checks": [{ "label": "GET / returned 200", "status": "passed", "claim": "reachability", "basis": "observed" }]
  }
}
```

Processes now shows one row for `process-app` reading this record. Overview's Checks lane shows **both** this mark and yesterday's from the deployment, because the lane is a series read. Nothing was overwritten.

---

## 10. The full contract, in one list

`about[]` · `states {ref, presence}` · `Claim` on every check and fact · `Basis` on every check and fact · optional `freshFor` · `check.about` · `resolves` · contents: `topology`, `doors`, `schedule`, `backup-plan`, `backup-copy`, `restore-test`, `inventory`, `measurement`, plus today's `deployment` and `application-access`.

---

## 11. The smallest slice

What the deployment we already have needs to run **its existing screens** — chat, Overview, Architecture, Deployment, History, Processes, Logs — on real records. Backups, scheduling and recovery are deliberately out.

**In:**

1. `about[]` and `states {ref, presence}`, with current-state reads as newest-per-subject. Append-only; nothing mutates.
2. `claim` and `basis` on checks and facts, with the expiry table in the component layer and `stale` owned by the UI.
3. `presence: "absent"` and the two empty states everywhere a design says "there is none".
4. `topology` content with `from`, `loopback` edges, part states resolved from records, and `absent[]`.
5. `check.about` and lane derivation (§4.1), retiring `check.subject`.
6. `planned` as a state, so the pre-deployment screens draw.
7. Actions: Navigate and Ask only.

**Out of the first slice**, each when its destination is taken:

- `schedule` and everything that expands a recurrence — the Backups calendar, Overview's future column, Jobs' next run. Overview's timeline ships with history and now, and no Tomorrow.
- `backup-plan`, `backup-copy`, `restore-test` — all of Backups and Storage's flow.
- `resolves` — History ships without failure/repair pairing.
- `doors` — Security and Domains keep their current views.
- `inventory` beyond what `topology.parts` already gives Processes.
- `measurement`.
- Any Execute action.

The seven items in are the ones with no useful subset: without `states` there is no current state, without `claim` freshness is wrong for half the facts, and without `presence` the screens lie about absence. Everything else is additive and can land per destination.

---

## 12. What this contract refuses

- **No health from absence, and no absence from absence.** A missing record means nobody looked. Only a record with `presence: "absent"` licenses "there is none".
- **No invented infrastructure.** A diagram draws what Pi found plus what Pi explicitly declared missing.
- **No generic cards where a design exists.** The card is for records no designed component claims, and for chat.
- **No prose where a field belongs.** A number, a time, an identity, a basis, a claim or a recurrence gets a field. `"Daily at 03:15"` is not a schedule.
- **No computing from an unknown.** `recurrence: {rule:"unknown"}` may be printed and never expanded.
- **No values, ever.** Variables carries names, places and reasons.
