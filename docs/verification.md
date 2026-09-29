# Verify a Hallvi change

For a coding agent working in this repository: choose one observable behavior,
exercise it on the intended controller, and keep the evidence that establishes
it. This is the supporting workflow for
[verify-hallvi](../.agents/skills/verify-hallvi/SKILL.md), not a separate policy.
It is contributor guidance, never a prompt or skill to load into Pi.
Send Pi only the application request and its scope.

[Development setup](development.md) owns setup,
[the test guide](../tests/README.md) owns the testing bar,
[retained applications](development-environment.md) own state compatibility,
and [the CLI contract](cli.md) owns commands, JSON and exit codes. Use those
existing tools; there is no development-verification command in the public CLI.

## 1. Choose the smallest useful environment

Use an isolated worktree and Node 22 (`node --version`), then `npm ci`.
Record `git rev-parse HEAD` and any uncommitted changes being tested.

| What the change needs to prove | Start here |
| --- | --- |
| Layout, rendering, empty/error states or ordinary UI interactions | `npm run scenarios -- 3730` on a free port; use the printed scenario URLs and existing browser fixtures in [tests](../tests/README.md#commands-and-limits). These are offline synthetic records, not deployments. |
| Deletion, fault injection, incompatible schemas or recovery from loss | A task-owned disposable fixture using the existing test tooling; see [when to use a disposable fixture](development-environment.md#when-a-disposable-fixture-is-still-the-right-thing). Never break retained state or a shared host to prove a failure. |
| Old conversations or several real applications rendered together | `node scripts/retained-application.mjs snapshot work/verify-snapshot <name>` (add names as needed). Run the exact environment assignments it prints, choosing a free port. The empty account directory is deliberate: histories are readable, new Pi turns are unavailable. |
| Real Pi work against an existing application, history or data | Check `node scripts/retained-application.mjs status` and the register described in [the development environment](development-environment.md). Choose a free application that exercises your criterion; attach it as below. Registration is not evidence of live host health. |

For an ordinary fresh development controller, `npm run db:push` then
`npm run dev` starts the app, worker and paired development tools. Add an
application through Hallvi's page if the controller is empty; `apps` only lists
applications and `exec` does not create one. Do not initialize or reset retained
state. Account logins are shared by default; changing them affects other
controllers. Keep fixture credentials isolated as the existing runners do.

Before attaching older state, check its schema and Pi version against this
checkout. Test compatibility on a snapshot first: open the application and
its history through the running worker, inspect its records, and refresh the
browser. A schema change needs the documented migration on a copy first too.
Only after that proof, use `attach <name> --accept-format` if Pi's version
differs; the normal attach takes a verified backup. Follow the
[upgrade procedure](development-environment.md#upgrading-the-records), not
`db:push`, for supported retained upgrades.

```sh
node scripts/retained-application.mjs status
node scripts/retained-application.mjs attach <name>
```

Say which application you are taking. Attach starts the controller on that
application's port and stays in the foreground. Keep it in one terminal or a
tracked background session and read its startup output; run checks in a second
terminal/session. Do not run a second `npm run dev`
on its state. An occupied lock or unclean previous runtime is a reason to
coordinate/investigate, not to force takeover. The lock protects controller
state, not neighbours on a shared server; stay within the selected application.

## 2. Discover, send, follow, inspect

Run the checkout's `node scripts/cli.mjs` so the client matches the code under
test. In an installed release the equivalent command is `hallvi`. Use the app
URL printed by your launcher, not the dashboard URL or an assumed default.
Check the paired dashboard's **Development** page for checkout/database identity.
Record the PID and ports of the preview you started so cleanup targets it exactly.

The examples below run from the repository root in a second terminal with
Node 22. Replace the URL and IDs with those you just verified. Local output
can contain private application data; keep it out of commits and review it
before quoting it in a PR.

```sh
umask 077
mkdir -p work/verify
export HALLVI_CONTROLLER_URL=http://127.0.0.1:3730  # replace with your app URL
node scripts/cli.mjs apps --json > work/verify/apps.json
cat work/verify/apps.json
APP_ID='<id from applications[] for the intended application>'
node scripts/cli.mjs inspect "$APP_ID" --json > work/verify/before.json
```

Confirm `controller`, `applications[].id`, `name`, `mainChatId` and
`permissionMode`. Inspect `main` and `attention` before sending: an unavailable
worker is unknown, and existing work or an interrupted operation needs
coordination. `apps` and `inspect` read records; neither probes the host.

Write `work/verify/request.txt` with a bounded application-specific request.
For example, for a retained whoami application whose address and expected name
you have checked: “Read-only check: GET the existing public /api endpoint with
a unique X-Hallvi-Verification header. Report the HTTP status, application name
and echoed header. Do not redeploy, restart, change configuration, create
resources or alter application data. Report any missing evidence.” Include
the actual address, expected name and header value. If revision matters, ask
for the running commit or immutable image identity and what establishes it.
Do not send this guide, contributor instructions or a cleanup plan to Pi.

```sh
REQUEST_KEY=$(node -p 'crypto.randomUUID()')
node scripts/cli.mjs exec "$APP_ID" - --request-key "$REQUEST_KEY" \
  --background --json < work/verify/request.txt > work/verify/accepted.json
# Read the result even if the command exits nonzero.
cat work/verify/accepted.json
HANDLE=$(node -p 'require("./work/verify/accepted.json").handle')
node scripts/cli.mjs wait "$HANDLE" --timeout 120 --json > work/verify/outcome.json
cat work/verify/outcome.json
node scripts/cli.mjs inspect "$APP_ID" --json > work/verify/after.json
```

Continue to `wait` only with the returned handle; a validation error might
have none. `--background` returns after acceptance, with `status: null`; it
cannot be combined with `--timeout`. For short work, omit `--background` and
use `exec ... --timeout 120 --json` to send and follow in one command.

Read `accepted`, `status`, `error`, `attention`, `answer`, `failure` and
`operation.requestKeys`. Match your key to that operation and its `evidence`,
not simply the newest execution in `inspect`. Several queued requests can
share an operation and its whole answer. Check each relevant call's target,
input, status, output and timing; an absent numeric exit code is not zero.

If `outputTruncated` or `inputTruncated` hides what you need, take the relevant
non-null `executionId` from that operation:

```sh
EXECUTION_ID='<executionId from outcome.evidence>'
node scripts/cli.mjs inspect "$APP_ID" --execution "$EXECUTION_ID" --json \
  > work/verify/execution.json
```

Full execution data is under `execution` (including `id`, `toolCallId`,
`chatId` and `output`); verify those identities. It is still redacted and
limited to the last 100,000 recorded output characters. The outcome holds
the last 40 calls; `inspect` holds the newest 20 executions and 25 presented
records. Check `evidenceOmitted`, `executionsOmitted`, `recordsOmitted` and
`answerTruncated`. For calls or answer text omitted from those lists, open the
matching [conversation and tool disclosures](development.md#diagnostics).
The page's arguments and results are also bounded, redacted previews; it cannot
recover output beyond the execution recorder's limit. Raw reasoning export is
currently unavailable. A call with no execution ID has no full execution to
fetch. State the gap if the available evidence is insufficient; do not treat
omitted evidence as a clean run.

## 3. Respond to the actual outcome

| Result | Next action |
| --- | --- |
| `completed` / exit 0 | Pi finished answering. Read what it established; this is not proof that the operational objective succeeded. Background acceptance and successful record reads also exit 0. |
| `waiting-for-approval` / exit 2 | Review `attention.reason` and `attention.page` in Hallvi under the existing permission mode. After the authorized decision, `wait` on the same handle. Never change modes to make a check pass. |
| `waiting-for-input` / exit 2 | Hand off the actual card to the owner. Answering it starts new work; the original handle continues to describe its original operation. Follow that new work in Hallvi and inspect its evidence. A prose question can be `completed`, so read the answer too. |
| Timeout / exit 3, or Ctrl-C / exit 130 | Only the observer stopped; Pi may still be working. Keep the handle and `wait` again (`--timeout 0` reads once). Do not resend under a fresh key. |
| `accepted: null`, `acceptance-unknown`, or a read/transport error / exit 1 | Acceptance or current state is unknown, not failure of the application. Keep the handle/key. Retry the exact same text with the same `--request-key` when needed to settle acceptance; `wait` never resends. A deadline during failed reads can exit 1 rather than 3. |
| `failed` / exit 1, `cancelled` or `interrupted` / exit 4 | Inspect partial effects and failure evidence. Continue/Stop is an explicit choice in Hallvi, not a CLI retry. A dropped queued request may be absent to a fresh `wait`; absence does not prove it ran or succeeded. |

## 4. Verify the useful result, then leave evidence and clean up

Independently check the behavior the change promises where it matters. For
whoami, GET `/api` and verify the expected name and your echoed request header,
not just HTTP 200. For stateful applications, use the named monitor, starred
entry or tagged document in the retained register. For a release, compare the
expected revision with the observed running commit/image; a repository HEAD
or old release record alone does not establish the running revision. Prefer
read-only checks; writes/restarts require the task's scope or a disposable fixture.

Browser checks still cover rendering and interactions: open the affected
page, exercise the changed control, inspect the result and refresh. Use
representative data and relevant screenshots; CLI output cannot prove visual
quality. Choose focused checks by [the testing bar](../tests/README.md#the-8020-bar),
run `npm run format`, and review the final diff.

In the PR, state the tested revision and environment (real model/provider,
local container or scripted fixture), request/operation/execution identities,
observations, independent behavior check and relevant screenshot links.
Keep screenshots, logs and per-run reports in ignored `tests/results/` or
`work/`; attach useful captures to the PR rather than committing them. Do not
add new evidence files under `docs/testing/`. Durable testing instructions
belong in the existing guides; run-specific results belong in the PR.
Never force-add ignored artifacts. After review, remove this task's temporary
captures and reports when they are no longer needed; never clean another
task's files.
Separate historical evidence from this run and say what was blocked, simulated
or unverified. Use [the PR template](../.github/pull_request_template.md);
documentation-only changes do not require a broad suite or a new deployment.

Detach only the retained application this task attached with
`node scripts/retained-application.mjs detach <name>`; keep its history, data
and verified backups. Detach waits for Pi and stops the controller, dashboard
and Studio it started. Development/build commands may rewrite tracked
`next-env.d.ts`; inspect the diff and restore only generated changes caused by
this task, preserving any prior edits. Stop your own previews by recorded PID, run
`node scripts/check-preview-processes.mjs`, and confirm their ports closed.
Remove only your exact disposable fixtures/snapshots after preserving needed
redacted evidence. Follow [resource cleanup](development-resources.md) for
containers, provider resources and anything intentionally left for review.
Never prune shared resources or remove a worktree by hand.
