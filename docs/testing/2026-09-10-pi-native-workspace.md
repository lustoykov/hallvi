# Native Pi tools and the first Compose comparison

10 September 2026. This change enables native workspace tools; it does not replace the deployment executor or generalize live verification. The [design](../architecture/requirements-driven-deployment.md) describes that subsequent work.

## What changed

Pi now receives the SDK's own `read`, `write`, `edit`, `bash`, `powershell`, `grep`, `find` and `ls` implementations in conversation and deployment-planning sessions. Registration is common across legacy phases. The native schemas, argument repair and execution metadata are retained; no controller-local built-in is used as a fallback.

One lazily created Linux container and writable filesystem serve a Pi run. It receives the selected repository snapshot, excluding recognized credential paths and redacting recognized inline credentials. An explicit manifest distinguishes a complete selected snapshot, unavailable source and scratch space. Existing complete-archive limits still apply: a large or unsupported repository archive may remain unavailable, and the existing repository-reading tools remain available. This is not a new build-source acceptance policy.

The runtime includes Node, Python, Bash, PowerShell, git, search utilities and the pinned [Docker Compose 2.40.3 CLI](https://github.com/docker/compose/releases/tag/v2.40.3). Native Compose configuration validation works without a Docker daemon. Linux PowerShell uses the SDK's supported execution hook; the remaining native tools run directly through the SDK. Pi's own binary installer prepares `fd` while building the image so runtime search does not depend on downloading a binary.

The workspace has no external network, controller files, credentials or Docker socket. Its root filesystem is read-only; a private 256 MiB tmpfs volume and 128 MiB temporary filesystem are writable. CPU, memory, process, output and command-time limits bound one run. This initial execution environment cannot install dependencies from the internet, inspect a remote private service, or deploy a stack through its shell. Those are explicit access/capability gaps to address in following slices, not permanent restrictions on Pi's reasoning. Existing managed deployment/backup/rollback tools remain available.

Tool calls are serialized within the workspace. Docker exec receives input through stdin, including files larger than the operating system's single-argument limit. Cancellation or an uncertain tool transport outcome ends the owned workspace without replaying the command. Runtime preparation can complete for another caller after a caller cancels, but the cancelled caller creates no late workspace. Normal completion retains a bounded opaque archive and redacted event journal under the controller database's `pi-workspaces/<id>` directory; these are not new deployment releases. Interrupted/oversize archive gaps are explicit. Cleanup removes the owned container and volume; worker startup reaps resources whose owning process has ended. Other live worker processes are not swept.

## Verification

- The default application suite passed: 1,011 tests, with 20 opt-in skips. A subsequently added preparation-cancellation case passed with the final focused suites: 52 tests. No claim that the skipped remote/browser suites ran.
- Actual SDK registration checks resolve all eight native names through the workspace in all three conversation phases and the deployment planner, without controller filesystem side effects.
- The real Docker acceptance check exercises the seeded snapshot, edits and new files, both shells, searching/listing, a 200 KB write, missing-file and command-error feedback, no external interface/address or controller credential access, and cancellation followed by no recreation.
- Synthetic Engine tests cover cancellation, deadlines and a dropped connection, including teardown and no replay. They also cover cancelling while shared image preparation is pending.
- TypeScript, production build and changed-file lint/format passed during this change. The real runtime is Linux amd64; on this Apple Silicon machine it runs through Docker's emulation.

The real checks caught defects the synthetic Engine could not: source disappearing when the final tmpfs mount was removed, Docker copying root-owned workspace metadata into the volume, non-blocking stdin reads, and the older distribution `fd` lacking a flag used by Pi. These were corrected and the real check rerun. This is why a fake Engine result alone was not treated as acceptance.

## First native Compose proof

The existing Paperless-ngx trial supplies a real recorded plan plus its pinned upstream Compose files at revision `d48663e9ebaadc4b413a6ca3bc88cb5fbc4e468e`. The proof uses synthetic credential values, a disposable controller state directory and Pi's configured model. It grants no host mutation tools and changes no running stack. Pi can inspect, adapt and validate native Compose using its workspace tools.

The first valid candidate changed existing storage and networks. After concrete comparison feedback, Pi corrected it; the final normalized configuration is identical to the recorded baseline. A separate native-tool check accepts a worker-only arrangement with independent builds and shared read-only storage. Neither result is a live deployment proof.

See the [consumer-fact comparison](../architecture/native-compose-consumer-facts.md) for the resulting architecture implications and remaining work. Detailed local artifacts live under ignored `tests/results/native-compose-proof`; they are bounded design evidence, not deployment, backup or rollback receipts.
