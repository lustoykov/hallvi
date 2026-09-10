# Reconcile a disconnected release before repeating it

A lost SSH reply cannot establish whether a release command stopped. Every new release command now writes an atomic result file in its private attempt directory on the host, before returning its final reply. The file identifies the attempt, immutable release, source revision, final execution phase and exit code.

Pi's `reconcile_release` tool reads the matching result while holding the same non-blocking Linux deployment lock used by execution. If that lock is busy, the result is missing or malformed, or the identity differs, replacement remains blocked. The existence of a running container or old health check cannot bypass this requirement. Older attempts without a result file still require investigation; missing evidence is not manufactured.

A known failed command returns its final phase and allows Pi to inspect diagnostics and correct configuration within the original scope and remaining execution budget. A completed replacement runs fresh image, readiness and application checks without building or restarting containers. Successful verification completes the task. Unknown verification test-object creation remains blocked; reconciliation never guesses an object identity or blindly repeats its creation.

The original failed/interrupted attempt remains immutable. Reconciliation appends a timestamped observation of the host result and, when checking a completed replacement, a separate verification attempt linked to the original. Historical verification is retained until new behavior checks pass. A restarted worker can reach inspection and reconciliation through the existing explicitly authorized retry operation; it cannot silently acquire a new scope or clear uncertainty by restarting.

## Evidence

The application suite covers lost successful replies, immutable failed attempts and reconciliation observations, known failed commands followed by scoped correction, explicitly retried operations, and refusal to execute with busy, missing or mismatched result evidence. A scripted Pi session accepts successful reconciliation as completion and does not call the executor again.

The opt-in Docker proof covers the single-build SQLite app and the separately built web/worker app with shared volumes. The transport deliberately drops a successful execution reply after the host writes its result. Reconciliation verifies the new revision and retained data, while asserting unchanged container IDs and no additional build/replacement execution. A separate Linux container test holds the actual `flock` while a result file already exists: a competing read fails until the lock holder exits.

Run with `SG_RUN_DOCKER_PROOF=1 npm test -- tests/application/integration/release-docker.test.ts`.

This proves the bounded protocol using local Docker, a substituted SSH transport, and Linux lock semantics. It does not prove a real network partition, a killed remote Docker daemon, controller-machine disaster recovery, arbitrary migration recovery, automatic rollback or a live model's diagnostic judgment. A missing host receipt or unresolved verification object still needs further investigation. No live application was updated for these tests.
