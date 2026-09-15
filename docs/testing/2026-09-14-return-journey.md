# Deploy, use it, restart, come back — 14 September 2026

The whole loop in one sitting: a new application through the normal UI, a
private value the owner types and the model never sees, an approval, a working
application opened through the product's own link, a controller restart, a dead
tunnel, and the way back in.

Candidate: `claude/deployment-return-journey`, based on `main` at
[`be8c199`](https://github.com/lustoykov/server-guy/commit/be8c199).
The deployment run itself executed `be8c199` exactly; the five fixes below were
written during the session and each was re-verified afterwards on the same
records.

## Result

| Step | Result |
| --- | --- |
| 1 · Add an application through the product UI | **pass** |
| 2 · Pi reads the repository and deploys it | **pass** |
| 3 · A private input and an execution approval, through the product | **pass**, after one fix |
| 4 · Open it by the product's link and do something real | **pass** |
| 4b · Data survives container recreation **and** a restart, byte for byte | **pass** — see [Persistence](#persistence-proved-by-the-data-rather-than-by-a-count) |
| 5 · Chat, Overview, Deployment, Architecture and access agree | **pass**, after two fixes |
| 6 · Refresh and reopen | **pass** |
| 7 · Restart the controller and worker | **pass** |
| 8 · Last-known state told apart from freshly checked state | **pass**, after two fixes |
| 9 · Regain access through the product; data still there | **pass** |
| The same journey on a real provider host | **pass** — see [On real Hetzner hardware](#on-real-hetzner-hardware) |

## What was real and what stood in

The application is `lustoykov/shop-app`, the repository's own fixture: a web
process, a queue worker, PostgreSQL, Redis, receipt files that must outlive a
container, and a `SHOP_ADMIN_PASSWORD` its README says must not be in the
repository.

| Real | Stood in |
| --- | --- |
| The product: app, worker, records, projections, every view | The Hetzner **API** — catalog, pricing, create |
| The model and every tool call it made (`gpt-5.6-sol`, high) | The server's address — a Linux container on this Mac, not a machine in Helsinki |
| An actual `sshd`, real host-key scan and pinning, real key auth, a real `-L` forward | — |
| Docker Engine, the built image, five containers, named volumes | — |
| The owner's typed secret, the controller's encryption, the container's environment | — |

**Everything above the provider API is the product's own.** The cost and region
in the screenshots are the stand-in's answers, and no paid resource was created
for this run.

## The private input, proved at the far end

Pi called `request_secret` for `SHOP_ADMIN_PASSWORD` and stopped. The value was
typed into the masked field in the conversation, posted straight to the
controller, and never became a message. Afterwards, through the product's own
tunnel:

```
GET /admin/summary                              → 401
GET /admin/summary  X-Admin-Password: <typed>   → {"orders":1,"cents":3300}
```

The value the owner typed authenticates against the running container, so it
reached the process environment; it appears in no message, no record, no
execution input and no log. The stored form is a sealed blob — the API that
lists secrets returns names and times only, and there is no route that returns
a value.

## The application actually worked

Through `http://127.0.0.1:8000`, the URL the product recorded:

```
POST /orders {"item":"Return-journey verification order"} → {"id":2}
GET  /orders                    → [{"id":2, "cents":3300}]     the worker priced it
GET  /receipts/2                → "… — 33.00 EUR"              the worker wrote a file
```

The background worker is doing real work on real queue state, which is what
makes the persistence check below mean something.

## Persistence, proved by the data rather than by a count

Run on 15 September, after the owner asked for something stronger than table
counts and an HTTP 200. Four orders placed through Shop's own HTTP interface,
each one priced by the background worker and given a receipt file on a volume:

```
POST /orders  "Persistence proof — brass telescope"    → id 3, later 3500c
POST /orders  "Persistence proof — walnut desk lamp"   → id 4, later 3600c
POST /orders  "Persistence proof — linen apron"        → id 5, later 3100c
                                     with id 2 from the day before, 3300c
```

The complete reply of `/orders`, all four `/receipts/<id>` bodies and
`/admin/summary` were captured to a file. Then, in order:

1. **Containers recreated through the product.** Pi removed all four Shop
   containers and the Compose network and brought them back from the existing
   images, leaving the volumes alone. It reported four new container ids, three
   unchanged volume identities, and — the part that matters — that all four
   **receipt files matched their original checksums**.
2. **Server Guy restarted**, by exact PID rather than a pattern.
3. **The SSH master killed**, also by exact PID, identified by this
   application's own key path: the way in gone, `curl` to the private URL
   returning nothing.
4. **Access reopened through the product**, by asking in the conversation.
5. The same three endpoints captured again and `diff`ed against the baseline.

```
diff before after  →  identical
```

Byte for byte: every order id, item string, price in cents, every receipt body
the worker wrote, and the admin total of 4 orders / 13500c. The admin endpoint
still authenticates with the value the owner typed the day before, so the
secret survived the recreation too.

That is three different persistence layers proved at once — PostgreSQL rows,
Redis-driven worker output, and files on a mounted volume — across container
replacement *and* a controller restart, with the way back in re-established
through the product rather than by hand.

**No test administrator was needed.** The owner authorised creating a
disposable one; Shop's admin surface is a password the owner had already
supplied through the product's masked field, and there is no account to create,
so nothing was.

## Restart and return

Two different things get confused here, so both were run.

**The controller restarting does not kill the tunnel.** The SSH master is
started with `-f`; it daemonises, its parent becomes PID 1, and it outlives the
process that started it. Killing the controller and worker and starting them
again left the tunnel up, the page identical, and `GET …/access` answering
`{"open":true}` — correctly, because it *was* open. Records, conversation,
executions, secrets and deployment history all came back unchanged.

**A reboot does kill it.** Killing the SSH master is what a restarted Mac looks
like to this product. The controller's own `ssh -O check` then answers
`{"open":false}` within the same page poll, and that is the answer every
surface now reads.

Then, through the product: **Ask Pi to reopen it** → the sentence lands in the
composer → send → Pi reopens the forward and records it. Afterwards:

```
GET /orders      → the order placed before the restart, still there
GET /receipts/2  → the receipt the worker wrote before the restart, still there
/admin/summary   → still accepts the password supplied before the restart
```

## On real Hetzner hardware

The owner cleared the quota — five old testing servers deleted on their
instruction — and the whole loop ran again with **no stand-in anywhere**, on
[Ghost](https://github.com/TryGhost/ghost-docker), a real public repository.

| Step | Result |
| --- | --- |
| Server created through the product | **pass** — `ghost-cd7e1251` (165871496), cpx12, Ubuntu 24.04, `89.167.84.129` |
| Host key scanned and pinned, SSH verified | **pass** — real `ssh`, real host |
| Ghost 6.63.0 + MySQL 8.0.44 deployed from a pinned revision | **pass** — `3d737823` |
| Private access through the product | **pass** — HTTP 200 at `http://127.0.0.1:8080` |
| Public port refused | **pass** — `89.167.84.129` on 8080, 80 and 2368 all answer nothing |
| Controller and worker restarted, tunnel gone with them | **pass** |
| Overview after the return | **pass** — "The tunnel is closed", no anchor, Access lane red, the other three lanes green |
| Record card in the conversation | **pass** — "Tunnel closed" chip, no link |
| Access regained through the product | **pass** — HTTP 200 again, still refused publicly |

Sixteen records, including a `topology`, a `deployment`, an
`application-access`, both volumes, the database, the firewall and two backup
plans. The earlier failure record — "Hetzner quota prevents a Ghost host from
being created" — states the same `host:ghost-host` subject as the later success,
so the projection reads the newer one and the Server lane is green without
anything being retracted or rewritten. That is the presence rule doing exactly
what it is for.

On the return visit the log grew a **"while you were away"** divider above the
one line that was new since the last visit.

### What this run did not exercise

**No private input.** Ghost creates its owner account interactively on first
visit to `/ghost/`, and Pi generated the MySQL password itself, kept it in a
server-side `.env` and referred to it as `$MYSQL_PASSWORD` — never inlined into
a command. That is the right handling for a credential no human types, and it
means this run had nothing to ask the owner for. The `request_secret` path is
proved by the Shop run above, not by this one.

**No content written into Ghost.** Writing a post needs an admin account, and
creating accounts and handling login passwords is not something this session
does on the owner's behalf. Persistence is therefore carried by Pi's own
container-replacement check — "content and database survived container
replacement", recorded during deployment — rather than by a post surviving a
restart. The owner can complete Ghost's setup themselves while the tunnel is
open if they want the fuller proof.

**Cost.** €11.49/month server + €0.50 IPv4, and Pi enabled Hetzner's server
backups on its own initiative, +€2.30/month — €14.29/month total, about
€0.02/hour. The server is disposable and labelled `sg-cleanup: allowed`.

## What was wrong, and what changed

Five defects. Four are the same family — a page stating something it knew was
no longer true — and the fifth is a page that had nothing to say next.

### 1 · Overview kept offering a link that had stopped working

Every destination header asked whether the tunnel was open before drawing
"Open <app>". Overview did not: it read the URL straight off the record and
drew a live anchor unconditionally. Overview is the page a returning reader
lands on and that link is the one they are most likely to click, so the one
page that most needed the question was the only one not asking it.

The access block was extracted from `PageHead` as `AccessLink` and Overview now
uses it, with `reachable` and `onReopen` threaded from the shell. Closed shows
"The tunnel is closed" and "Ask Pi to reopen it", and no anchor at all.

### 2 · Overview's Access lane stayed green under its own warning

With the header saying the tunnel was closed, the Access lane three inches
below read a green "Checked 5 min ago" — the recorded reachability check, still
inside its twelve-hour horizon. Both statements were defensible and they were
on the same screen, and the reassuring one was wrong.

`overviewFromRecords` now takes `accessClosed` — the controller's own live
answer, the same one the header uses — and the Access lane reports it instead
of the recorded pass. Pi's sentence ("Shop is available privately from this
PC") is suppressed with it, since repeating it under a closed tunnel is the
same claim in longer words. **Only that lane hears it:** the application, its
data and the server are exactly as they were, and their lanes stay green.

### 3 · A record card in the conversation did the same

`information-content` and `information-card` drew "Open ↗" from any access
record's URL. They now take the same `reachable` and show a "Tunnel closed"
chip instead. The record keeps every word it was written with — only the
anchor is withheld.

### 4 · Reopening the tunnel erased the deployment's history

"How it got here" is meant to be the commands that put this revision on the
server. `runFor` looked for the release record's *message* evidence and, not
finding it, fell back to "the newest run on record". A deployment record cites
its **executions**, not a message — so the fallback was always taken, and it
was only right until some later turn happened. After reopening the tunnel, a
page headed "Shop revision 4e31d1df is deployed" listed the two commands that
reopened a tunnel, and nothing said so.

`runFor` now resolves cited executions to their run before falling back. The
page went from two unrelated commands to the release's real 13-minute history.

### 5 · Supplying the last value left the page with nothing to do next

Pi asks for a value and its turn ends, because only the owner can answer.
Supplying one writes to the controller and is deliberately not a message — so
nothing in the conversation changed, Pi was never told, and the page sat on a
receipt with no way forward. The reader had to work out that the next move was
theirs, and what to type.

The receipt now offers **Tell Server Guy to carry on**, which drafts
"SHOP_ADMIN_PASSWORD is supplied now. Please carry on." into the composer. It
drafts rather than sends, like every other offer on these pages, and it appears
only in the reading of the page where the last value actually went in — on a
later visit the same receipt is history.

Verified by withdrawing the value through the product's own `DELETE`, which
reopens the request, and supplying it again: the button appears and the draft
lands. Its focus hop was not observable, because `requestAnimationFrame` does
not fire while the browser pane is hidden and that is when this check ran; it
uses the same `#pi-composer` focus the shell's other offers use.

### And one thing that was already right

When Pi could not provision on the real provider it recorded the failure rather
than a success: *"Hetzner rejected provisioning because the project is at its
apparent server-count limit, so no host exists for this application. No server,
IPv4, or backup charge was started."* — with a next step, and no invented URL.

## The Backups lane, and my own resource actions

Two follow-ups the owner asked for after the first pass, each with its own
document because neither is about the journey:

- **[Why the Backups lane was green](2026-09-15-backup-protection.md).** It
  discarded Pi's own `warning` and read only the checks, so a passing "the
  timer is active" printed green under the word Backups while the only copy
  that existed sat on the same disk as the data and no restore had ever been
  attempted. Fixed, with the four kinds of protection kept apart, and with what
  the fix still does not do stated plainly.
- **[What was authorized, what was owned, and what I cannot
  establish](2026-09-14-resource-scope-audit.md).** An audit of every provider
  change this task made. The server deletions were authorized and their
  ownership is evidenced. **Deleting 17 SSH keys was not**: I never captured
  them, Hetzner keeps no audit log for them, and I cannot now say whose they
  were. Pi's paid backup add-on had general authorization but I let it stand
  instead of raising it while it could still be declined.

## Checks

| Check | Result |
| --- | --- |
| `npm test` | **813 passed**, 1 skipped. Six are new, below |
| `npm test` on `be8c199` before the change | 807 passed, 1 skipped — no regressions |
| `npx tsc --noEmit` | clean for every changed file |
| `npm run test:e2e:smoke` | 3 passed, **3 failed** |
| the same suite on a clean `be8c199` worktree | **the same 3 failed** — pre-existing, not regressions |
| `npm run format` | applied |

New focused tests:

- `tests/application/integration/overview-records.test.ts` — the Access lane
  reads verified normally, reports the closed tunnel over the recorded pass,
  and leaves the other lanes and the application's condition alone.
- `tests/application/integration/deployment-records.test.ts` — phases come from
  the run the record's cited commands name; a cited message still wins; the
  newest run is the last resort only.

The three browser failures are stale selectors from an earlier UI generation
(`Select … caretaker` buttons and `.sg-record` both resolve to zero elements).
They fail identically with none of this branch's code present, which is how
they were established as pre-existing rather than assumed to be.

`tests/application/integration/terminal-transport.test.ts` fails to import in
this worktree because `node-pty` and `@types/ws` are declared in `package.json`
but absent from its `node_modules`. That is this checkout's install, not the
code; `npm ci` fixes it, and it was not run mid-session because the rig
symlinks the same `node_modules`.

## Limits

- **The provider answers are a stand-in's in the Shop run.** Cost, region and
  server type there are the rig's fiction; everything above the provider API is
  real. The Ghost run has no stand-in at all.
- **The first Ghost attempt was blocked** by the project's five-server limit
  (`403 resource_limit_exceeded`, confirmed against the API directly). The
  owner then instructed deletion of the old testing servers; all five went,
  with their primary IPs, and the run completed. Deletions are recorded in the
  development-cleanup inventory with a pre-deletion snapshot.
- **One application, one tier.** Shop is a five-container stack with a
  database, a cache, a worker and persistent files. Nothing here says anything
  about a heavier one.
- **Overview's no-map variant** still shows no way in at all when an access
  record exists without a topology. It claims nothing false; it just says
  nothing. Left alone.
- **Message prose is untouched.** Pi's replies contain ordinary markdown links
  to the private URL. A message is a historical statement and the product does
  not rewrite messages, so those stay live after the tunnel closes.
- **Owner acceptance is not claimed.** This is a verified candidate.

## Resources

Local Docker only, registered under owner `f67b220d-6d9e-4da0-bd08-5463e8406eb9`
in the development-cleanup inventory: the `sg-rig-return` host container, its
`sg-rig-ssh-2226` loopback endpoint, their two volumes, and the rig records
under the ignored `tests/results/rig/return/`. No paid resource was created.
