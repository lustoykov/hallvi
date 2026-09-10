# Domain language

Definitions used by the [product](PRODUCT.md), [architecture](docs/architecture/agent-directed-operations.md) and code. This glossary does not schedule implementation or claim that every concept has a dedicated database table.

## Application and collaboration

**Application**: One independently named deployment of a software stack, with configuration, host, releases, conversations and operational history. Deploying the same source independently creates another Application.

**Stack**: The services, worker processes, schedules, private connections and persistent state required by one Application on one instance.

**Conversation (Chat in existing code)**: An application-owned transcript and native model session. Conversations have separate drafts/history and share the application's operational state.

**Application view**: An inspectable projection of recorded application facts and work, such as deployment, data or health. Chat receipts and views refer to the same records.

**Operation receipt**: The interactive presentation of an operation's origin, progress, required decision, evidence and outcome. A receipt is not a second copy of execution state.

**Pi Run**: One durable attempt to answer an accepted conversation message using the embedded Pi runtime. Retry creates a linked attempt; a successful reply does not prove an external effect.

## Execution and evidence

**Operation**: Application-owned work with a target, origin, state and evidence, shared by every conversation and view.

**Change**: An operation that modifies the application or its surroundings. Only one change executes at a time for an Application.

**Inspection**: An operation that reads evidence without changing the application. Inspections can run alongside changes.

**Queued change**: An approved operation waiting for an earlier change. Its assumptions must still hold when execution begins; changed assumptions require a new decision.

**Cancelled operation**: A proposal or stopped attempt the user chose not to continue. Its record remains part of the application's history.

**Unknown remote outcome**: An attempted external action whose result has not been established. A stopped controller does not establish that the external action stopped.

**Observation**: A timestamped fact attributed to its source, such as a probe result, command output, metric sample or provider response.

**Finding / diagnosis**: The agent's interpretation of observations, including uncertainty and possible cause. It remains distinguishable from the observations themselves.

**Decision**: An explicit application-specific user requirement or choice, saved with its origin. A replacement supersedes the earlier decision without erasing history.

**Authority**: The permitted target, effects and limits for an action, including required user approval. A model recommendation or available credential does not widen it.

**Activity event**: A meaningful application change or consequential operational result. It is not every message or internal tool call.

**Evidence packet**: A bounded, redacted bundle of application/revision identity, observations, impact and a verification target that an owner or coding agent can use.

## Hosting and releases

**Deployment host**: The user-controlled Linux instance running an application's stack, provisioned through Hetzner or adopted through BYOM.

**Controller**: The Server Guy web/worker installation coordinating work and retaining product records. It can be on the application host or a separate machine.

**Release**: A selected immutable source/image identity and deployment configuration intended to run for an Application.

**Deployment attempt**: One execution to put a specific release onto an application host and verify it. A retry or container recreation is another attempt, even when its release and host stay the same.

**Last verified runtime**: The release, host and running images established by a completed verification at a recorded time. A later possible remote change makes the current runtime unknown without erasing this historical observation.

**Operability change**: A change needed to run or check the application, such as its start entrypoint or environment-driven port. Application-code changes in this category require an owner-merged PR.

**Service role**: The responsibility of a running component within a stack: serving HTTP, consuming background work, brokering work, or providing another private service. A role does not prove health or behavior.

## Background work and protection

**Scheduled job**: An existing application command triggered at specified times with a timezone. A recorded schedule is not evidence that a run succeeded.

**Queue**: Application-owned storage of pending work, implemented by the existing queue library and PostgreSQL or a supported broker.

**Worker**: An application process consuming queued work. Its health and logs are observable independently from the web service; the library owns delivery and retries.

**Backup**: A consistent recoverable copy of specified application or controller state. Creation, off-host transfer and restore verification are separate outcomes.

**Recovery point**: The state/time represented by a particular usable backup. It is not the last time the backup schedule was edited.

**Diagnostic archive**: Retained logs, samples and check results copied off-host. It preserves evidence, not application recovery data or guaranteed live monitoring.

**Issue**: A persistent observed problem with evidence and a next action. A notification delivers attention to an issue; reading it does not resolve the problem.

## Legacy and optional terms

**Phase Workspace / Gate Check / Application Contract / Conformance Result**: Existing preparation records and prerequisite checks retained during migration. They do not mandate user-facing stages or phase-owned conversations; detailed schemas remain in the archived implementation references.

**Plugin**: The reserved term for an optional future extension with UI and authorized behavior. Plugin implementation is deferred; built-in views do not depend on it.
