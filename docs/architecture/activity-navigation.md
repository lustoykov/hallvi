# Activity navigation

The owner selected N4: keep History and Command output accessible under an
Activity disclosure below the main destinations. Preserve their existing routes,
text size and hit targets.

```mermaid
flowchart TD
    A[Application sidebar] --> B[Primary application destinations]
    A --> C[Activity: closed on arrival]
    C --> D[History: existing history hash]
    C --> E[Command output: existing logs hash]
    F[Open a History or Command output link] --> G[Activity opens and child is selected]
    G --> H[User collapses Activity]
    H --> I[Activity retains active styling]
```

This changes navigation placement only. The six comparison prototypes remain
separate, and the selected Deployment, Backups and terminal treatments are not
bundled into this change.
