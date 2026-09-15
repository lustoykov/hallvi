# Deployment release status

Deployment distinguishes the latest attempt from the last verified release. A failed update does not prove the previous containers are still running.

```mermaid
flowchart TD
  A[Latest deployment record] --> B{Latest is verified?}
  B -->|Yes| C[Show verified release]
  B -->|No| D[Show last verified release as historical]
  D --> E[Explain failed or unconfirmed update]
  E --> F[Check current state]
  G[Access record and current tunnel check] --> H[Open app or reopen access]
```

History shows meaningful events. Command output remains available for diagnosis. Navigation arrangements remain provisional pending owner selection.
