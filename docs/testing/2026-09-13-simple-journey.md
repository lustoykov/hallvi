# The simple deployment journey, end to end — 13 September 2026

Docker's Getting Started app, from an empty workspace to a working todo list
opened through Server Guy's own access link. Run on the local rig, which is
free and isolated; the accepted Hetzner deployment was not touched.

Views delivered in [#63](https://github.com/lustoykov/server-guy/pull/63);
the rig support that made the last step possible in
[#64](https://github.com/lustoykov/server-guy/pull/64).

## Result: pass

| Step | Result |
| --- | --- |
| Add application through the UI, repository `docker/getting-started-app` | **pass** |
| Pi inspects the source and states what it needs | **pass** — port 3000, SQLite at `/etc/todos/todo.db`, so a persistent path and a loopback-only port |
| Provider catalog, pricing, server creation | **pass** (simulated provider) — CX23 in Helsinki, €5.49 + €0.50 = €5.99/month |
| Host key scanned and pinned, SSH verified | **pass** (real SSH) |
| Deploy, verify, restart test | **pass** — container healthy, SQLite survived |
| Private tunnel opened by the product | **pass** (real SSH forward) — `http://127.0.0.1:13000` |
| Open and use the application through that link | **pass** — page loads, todo created, earlier todo still present |
| Records the views need, written without being asked | **pass** — see below |
| Access stays private to the controller | **pass** — bound to `127.0.0.1:3000` on the host; no public port |

## What is real and what is simulated

| Real | Simulated |
| --- | --- |
| The product: app, worker, records, Pi runtime, executor, tunnel code | The provider API — catalog, create, pricing, firewalls |
| SSH transport, host-key scan and pinning, key authentication, port forwarding | The server's address (TEST-NET-1, not routable) |
| Docker Engine, systemd, host paths, the deployed container and its volume | — |
| GitHub source at an exact mirrored revision, `6b025fc53bc7` | — |
| The model, its tool calls and everything it wrote | — |

## Records the normal flow produced

No corrective "document the topology" turn, and nothing seeded by hand.

| Record | Carries |
| --- | --- |
| Server SSH access is verified | `states: host` · 7 facts · 2 checks |
| Getting Started was deployed in a hardened container | `deployment` content |
| Getting Started is healthy on the server | `topology` content **and** `states: application` |
| SQLite data survives application restarts | `states: volume` |
| Application ingress is restricted to server loopback | `states: door` |
| Private browser access is ready on this PC | `application-access`, `states: access`, url |
| Production dependencies need security updates | recommendation |

Pi used the declared keys — `revision`, `image`, `port`, `http`, `container`
— because they are now in its guidance. The topology it drew is five parts
and three edges, with `loopback` from host to application and `disk` from
application to its data.

**An earlier attempt recorded the tunnel's failure honestly** — "Private
browser tunnel could not be opened", `states: access` — rather than
inventing a URL. That record is the reason the failure was visible.

## Functional proof of the application

Through the product's link, `http://127.0.0.1:13000`:

```
create  → {"id":"dbc686c4…","name":"Opus overnight check","completed":false}
change  → completed: true
restart → getting-started-app Up 12 seconds (healthy)
after   → [{"id":"dbc686c4…","completed":true}]      data survived
via link→ {"id":"ab2fca59…","name":"Created through the product link"}
```

The browser shows both items, one struck through.

## What the rig needed, and what it did not

Four drifts fixed so the rig runs current code: the Hetzner stand-in's
signature, a missing `/pricing` route, a loopback public address Pi rightly
refused, and a missing `ssh-keyscan`.

Then the real change: an **actual sshd** in the isolated host container,
published on loopback, with the controller's own per-application key
installed the way a provider would. The shims stop emulating and execute the
real client, so host-key pinning, key authentication and the `-L` forward are
the product's own. **No product security behaviour was changed and no URL was
forwarded by hand.**

## Not proved

- **Grafana + Prometheus** — the multi-service journey has not been run.
- **A real provider host.** Everything above the provider API is real; server
  creation and the address are the stand-in's.
- **The public path.** This deployment is private by design; nothing here
  says anything about HTTPS, domains or public ingress.
- **Backups.** No `backup-plan` content exists, so the Backups lane reads
  "not assessed" and can read nothing else until that lands.

## A gap the multi-service example exposed

**There is no supported way for the owner to hand Pi a secret.**

The Grafana example needs a private `GF_SECURITY_ADMIN_PASSWORD` and says
not to use a published default. Pi's guidance forbids the two wrong answers
— "never ask the user to paste secrets into chat", "never save secrets" —
and `redactSecrets` scrubs anything that leaks into output. But the flow that
used to carry a private value, the operation decision with private inputs,
was deleted with the old workflow machinery in
[#55](https://github.com/lustoykov/server-guy/pull/55), and nothing replaced
it.

So today the only ways to get a credential onto a host are the two the
product tells Pi not to use. For this run Pi generated the password itself
and set it as container configuration without recording it, which is
defensible for a disposable fixture and is not an answer for a real
application: the owner then cannot log in to their own Grafana.

This is a product gap, not a rig one, and it wants a design decision rather
than an overnight implementation — where a supplied value is held, how it
reaches the host, whether it is write-only, and what the views say about a
value they must never show. Left for review.

## Grafana and Prometheus — passes

The multi-service example, on a second isolated host. Every acceptance check
in its README, verified directly rather than taken from Pi's report:

| Check | Result |
| --- | --- |
| Grafana `/api/health` | `database: ok`, 13.2.1 |
| Grafana `/login` through the tunnel | 200 |
| Prometheus `/-/ready` | ready, reachable only from the app container |
| `up` after the first scrape | `success`, value `"1"` |
| Grafana queries the provisioned datasource | succeeds |
| Dashboard and metrics across container recreation | both survived |
| Prometheus published port | none; from this PC, `000` |
| Grafana binding | `127.0.0.1:3000` only |
| Images | both pinned to immutable amd64 digests |

Eight records, and the multi-service shape came out without prompting:
`topology` with the application's health, an access record, **two `door`
records** — Grafana loopback-only, Prometheus unpublished — and **two
`volume` records**. Architecture draws both services inside a "Private
network · no ports open" box, the connection between them, and both volumes
in the disk zone.

### What it exposed

**A deployment record cannot describe two services.** `deployment` content
carries one `image`, so Pi recorded Prometheus's digest for a deployment
whose application is Grafana, and nothing on record says which image each
service runs. Topology names the parts; no record gives them their images.
The smallest honest fix is for Pi to record each service as a `process`
subject with its own `image` fact — the vocabulary already allows it and the
guidance does not yet ask for it. Not changed here: it is a write-contract
decision.

**A digest is not a version.** Deployment's headline read the text after the
last colon, which is a tag for `name:tag` and a bare 64-character hash for a
digest-pinned reference. Fixed: the name carries the line and the digest sits
in the rows underneath.

## The same journey on real Hetzner hardware — passes

The owner authorised buying a server, which closed the last gap: everything
above is real except the provider, and this run has no stand-in at all. The
`:3397` preview with a normal PATH — no rig, no shims — against a genuine
Hetzner host.

| Step | Result |
| --- | --- |
| Catalog and cost | **pass** — asked for the cheapest, Pi found `cx22` retired after 2025-12-31 and chose `cx23`, which the availability API confirms is the cheapest type still purchasable in hel1 |
| Exactly one server created | **pass** — `real-host-proof-38e37237` (165658707); the accepted deployment and the other server untouched |
| Host key scanned and pinned, SSH verified | **pass** — system `ssh`, real host |
| Deploy, non-root container, host-mounted SQLite | **pass** |
| Restart persistence | **pass** |
| Private tunnel and use | **pass** — `http://127.0.0.1:18080` returned 200 and took a new item |
| Public port refused | **pass** — `http://204.168.248.155:3000` does not answer |
| Cost | €5.49 server + €0.50 IPv4 = **€5.99/month ≈ €0.008/hour** |

Seven records, the fullest set of the three runs, and the only one to include
a `process` subject:

| Record | Carries |
| --- | --- |
| A private-deployment host is ready on Hetzner | `states: host` |
| Revision 6b025fc5 is deployed in a hardened container | `deployment` |
| The application is healthy through private access | `topology` + `states: application` |
| The application opens privately through this PC | `application-access` + `states: access` |
| SQLite data persists across container restarts | `states: volume` |
| Application port 3000 accepts only loopback traffic | `states: door` |
| The web container is healthy and restart-managed | `states: process` |

Pi also volunteered what it had not done: "SQLite is persistent but not yet
backed up."

## Resources left running

- `sg-rig-opus` — the host container, with `getting-started-app` deployed and
  MinIO; sshd published on `127.0.0.1:2222` via `sg-rig-ssh-2222`.
- Rig apps: `opus2` on :3399, `opus3` on :3401 (the one with the open tunnel).
- The tunnel itself: `http://127.0.0.1:13000`, held by an SSH master the
  product started.
- Previews: :3396, :3397. The reference on :3370 is untouched.
