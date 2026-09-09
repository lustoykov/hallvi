# Operate a single-instance application stack

Status: accepted; updated 9 September 2026. Supersedes the earlier broad Coolify parity and multi-host expansion assumptions.

Server Guy operates software on a user-controlled Linux instance through Docker Compose. One Application can include several services, workers, schedules and dependencies on that instance. Hetzner provisioning and BYOM are the initial compute paths; PostgreSQL/SQLite and required Redis/Valkey define the selected database/broker scope.

This boundary concentrates deployment, protection and care instead of building another general hosting platform. Coolify is a reference, not a parity contract. Managed application platforms and multi-host application/database orchestration are outside the current direction; a separate controller and off-host backups do not change the stack's topology.

Server Guy prepares repository and host within authority. It operates surroundings; application-code proposals are only small operability PRs the owner merges. [Product](../../PRODUCT.md) owns the full boundary and [architecture](../architecture/agent-directed-operations.md) its consequences.
