# Generalized backup acceptance — 10 September 2026

The candidate extends backup capture by data requirements, not by application names. The real trial uses the existing disposable Paperless 3.1.3 upgrade stack, deployment `10845059-eecd-4f3a-a4f0-c110e9c2de3e`, source revision `d48663e9ebaadc4b413a6ca3bc88cb5fbc4e468e`. Only synthetic documents and disposable credentials were used. Existing user applications were not changed.

The production capture-plan builder and Python runner ran on real Linux Docker volumes. Paperless and its Valkey broker paused; managed PostgreSQL stayed running for its dump. Broker capture explicitly uses `quiesced-files`, based on [Valkey's documented clean-shutdown persistence](https://valkey.io/topics/signals/). This is an acceptance declaration, not a production image-name condition.

## Capture and restore

The initial successful capture `0f27d6da-f543-4d1b-b48b-70c6f58ea59b` produced a 74,041-byte archive. The measured process pause was 46.7 seconds. Both paused services exited normally. The isolated restore verified archive identity/hash, 32 files, and 74 PostgreSQL tables containing 467 rows, and cleaned its disposable database resources.

That archive then booted a separate full Paperless stack, deployment `820ea014-e2ab-46c0-a0e3-54e29ee06d3c`, on loopback port 3281. Both original documents were searchable and their downloads retained these SHA-256 values:

- Document 1: `8248bfc859628a0b019879bd17a8b145418886a2bd065e57f3b6f51d7c081425`.
- Document 2: `1b765d17a66449017e7b4da0326d31c6fbff4fd751bb7d59843580e66b2cc7d3`.

A new PDF became document 3, completed asynchronous processing, was searchable, and downloaded with SHA-256 `0b942ff92add11c9f4162bedfb8c1263258bfe68f16a00bee006ad84d72d88ec`. This is functional application evidence beyond the scheduled runner's offline restore checks; the product UI does not automatically claim it.

After dependency-ordered sequential shutdown and reverse-order restart, final capture `3c4cc597-cb7f-42a2-ad10-44d6aaf99916` passed the same offline checks with 32 files, 74 tables and 471 rows, with an 8.7-second process pause. This is one observation, not a downtime guarantee. The full application restore above used the initial archive.

## Forced interruption

For final run `5985377e-8d8b-47b9-87fb-0857d6e1b5e7`, the acceptance operator killed the runner container with SIGKILL after its first service stop. The runner exited 137. Production recovery read the durable journal, restarted exactly one stopped service, marked the run interrupted, removed its staging, and reported `cleanupPending: false`. PostgreSQL and the broker were not restarted. The source application returned healthy.

The interruption uses an isolated state directory and the real `perform_recovery` function. It proves the journal/recovery path, not systemd's invocation of that path. Earlier acceptance attempts tried to send SIGKILL from namespace PID 1 to itself; Linux did not terminate that process. Those completed captures are not interruption evidence.

## Boundaries and reproducibility

The archive-transfer adapter copies locally; this trial does not prove R2/S3 transport, credentials or remote-host installation. Those existing mechanisms are unchanged. The full application restore and authenticated PDF checks run in ignored acceptance scripts, outside the current product verifier. This does not establish exactly-once queue delivery, every broker persistence configuration, or arbitrary database recovery.

Private scripts, archives and detailed receipts are under ignored `tests/results/generalized-protection/`; they contain disposable private configuration and are not committed. The repeatable committed tests live in `test_scheduled_backups.py`, `shared-storage-builds.test.ts` and `scheduled-backup-facts.test.ts`. Opus owns these tests; Codex reviews production and independently verifies the candidate. Final test results are recorded in the PR.

After verification, the disposable restored stack and its volumes were removed. The extra upgrade/capture source was stopped with its volumes retained. The original Paperless demo on port 3278 and the existing dashboard on port 3270 were left unchanged.
