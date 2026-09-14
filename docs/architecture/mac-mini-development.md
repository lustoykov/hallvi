# Remote development host

Use native Codex remote connections to keep development compute on the Mac Mini.
The desktop app on the Mini is retained for desktop capabilities. SSH-only
execution remains available when a task needs only files, shell and coding tools.

```mermaid
flowchart LR
    UI[Owner's local Codex app] -->|Native remote connection| MINI[Mac Mini Codex]
    MINI --> WORK[Isolated project worktrees]
    MINI --> TOOLS[Mini's plugins and browser tools]
    WORK -->|SSH and HTTPS| DEV[Existing development infrastructure]
    SKILLS[Local standalone skills] -->|On-demand rsync over SSH| MINI
```

No managed-cloud proxy, relay or application transport adapter is involved.
[Remote development](../development/mac-mini.md) owns setup and verified limits.
