# Operate scheduled jobs, workers and queues

**Goal:** run the application's existing background work on its single host with useful control and evidence. This is not a Server Guy queue/workflow engine or a Drone CI integration.

A **schedule** triggers work at a specified time. A **queue** retains pending work. A **worker** consumes and executes it. For example, a nightly schedule can enqueue an import that a worker processes; many simple scheduled commands need no queue.

## Scheduled commands

For “Run `python -m app.jobs.expire_sessions` every night at 03:00 UTC,” inspect the actual command, deployed revision, configuration and existing scheduler first. The example is not a command the agent should invent in an unrelated repository.

1. Recommend the existing command, target, schedule/timezone and next run. Reuse an application-owned scheduler instead of installing a duplicate trigger.
2. Obtain missing inputs or effect-specific authority and configure a persistent host-side schedule. Authorizing that schedule does not authorize arbitrary future commands.
3. Distinguish “Scheduled” from “Ran successfully.” An immediate test needs authority for its side effects; an exit code alone may not establish the business outcome.
4. Share schedule, last/next run, duration, revision and linked output between chat and the appropriate view. Support Run now, Pause/Resume and schedule changes without creating duplicate triggers.

Prevent overlapping runs of the same command, including a scheduled trigger racing Run now. Record a skipped overlap, enforce a timeout and bound/redact output. Resolve the deployed revision at run start; preserve it in history. Pause prevents future starts, not silent termination of an in-flight command.

Do not automatically retry arbitrary side effects or replay all missed occurrences after downtime. Record known failure, missed or unknown outcome from evidence. Coordinate releases with running jobs and incompatible migrations. Host scheduling continues without an open chat, controller or model turn.

## Queues and background workers

Reuse the application's start commands, queue library, broker, environment and scheduler ownership. Supported targets include PostgreSQL-backed queues and Redis/Valkey when required. Adding a new queue implementation or business command is application coding work for the coding agent, not an operational shortcut.

- Verify web/worker version compatibility and private connectivity to the intended queue/database.
- Preserve appropriate broker persistence and retention; a cache eviction policy must not silently discard pending work. State protection is distinct from PostgreSQL backup coverage.
- Observe worker health/logs. Display queue depth, age and failures only where real integration provides them; an idle process does not prove a queue is stuck.
- Honor the library's shutdown, redelivery and retry behavior during releases. Do not add a second Server Guy retry loop or promise exactly-once effects.
- Keep payload/delivery state in the application queue. Server Guy stores configuration, observations and operational history.

Existing external queues can remain connected with a clear visibility/management boundary; they are not required merely because background work exists.

## Shared experience and acceptance

Fable determines grouping and layout. Distinguish schedules, queued work and worker processes without exposing empty infrastructure controls. Automatic executions record their job/system origin; failures create persistent issues linked to investigation. Routine successes remain in history. Backup schedules have one owner, not a second editable copy in a generic jobs view.

Prove scheduled success/failure/timeout, overlap, pause/resume, Run now, schedule replacement, controller downtime and release revision changes. For a supported queue combination, prove a processed job, worker interruption/restart and a failing job with the actual library's retry behavior. Preserve uncertainty and history across restart.

Examples of existing machinery: [Graphile Worker](https://worker.graphile.org/), [BullMQ production guidance](https://docs.bullmq.io/guide/going-to-production) and [Celery brokers](https://docs.celeryq.dev/en/stable/getting-started/backends-and-brokers/). These are references, not a universal compatibility claim. [Roadmap](../../ROADMAP.md) owns delivery order.
