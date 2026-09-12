# Architecture from real records — 12 September 2026

The first designed destination driven by records Pi wrote. Owner accepted the
visual result on 12 September 2026 and asked for Overview next on the same
projection. Delivered in [#61](https://github.com/lustoykov/server-guy/pull/61)
and [#62](https://github.com/lustoykov/server-guy/pull/62).

This closes the gap the earlier checkpoints left: the accepted reference
designs existed, and nothing Pi wrote could reach them.

## Result

A record can say what it is about. `presentation.about` links everything it
concerns; `presentation.states` names at most one subject whose current state
it asserts, carrying `presence`. Only that can say a thing is absent — no
record at all means nobody looked, which the pages now distinguish. Every
check and fact carries a stable `key`, a `claim` and a `basis`, and
`check.about` replaces the authored `check.subject`. `topology` joins
`deployment` and `application-access`; nothing else was added.

`record-projection.ts` is the one reader. It answers presence, outcome and
freshness as three separate questions, assembles facts key by key with each
value keeping the record that dates it, and never promotes a missing input to
health. `record-contract.ts` refuses a record that parses but cannot be drawn,
in messages written for Pi.

`architectureFromRecords` builds the ten fields the accepted Journeys design
draws. Layout slots belong to the component and references belong to Pi: the
map has one place for a host, Pi calls it `hetzner-server-165619823`, and only
the reference reads records. A destination with a designed component now uses
it for complete, partial and unassessed data rather than falling back to cards.

The contract went from 771 lines to 301, with every later destination's
vocabulary kept under **Deferred** — schedules, backup models, inventories,
measurements, repair pairing, lanes and ongoing synchronisation.

## Verification

- Application suite: 469 passed, one optional Docker test skipped, none failed.
- TypeScript clean.
- Read rules: the five Architecture reads are tests with concrete records —
  first observations draw the map; a later SSH-only observation keeps the
  configuration and its original timestamps; a replacement machine inherits
  nothing; monitoring moves unassessed → absent → present with no ghost left
  behind; the same records read twice give the same page.
- Save-time contract: missing key/claim/basis, duplicate keys, a retired
  `subject`, a planned check reporting an outcome, `verified` with no
  `establishedAt`, an absence that then describes the thing, facts or checks
  naming no subject, a topology on a record that does not state the
  application, and an edge joining a part the map never draws.

### Real Pi, on the existing deployment

Application `b2184a72-0d17-40cb-be94-bc1c38b5d9d3` (`Test 2 eqw`), the live
Hetzner deployment. Permission mode **always-ask** throughout. Pi ran **no
server commands and no deployment** — only `search_information` and
`get_application_status`. Two turns in the main conversation: nine model calls,
then two.

- Pi read the saved records and execution evidence and wrote **six records
  that state subjects**: the application (a `topology` of 7 parts and 6
  edges), the host, the container, the way in, the volume, and a monitor it
  found in the evidence — Docker's own container health check on the items
  endpoint. It reused the provider's identifier as its reference, which is
  what lets a later observation add to this one.
- **The save-time contract corrected Pi without help.** Its first topology was
  refused twice — *"A topology is the application's own map, so the record has
  to speak for it: states {ref: {kind: application, …}}"* — and the next
  attempt succeeded. Pi said so in its own reply: it had identified the stored
  format. It then went back and gave all five part records their subjects.
- The page renders those records: the repository card at revision `6b025fc`,
  the host `getting-started-b2184a72` in Helsinki checked at 21:08, one open
  door, the private SSH tunnel, the container checked at 21:24, `todo.db` on
  the disk, and the monitor in the watch slot.
- **Freshness, unstaged:** the monitor reads *stale* rather than verified,
  because its check is a `liveness` claim and fifteen minutes had passed. The
  host's `configuration` facts and the container's `reachability` check stood.
- **Missing evidence stays honest:** the application's own condition reads
  *unknown*, because the deployment record speaks for no subject, so nothing
  on record says whether the application is working. The page says that rather
  than implying health.
- Reload reconstructs the page part for part; it holds no state of its own.
- The application with no topology — before this turn — showed the designed
  empty state, not a diagram of nothing.

Nothing authored by hand remains in that application: the comparison fixture
application and one hand-written record were deleted before the proof.

## Limitations

- **Pi needed one corrective turn to use the declared keys.** It first wrote
  `host.ssh-reachable` and `host.location` where the page reads `ssh` and
  `region` — reasonable names for a vocabulary that had never been written
  down for it. The keys are now in Pi's guidance, per part kind, and Pi
  re-keyed all five records on request. Whether a fresh deployment produces
  them unprompted is the next thing to test.
- The topology's *composition* came from a corrective instruction in the same
  turn, not from Pi volunteering it during a deployment. A fresh end-to-end
  deployment is the test of that.
- `condition` is unknown on this application because no record states the
  application itself. Pi recording an application-level health claim is part
  of Overview.
- Two blockers were environmental rather than product defects: a new side
  chat has no `save_information`, so this had to run in the main conversation;
  and the main conversation's Pi session file was missing from a copied
  controller directory, restored by copying `pi-sessions/` rather than
  clearing the session reference.
- One fragile test was fixed, not skipped: the synthetic Docker engine in
  `pi-workspace.test.ts` assumed the HTTP request body always arrives in the
  upgrade head. Node may consume it first, leaving an empty head, in which
  case slicing `content-length` ate the first bytes of the tool's stdin. Both
  layouts are valid HTTP and the real engine takes either, so the engine now
  reads whichever it is given.
