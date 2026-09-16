# One development command, and what happens when the worker stops

`npm run dev` resolves the database, controller directory, Pi account directory
and diagnostics directory once, then hands the same values to all three
children. The worker stays its own process: it holds an exclusive lock and
drains the model adapter before releasing it, which a thread inside the web
server could not do.

```mermaid
flowchart TD
  A[npm run dev] --> B[Resolve database, controller dir,<br/>Pi account dir, diagnostics dir]
  B --> C[Next dev]
  B --> D[Drizzle Studio]
  B --> E[Pi worker: lock, then beat]
  E -->|exits: another worker holds the lock| F[Leave that worker alone]
  E -->|exits: first unexpected failure| G[Say so, start it once more]
  E -->|exits again| H[Stop the launcher's own children, exit non-zero]
  G --> E
```

The product reads the beat, not the lock. The lock file exists after any worker
has ever run, so its presence proves nothing; the worker writes its process id,
its machine and the time beside it and refreshes that time while it runs. A
reader believes a live worker only when the machine is this one, the process
still exists, and the last beat is recent.

```mermaid
flowchart LR
  A[Message accepted and queued] --> B{A worker beat recently,<br/>from a live process on this machine?}
  B -->|Yes| C[Show what the turn is doing]
  B -->|No| D[Say the message is waiting<br/>and nothing is running]
```

The [README's Run section](../../README.md#run) owns this decision; this page
is the picture of it.
