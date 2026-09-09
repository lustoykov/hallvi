# Single-instance runtime correctness review — 9 September 2026

Local implementation review, not an independent reviewer or CI approval. Base: merged PR #22 (`8cb7ad1`). Scope: recovery paths, constrained image/Compose execution, persistent volumes and shared operation evidence.

## Concrete findings fixed

1. **An HTTP 200 can still fail the intended behavior check.** Grafana exposed brittle JSON whitespace matching. Verification now also matches parsed/reserialized JSON; tests reject changed values and preserve whitespace inside string values. The actual failed attempt remains in History and the existing server was reconciled on retry.
2. **Recreation must not silently create empty replacement storage.** It verifies configuration hashes and requires every planned named volume to exist before issuing `up --force-recreate`. It uses neither image rebuild/pull nor volume deletion. A missing-volume regression test proves no replacement command runs.
3. **Every service must use the expected image.** Runtime inspection checks exactly one running instance per expected service and retained image identities. Inspection requests identity fields only, avoiding environment secrets in diagnostic buffers. Tests cover changed images and successful identity recording.
4. **Browser-local read marks cannot determine server-rendered HTML.** Real reload with persisted marks exposed a hydration mismatch. Marks are loaded after hydration, preserved rather than overwritten during initialization, and writes are tied to the loaded application identity. Reload was checked in the browser.
5. **Shared views must not omit additional containers.** Processes/Storage derive image services and mounts from the accepted plan; Architecture now includes the private services. SQLite descriptions state that persistent storage is not a backup. Image receipts distinguish the configuration revision from an upstream application's image identity.
6. **Provider claims must come from provider data.** The agent summary guessed a CX22 while the priced offer correctly selected CX23. Planning instructions now reserve machine type/capacity/price for the resolved provider offer. The approved and purchased host was CX23; no changed spending authority was inferred from summary prose.

## Boundaries reviewed

- Fresh provider access and price checks bind approval to the recommendation. An unknown purchase cannot be repeated just because lookup is empty. Owner-attested provider non-creation clears old authority and requires new approval.
- Unknown verification-object recovery requires a matching unique marker before DELETE. Cancellation cleanup is restricted to definitively uncreated setup.
- Public upstream repositories may be read without an installation, but that never grants write/publication authority. Requested refs resolve to immutable commits before planning.
- Main/auxiliary Docker Hub images are digest-resolved before approval. Config mounts are read-only and named volumes have distinct owners; this is not arbitrary Compose or privileged-host access.
- Admin setup HTTP can be restricted to the controller's observed IP. Grafana's generated secret was supplied through the local approval endpoint; acceptance API authentication traveled over pinned SSH. No admin secret was put in chat, command arguments, screenshots, Git or evidence JSON.
- Reconstruction and real application data checks are recorded in the [acceptance report](../testing/2026-09-09-single-instance-runtime.md).

## Remaining limits

No verified backups/restoration, HTTPS, safe version upgrade, BYOM proof or broad Compose compatibility is claimed. The legacy PostgreSQL path still selects a major-version tag initially and records its observed image identity; this slice pins the new main/auxiliary image path. General host drift reconciliation, volume deletion recovery and absent purchase confirmation still require explicit investigation. The owner asked us to leave CI running without using it as the current gate.
