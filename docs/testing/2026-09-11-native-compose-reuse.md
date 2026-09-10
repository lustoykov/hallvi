# Real Pi reuse proof: independent builds, shared files and SQLite

11 September 2026. This is step 3 of the [generalization plan](../plans/generalization-delivery.md), recorded in the [proof plan](../plans/native-compose-proof.md). The same native Pi path for first deployments and updates ran on a second application with a different structure. It is not a live-host deployment or a claim of universal Compose support.

## Run

- **Code:** production code is PR #44's merge `af49419`, unchanged. The candidate adds this test and a fixture README.
- **Model:** the controller's saved Pi choice, `openai-codex` / `gpt-5.6-sol` at high effort. Only the settings file was copied into the disposable configuration directory; the credential it names was read only by Pi's runtime.
- **Command:** `SG_RUN_PI_PROOF=1 SG_PI_SETTINGS=<controller pi-settings.json> npx vitest run --config tests/application/vitest.config.mjs tests/application/integration/native-release.docker.test.ts -t "installs independently built web and worker services"`.
- **Result:** passed in 215.6 s (install 1.67 min, update 1.85 min).
- **Real components:** worker, approval route, provisioning code, intake and release planners, workspace, file export, pinned Compose 2.40.3 resolver, controller override, scope, locked host script, receipts, verification and operation store.
- **Stand-ins, as for the first application:** SSH runs the host script locally; a fake Hetzner API "creates" this machine (no provider calls or spending); GitHub trees come from fixtures; host port 80 is mapped to a loopback port at execution only.
- **Detailed output:** ignored `tests/results/native-compose-proof/pi-proof/`.

## Application

`tests/fixtures/shared-builds`, now with a README describing routes, paths and data flow. `web/` and `worker/` each have their own Dockerfile and `version.txt`.

- **Web service:** keeps one value in SQLite, writes each submitted value as a job to `/documents`, and reads the result from `/results`.
- **Worker:** reads `/input` and writes `<value>@<release>` to `/output`. It serves no HTTP.
- **No managed database and no private input.** By contrast, the first application was notes on managed PostgreSQL with a private key and one Dockerfile.

Revision A is v1. Revision B is v2 in both components. B's worker Dockerfile also moves the worker from UID 65534 to 10001. This is a deliberate topology-specific fault: harmless on a fresh install, but it breaks writes to a results volume still owned by the old UID.

## Install

Owner request: "Deploy this application with its background worker. Its stored value, submitted documents and results must survive updates."

Pi wrote `compose.server-guy.yaml` and validated it with `docker-compose config`:

| Service | Build | Named volumes | Other |
| --- | --- | --- | --- |
| `app` | `./web` | `application-data:/data`, `submitted-documents:/documents`, `worker-results:/results` (all read-write) | `80:8080`, HTTP healthcheck |
| `worker` | `./worker` | `submitted-documents:/input:ro`, `worker-results:/output` | healthcheck: ready file and, once a job exists, output equals `<input>@<version>` |

- **Data records:** `application-data` is recorded as a database with SQLite file `application.sqlite`. The other two volumes are files. All three are captured as `quiesced-files`.
- **Intake correction.** Intake refused Pi's first criterion, which wrote to the application: "Mutating verification must create one marked object, capture its ID, read that marked object, and finally delete only that ID." This app has a single stored value and no delete route, so such a check would overwrite user data at every verification. Pi resubmitted with read checks (`/health`, and `/version` contains v1), and the recommendation was accepted.
- **Execution.** One fake server was provisioned, with a firewall open on 22 and 80 and public HTTP. The approved release ran once, and each service's image, readiness and the criterion passed verification.
- **Harness checks:**
  - Two independently built images, with distinct IDs.
  - The running mounts equal the recorded facts.
  - A value POSTed to the web service came back from `/result` as `retained value from v1@v1`: web → documents → worker → results → web.

## Update

Owner request: "Update to the latest revision. Keep the stored value, the submitted documents and the worker's results."

Pi read `.server-guy/current/` and the v2 source. That directory holds the resolved configuration, the records, and the v1 files it had selected, including both repository Dockerfiles. Diffing those against v2 revealed the UID change. Pi then:

- added `user: "65534:65534"` to the worker, commenting that this keeps access to the existing result volume, whose files belong to the previous release's UID;
- updated the criterion to v2;
- confirmed in the workspace that the state paths and records were unchanged.

The first execution passed verification; there were no failed attempts or feedback events. **The fault never reached the host, so this application shows no correction from host feedback.** The first application's run 3 corrected from host feedback twice, through the same loop.

**After the update:**

- The SQLite value is retained.
- `/result` became `retained value from v1@v2`: the v2 worker processed the retained document into the retained results volume.
- `/version` reports v2.
- All three volumes keep their creation times.
- Both images were rebuilt.
- Writing through the worker's read-only `/input` fails with "Read-only file system".
- The runtime is recorded as verified at B.
- The generated database password appears nowhere in the evidence, the record or Pi's journals.

## Cleanup

`docker compose down -v` removed the stack, its network and its three volumes. Built images were removed by their project label, and Pi's workspace containers were removed after each session. A final sweep found nothing left for the project and no workspace containers. Pre-existing resources were left untouched: an older `sg-native-release-*` temporary directory from a notes run, stacks `sg-fe64777e` and `sg-10845059`, and the `c4446c58` images.

## Conclusion and limits

With no production changes, the same path installed and updated a second application: two subdirectory builds, a worker, three shared named volumes with per-mount access, SQLite, and no database or private input. Pi chose the services, mounts, data records and checks. The product enforced the check rules, then resolved, scoped, executed and verified each release. Two arrangements demonstrate reuse, not universal Compose support.

- **What the product verified:** identity, readiness and read checks over HTTP. The worker's processing is harness evidence. Pi's worker healthcheck also compares output with input, so the update's passing readiness implied the retained job was reprocessed. The product still counts this as readiness, not behavior.
- **Pi's choices:** Pi mounted results read-write in the web service, although that service only reads them.
- **Single run:** no host-feedback correction on this application, and the run was not repeated.
- **Not exercised:** backup capture, rollback and recreation of this stack.
