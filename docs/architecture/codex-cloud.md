# Codex cloud development

The ordinary coding environment carries no provider credentials. Setup secrets
must not be copied into the agent's cached filesystem. Live provider verification
requires an explicit credential and execution configuration beyond this setup.

```mermaid
flowchart LR
    Repo[Repository default branch] --> Setup[Setup: Node 22, npm ci, Chromium, SQLite]
    Setup --> Cache[Cached dependencies]
    Cache --> Maintenance[Task branch maintenance]
    Maintenance --> Agent[Cloud coding agent]
    Agent --> Checks[Code, application tests, build, browser smoke]
    Checks --> PR[Pull request and test evidence]
    Secrets[Optional setup secrets] -. Setup only; no file persistence .-> Setup
    PR --> Verifier[Separate live deployment verifier]
    Verifier --> Providers[Scoped provider credentials and reachable server]
```

Maintenance handles changed dependencies and database schema. The cloud checks
establish application behavior with synthetic provider responses; the live
verifier establishes deployment behavior against real infrastructure.
