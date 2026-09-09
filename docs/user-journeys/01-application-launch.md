# Launch an application

**Goal:** “Deploy this repository” or “Host this packaged application.” A prepared repository and preconfigured server are not prerequisites the user must supply. Current implementation limits live in [Roadmap](../../ROADMAP.md#current-state--9-september-2026).

1. Inspect the selected source or pinned upstream image/Compose, required services, startup commands, configuration and persistent state. Reuse what exists; identify unsupported requirements explicitly.
2. Recommend one suitable Hetzner host or adopt the user's machine. Explain size, cost and access/reachability assumptions; let the user override. Request only missing inputs and required authority.
3. Prepare deployment configuration and the host. Preserve existing data/workloads. Application-code changes use the narrow [operability PR boundary](../../PRODUCT.md#operating-boundary).
4. Execute the pinned deployment, showing progress and any decision inline in conversation. Required waits are real missing inputs or effects awaiting authority, not mandatory stages.
5. Verify the intended application behavior, public address/TLS where applicable, private service connections and persistence. Record what is actually serving and link evidence.
6. Surface remaining care work—unprotected files, missing backup verification or unavailable monitoring—without describing the application as fully protected merely because it responds.

An Application may have several processes on its single host; it need not have PostgreSQL or a queue. Packaged images do not require a user-owned GitHub repository or CI workflow. Home/private hosts need a verified reachability path appropriate to the intended use.

**Acceptance:** pinned identity, missing configuration/host preparation, rejected access, unsupported dependency, interruption/retry and useful external behavior. No duplicate purchase after an uncertain response. Switching/reloading conversations preserves progress, authority and drafts; other conversations reference the same operation. Container recreation retains intended persistent state. [Compatibility cases](../testing/self-hosted-compatibility.md) extend the existing source-app proof.
