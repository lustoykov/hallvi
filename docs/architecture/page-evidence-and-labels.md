# What a page may print, and where it may print it

Two defects the integrated pass found, and the rule each one broke.

```mermaid
flowchart TD
  A[A record's field] --> B{Is it a sentence somebody wrote?}
  B -->|"yes, Pi's own detail"| C[Print it as what rests on the claim]
  B -->|"no, it is the check's key"| D["Print nothing. 'open' is our bookkeeping, not a finding"]
  B -->|"no field at all"| E[Say nobody has checked]
  F[A label in a fixed column] --> G{Does it fit the column?}
  G -->|yes| H[Print it]
  G -->|"no, and Processes puts a hostname there"| I[Wrap inside the column]
  I --> J[Never paint across the value beside it]
```

A check named `open` is the name of a check. Printing it under "What that
rests on" tells a reader what our records call the thing rather than what
anyone found out about their server, which is the same defect as "checked,
with no detail recorded" in fewer words.

A fixed label column is fine until a page puts a service name in it.
`Registry.example.com` is 125px wide in a 76px column, and with visible
overflow it painted straight across the value beside it.
