# Optional local Docker — 19 September 2026

Verification of the change that makes local Docker optional for Pi's
repository workspace, in [PR #153](https://github.com/lustoykov/hallvi/pull/153), based on
`f3232cbb`. [Pi's workspace](../installation.md#pis-workspace) describes the
behavior; [Architecture](../architecture.md#repository-workspace-architecture)
draws the boundary.

## Default path with local Docker unavailable

The development controller (web interface and Pi worker) ran on the owner's
Apple-silicon MacBook inside `sandbox-exec` with a profile denying every
connection to a socket named `docker.sock`. Docker Desktop kept running for
other work; from inside the controller and everything it started, `docker ps`
and a direct socket request both failed with a permission error. The model was
the owner's real ChatGPT account (GPT-5.6 Sol); the host was a real Hetzner
CX23 in `hel1`, Ubuntu 24.04, created by Pi in an authorized Hetzner project.

| Step | Observed |
| --- | --- |
| Docker chosen, unavailable | Settings → Workspace showed that Docker was not answering. A real turn received no workspace tools; Pi reported the socket error and the two remedies, ran nothing and created no folder. |
| Switch to “On this computer” | Saved from Settings; the next turn used the scratch folder. |
| Inspect | Pi read `docker/getting-started-app@6b025fc` in the folder (reads, `find`, `grep`, a `bash` probe) and explained the app, its SQLite storage and that the repository has no Dockerfile. |
| Package | Pi wrote `Dockerfile`, `compose.yaml` and `.dockerignore` in the folder. Its local `docker compose config` failed on the blocked socket; it said so and validated on the server instead. |
| Deploy | Pi rented the CX23, installed Docker and Compose there, cloned the same revision, carried the three files in one recorded `server_bash` heredoc, validated (`compose=valid`), built and started the service bound to `127.0.0.1:3000` with SQLite on a named volume, and checked health, CRUD and persistence across container replacement. |
| Use | Through the private link `http://127.0.0.1:8081`, a new item was added and survived a reload. Port 3000 on the public address timed out from the Mac. |
| Records | Both turns' journals say `isolation: direct`; each folder was archived as `workspace.tar` with the packaging files and removed from the temporary directory. |

The first search in the folder downloaded `fd` and `rg` into
`<temp>/hallvi-workspaces/pi-tools`, because the service's `PATH` had neither.

## Docker mode with Docker available

`HALLVI_DOCKER_TESTS=1` ran `pi-workspace.docker.test.ts` against Docker
Desktop 28.5.1 (arm64) with Docker chosen: the image was rebuilt for the
changed bridge, Pi's real tools ran in the networkless container on the seeded
snapshot without controller files or credentials, and cancelling a running
`sleep` removed the container. 74 seconds, passed.

## Focused tests

`pi-workspace-direct.test.ts` runs Pi's real tools in a real child process:
no Hallvi token or `HALLVI_*`/`GH_TOKEN` variable reaches `env`; file tools
refuse Hallvi's state file directly, through a symlink the shell created, by
`~` and by a search rooted outside the folder; cancellation kills a
backgrounded `sleep` (process gone, `ESRCH`) and ends the workspace without
replay; Docker chosen with no engine, and an unreadable setting, both withdraw
the workspace and never run anything here; and start-up cleanup removes only
this installation's folders left by a dead worker. Removing the environment
allowlist or the path check each made the first test fail. `pi.test.ts` checks
that an unavailable Docker choice withdraws every workspace tool while
`server_bash` stays. The synthetic-engine Docker tests now set the Docker
choice explicitly. Full suite on Node 26: 930 passed, 3 skipped; `tsc`,
`eslint`, `prettier`, `npm run build` and `npm run package` passed.

## Limits

- The controller was the development server, not an installed service; the
  package was built and contains the bridge, but no installed service ran this
  revision.
- Docker was made unreachable by a sandbox profile rather than by a machine
  without Docker. The Docker CLI was still on `PATH` and failed to connect.
- Only macOS was exercised live. Linux runs the same code in CI.
- The direct mode's precautions are not isolation: a shell command in the
  folder can read Hallvi's state directory and the user's SSH keys.

The Hetzner server, its SSH key and firewall were labelled for this task,
registered in the development inventory and deleted after the run.
