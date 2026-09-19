# Who owns a conversation's lifecycle

Owned by [Interaction while Pi is busy](../operator-design.md#interaction-while-pi-is-busy).

## Before: Hallvi ran a request at a time

```mermaid
flowchart LR
  API[API] --> Rows[(Message + pre-allocated reply row)]
  Rows --> Claim[Hallvi claim loop: one running reply for the whole controller]
  Claim --> Run[Per-request Pi session: open, prompt, dispose]
  Run --> Rows
  Claim -. FIFO, retry links, Stop cascade, restart replay rules .-> Rows
```

Hallvi decided when every message ran, kept its own queue, linked retries,
and opened and closed a Pi session around each request. An approval in one
application held up every other.

## After: Pi's lane runs the conversation

```mermaid
flowchart LR
  API[API] --> Rows[(Durable accepted message)]
  Rows -->|hand over, tagged with its id| Lane[Pi AgentLane per conversation]
  Lane -->|acknowledgment: entry id| Rows
  Lane --> Pi[Pi owns: identity, queue order, steer boundary, cancellation, abort, retry, compaction, restoration after restart]
  Pi -->|events| Records[(Replies, activity, executions, approvals)]
  Gate[Worker: one writer; one conversation per application and per server address] --> Lane
  Tools[Hallvi: workspace, deployment tools, permissions, evidence] --> Lane
  Runtime[Pi ModelRuntime: credentials, refresh, models] --> Lane
```

Hallvi keeps the durable intake from the API to the process that owns the
session, the acknowledgment that Pi has taken a message, the rule for whether
a conversation may start, and everything the product records. It reconciles
with Pi in exactly one place: when a conversation is opened, it asks Pi what
it already holds.
