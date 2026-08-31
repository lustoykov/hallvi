# Reference applications

Status: workshop fixtures. These are test subjects for Server Guy, not part of
the product.

Two small todo services exist as launch targets, one for each first-profile
direction named in [`PRODUCT-WORKSHOP-NOTES.md`](../PRODUCT-WORKSHOP-NOTES.md):

| Repository | Application Profile | Conformance |
| --- | --- | --- |
| [`lustoykov/todo-nextjs`](https://github.com/lustoykov/todo-nextjs) | Next.js + PostgreSQL | Conformant |
| [`lustoykov/todo-fastapi`](https://github.com/lustoykov/todo-fastapi) | FastAPI + uv + PostgreSQL | Deliberately non-conformant |

Each is its own private repository, because Application Launch begins with the
engineer selecting **a repository**. A directory inside a product monorepo
would not exercise that.

## Why two states rather than two clean applications

A pair of conformant repositories exercises phases 1–2 and 4–9 but leaves
**Phase 3, Make launch-ready**, with nothing to do. Its Phase Deliverable — a
**Conformance Result**, meaning one exact eligible revision with evidence that
every required profile check passes for it — cannot be demonstrated against a
repository that already passes.

So `todo-fastapi` carries real gaps. It works, it is not badly written, and it
looks like an ordinary application repository. What it lacks is the operational
surface the Application Contract asks for.

**The FastAPI repository contains no marker of this.** Its README, its commit
message, and its code read as an ordinary small application, which is the whole
point: profile resolution and gap discovery have to come from inspecting it.
This file is the answer key, and it lives here rather than there.

## The same application twice

Both services expose the same domain and the same successful HTTP API, so
differences between them are always operational rather than functional.

- one entity, `todos`: id, title, notes, completed, created_at, updated_at,
  completed_at
- `GET /api/todos?status=all|active|completed`, `POST /api/todos`,
  `GET|PATCH|DELETE /api/todos/{id}`
- snake_case JSON, RFC 3339 timestamps, `{"todo": …}` and `{"todos": […]}`
  envelopes
- `completed_at` derived from the `completed` transition, never accepted from
  the client
- the same small web UI

## Contract coverage

Contract concerns are those listed in
[`PRODUCT-WORKSHOP-NOTES.md`](../PRODUCT-WORKSHOP-NOTES.md#application-contracts-and-profiles).

| Concern | `todo-nextjs` | `todo-fastapi` |
| --- | --- | --- |
| Build entry point | `npm run build`, needs no database or secrets | `uv sync`, not declared as a build step |
| Runtime entry point | `npm start`, binds `PORT` | only a reload dev server is documented |
| Migration entry point | `npm run migrate`, separate operation | none — DDL runs at import |
| Liveness | `GET /healthz`, touches no dependency | absent |
| Readiness | `GET /readyz`, bounded database check, 503 names the failure | absent |
| Release identity | `GET /api/version` | absent |
| Configuration | validated at start, process refuses to run when invalid | read ad hoc, never validated |
| Secrets | `DATABASE_URL` only, never defaulted | hardcoded fallback with credentials in source |
| Structured logs | one JSON record per line, service + revision + request id | `print()` and default access logs |
| Persistence | PostgreSQL, versioned migration history | PostgreSQL, no history |
| Backup surface | nothing written to local disk | nothing written to local disk |
| Telemetry | not instrumented (open for both) | not instrumented |
| Verification | `scripts/smoke.sh <url>`, 15 external checks | none |

Telemetry is unresolved for both. It is a genuine open product question, not a
planted gap.

## `todo-fastapi` gaps, and what closing each one means

Ordered roughly by how early a launch would hit them.

1. **Configuration is never validated, and `DATABASE_URL` has a hardcoded
   fallback carrying credentials** (`app/database.py`). A process with no
   configuration starts anyway and quietly points at a developer's machine.
   *Closing it:* require the variable, validate at start, fail loudly with the
   offending names. Never default a secret.

2. **The schema is created at import** — `Base.metadata.create_all(bind=engine)`
   in `app/main.py`. There is no migration history, no way to review a schema
   change, and concurrent workers race on boot.
   *Closing it:* adopt Alembic, remove `create_all`, and expose migrations as
   their own operation that never runs on application start.

3. **No liveness or readiness endpoint.** Nothing can be probed, so an external
   sentinel has nothing to observe and no Exit Gate can be satisfied by
   evidence.
   *Closing it:* liveness that touches no dependency, readiness that bounds a
   database check and names the failing dependency in its body.

4. **No release identity.** A running instance cannot be matched to a revision,
   so "this Release is live" cannot be evidenced, only asserted.
   *Closing it:* a version endpoint reporting revision and environment.

5. **`print()` for logging.** Records are unstructured and unparseable, and
   carry no service, revision, or request identity.
   *Closing it:* one JSON object per line on stdout.

6. **No dependency lock committed** — `uv.lock` is gitignored. Two builds of the
   same commit can resolve different dependency versions, so a revision does not
   determine an artifact.
   *Closing it:* commit the lock.

7. **No verification.** No tests, no smoke script. Nothing external can
   distinguish "the process started" from "the application works".
   *Closing it:* a verification script exercising health and the full lifecycle
   against a base URL.

8. **No declared production runtime entry point.** The README documents
   `uvicorn --reload` only, which binds loopback and is not a serving
   configuration.
   *Closing it:* declare the run entry point, its bind address, and its worker
   model.

9. **No graceful shutdown, and the engine is created at import with default
   pool settings.** A deploy drops in-flight requests, and pool sizing is
   accidental.
   *Closing it:* close the pool on `SIGTERM`; size it deliberately.

10. **Timestamps render in the database session's timezone.** A freshly created
    todo serializes as `…Z`; the same row read back serializes as `…+03:00`.
    Same instant, two representations, from one field.
    *Closing it:* pin the session to UTC, or normalize on serialization.

11. **Error responses use FastAPI's default `{"detail": …}` envelope**, malformed
    JSON returns 422 rather than 400, and no request id is returned.
    *Closing it:* a uniform error envelope with a stable code, and a request id
    on every response and matching log line.

## Running them

Both need a reachable PostgreSQL. Each repository's README covers the rest.

```bash
# todo-nextjs
npm install && npm run migrate && npm run build && npm start
scripts/smoke.sh http://localhost:3000

# todo-fastapi
uv sync && uv run uvicorn app.main:app --reload
```

## What neither repository contains

No Dockerfile, no compose file, no process supervisor configuration, no nginx
configuration, no provisioning scripts, no TLS handling, no backup schedule.

Docker-based packaging is listed under Server Guy's own infrastructure
direction, not among the things an application must declare. An application that
ships its packaging has already answered the question Server Guy exists to
answer, and both fixtures would stop testing it.
