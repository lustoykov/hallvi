# Select tests by the behavior they protect

```mermaid
flowchart TD
  A[Proposed or existing test] --> B{Protects an important current behavior?}
  B -->|No| C[Remove or skip]
  B -->|Yes| D{Adds useful confidence beyond existing checks?}
  D -->|No| E[Consolidate or remove duplication]
  D -->|Yes| F[Keep the smallest useful check]
```

Use the [testing guideline](../../tests/README.md#the-8020-bar). An uncertain
judgment about the only coverage of an important behavior deserves one concrete
owner question, not a new testing framework.
