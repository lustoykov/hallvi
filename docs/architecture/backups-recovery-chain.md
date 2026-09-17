# Backups: inspect a copy before recovery

The Backups page keeps the application’s data separate from Haldur’s own
recovery. Expand a stage to inspect the inventory, destination and retained
copies; expand recovery to choose a copy and draft a request.

```mermaid
flowchart TD
  A[Application backups] --> P[Plan: intended schedule and contents]
  A --> C[Copy: identity, date, destination and claimed contents]
  C --> R[Restore of that exact copy: recovered contents]
  C --> D[Select copy and recovery destination]
  R --> D
  D --> Q[Editable request in conversation]
  Q --> X[Replacing running data requires the requested confirmation]
  S[Haldur recovery] --> K[Separate records, credentials and recovery kit]
```

Restore results take precedence over a copy’s claimed contents. A restore
without an item list does not verify that list. Recovery requests name the
selected copy by identity and timestamp; choosing a mode does not run a restore.
