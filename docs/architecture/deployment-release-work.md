# Deployment: what a release is allowed to say

Deployment is one list of releases, newest first, with what is serving named
once above it. A release opens on its own facts and on the commands that
produced it. Two rules decide what may appear there.

```mermaid
flowchart TD
  L[Release record] --> E{Does it cite its own commands?}
  E -->|"message run or execution ids"| W[Show that run, in order]
  E -->|"nothing cited"| N[Say no command is linked. Never fall back to the newest run]
  W --> M[Machine is a fact on each command, never a filter over the page]
  W --> O[One output pane per release, for whichever step is picked]
  W --> F{Any command failed or was interrupted?}
  F -->|yes| S["Row says a command in it failed, beside what the checks established"]
  F -->|no| Q[Row says only what the checks established]
  C[Release checks] --> Q
  C --> S
  T{Command has an end time?} --> |yes| D[Show how long it took]
  T --> |no, and it is running| G[Still running]
  T --> |no, and it finished| H[No end time recorded]
```

A release's checks and the commands inside it answer different questions, and
the row carries both rather than letting either stand for the other. A missing
field is not a state: a command with no end time has no duration on record,
which is not the same as one that is still going.
