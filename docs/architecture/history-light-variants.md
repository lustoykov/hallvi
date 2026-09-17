# History light variants

The prototype keeps the shipped Transit History as the frame. One invented,
in-memory timeline is projected into the same operations and rows, then each
variant adds one independently removable reading aid.

```mermaid
flowchart LR
  T[Invented records and executions] --> P[Shipped History projection]
  P --> L[Shipped day rail and event line]
  L --> A[A: fold rows by explicit Pi run]
  L --> B[B: add a seven-day outcome strip]
  L --> C[C: annotate recorded before and after values]
  A --> E[Original rows remain inside Evidence]
  B --> S[Select a day to scroll the same line]
  C --> F[Changes-only lens hides inspections]
```

Decision boundary: a task exists only when a record names execution evidence
whose `runId` identifies that Pi run. Timestamp proximity never creates
attribution. The strip and change lens read the same projected facts; they do
not create new records or mutate application state.
