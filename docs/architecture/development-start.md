# One development command, and what happens when the worker stops

`npm run dev` resolves the database, controller directory, Pi account directory
and diagnostics directory once, then hands the same values to all three
children. The worker stays its own process: it alone owns Pi's sessions, and
the app reaches it over `worker.sock` beside the database.

```mermaid
flowchart TD
  A[npm run dev] --> B[Resolve database, controller dir,<br/>Pi account dir, diagnostics dir]
  B --> C[Next dev]
  B --> D[Drizzle Studio]
  B --> E[Pi worker: listen on worker.sock]
  E -->|exits: another worker already answers there| F[Leave that worker alone]
  E -->|exits: first unexpected failure| G[Say so, start it once more]
  E -->|exits again| H[Stop the launcher's own children, exit non-zero]
  G --> E
```

Whether a worker is there is whether it answers. A socket path nobody answers
was left by a worker that died, and the next one replaces it. There is no lock
file and no heartbeat.

```mermaid
flowchart LR
  A[Send] --> B{Does the worker answer?}
  B -->|Yes| C[Pi durably takes the message; then the send succeeds]
  B -->|No| D[The send fails and says so;<br/>the composer keeps the text]
```

The [README's Run section](../../README.md#run) owns this decision; this page
is the picture of it.
