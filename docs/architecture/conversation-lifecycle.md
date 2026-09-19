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

## Then: Pi's lane ran it, and Hallvi kept a second record

```mermaid
flowchart LR
  API[API] --> Rows[(Durable accepted message)]
  Rows -->|hand over, tagged with its id| Lane[Pi AgentLane per conversation]
  Lane -->|acknowledgment: entry id| Rows
  Lane -->|events| Records[(Reply rows, status, activity, executions)]
  Gate[Worker lock, application lock, one conversation per application and server] --> Lane
```

Pi owned the queue and the run, but Hallvi still held every message until Pi
acknowledged it, kept its own reply rows and status beside Pi's history, and
reconciled the two when a conversation was opened.

## Now: Pi keeps the conversation, and the worker owns Pi's sessions

```mermaid
flowchart LR
  Page[Page] --> App[App]
  App -->|worker.sock: send, continue, stop, read, forget| Worker[Worker: sole owner]
  Worker -->|accept, followUp, steer, resume, abort| Lane[Pi AgentLane per conversation]
  Lane --> Pi[Pi owns: messages, history, queue order, steer boundary, abort, retry, compaction, restoration]
  Pi -->|tool call, with Pi's id| Tools[Hallvi: permission, approval, workspace, deployment tools]
  Tools --> Evidence[(Evidence under Pi's tool-call id)]
  Lane -->|branch + snapshot| Read[Transcript projected on read]
  Evidence --> Read --> App
  Runtime[Pi ModelRuntime: credentials, refresh, models] --> Lane
```

A send is answered once Pi has durably taken the message, and fails visibly
otherwise. There is no intake queue, no reply row, no stored status, no
reconciliation and no lock: one process owns the sessions because only it is
asked, and what the page shows is read from Pi each time. Hallvi keeps what
is the product's own: permissions, approvals and execution evidence, each
record under the id Pi gave the tool call.
