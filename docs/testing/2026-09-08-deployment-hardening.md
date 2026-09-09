# First-deployment hardening — 2026-09-08

This is the follow-up to the [Fable candidate review](../reviews/2026-09-08-fable-merge-readiness.md). The implementation remains in the integration worktree on `codex/self-hosted-shell`, over PR #21 at `c7ed574ce3053a2bf7f0be72e85c0ee2f1b39df5`. This report does not claim a pushed PR or green GitHub checks. The [original real-deployment report](2026-09-08-real-deployment-acceptance.md) preserves the initial happy-path evidence.

## Bounded fixes

| Finding | Implemented behavior |
| --- | --- |
| Confirmed create rejection strands setup | The provider exposes a sanitized HTTP status and error code. An allowlisted definite rejection clears the create-attempt flag; retry can proceed. Unknown, network and server errors retain uncertainty and reconcile by the original deployment label before any purchase. |
| Abandoning a failed intent | Cancel setup is available only before a server is recorded and with no unresolved create attempt. Where the matching provider authority remains connected, a fresh server lookup must also find none. Cancellation preserves a transcript receipt; it never deletes a running server. |
| Model impersonates user intent | `prepare_deployment` records an assistant message with Server Guy provenance. Only the actual UI action creates a user-authored deployment request. Repeated requests reuse the same intent. |
| Price changes after approval | Approval refers to a unique recommendation. Both approval and the worker refresh the exact selected type/location. A currency change or price above the approved cap returns to review, preserving entered inputs in the browser. |
| Loose source identity | Planning records numeric GitHub repository ID, connection ID and exact commit; approval and execution recheck them. The configuration disclosure shows the revision and any difference from the earlier contract inspection. |
| Trivial verification or leaked test data | A non-health content assertion is required. Mutating checks must create a marked object, read that captured object and delete it. The executor persists a cleanup receipt and attempts cleanup after a later failure. Unknown creation without a captured ID blocks further POSTs and reports the unique marker for investigation. |
| Concurrent record replacement | Saves and cancellation compare the previously loaded body in SQLite. Approval rechecks freshness and writes private inputs and authority under one immediate transaction. Stale writers fail rather than overwriting current state. Intent creation uses an immediate transaction. This uses the existing table, without adding a generic operation framework or revision column. |
| Metadata exposes host key | Trusted host setup blocks container and non-root host access to Hetzner metadata before repository code runs, restricts cloud-init files, and installs a Docker systemd post-start guard. Root remains trusted. |
| Controller Host boundary | The proxy rejects non-loopback Host headers on reads and writes. Mutation handlers independently enforce the same allowlist and origin checks. This is still a local controller; it does not implement remote owner authentication. |
| Dashboard-to-conversation handoff | Asking about a check opens the conversation and focuses its composer, including when the question starts from an archived chat. |
| Smaller concrete issues | Canonical deployment worker lock path, normalized build contexts, generated Dockerfile name restriction, and a populated v11-to-v12 migration fixture. |

No schema version change was needed in this pass. New optional deployment JSON fields remain readable alongside existing v12 records. Older unbound recommendations must be cancelled and prepared again before approval; completed deployments remain visible. Decisions, observations and preparation records were not dropped.

## Live verification

Used only the existing Hetzner server `165201745` (`178.105.108.77`), deployment `bbb70948-d715-4e1a-9e08-204f4bcbd983`. No new server was purchased.

- Before mitigation, an application-container request to the metadata endpoint returned HTTP 200 and the response contained private-key material. The probe logged only a boolean; no key or user-data body was printed.
- After installing the guard, the same container request was blocked. A non-root host request was also blocked. File permissions and the Docker post-start configuration were checked. A host reboot/Docker restart was not exercised.
- The running container still matched revision `7f281ad255fcd9255dcc1f2d3d1d8359a3aea259` and image `sha256:0dc50333e6f2229ef3f8fc5d5d8a67feb969c88ebd487979fc9b9f6cb9e16dad`.
- The hardened verifier successfully created, read and deleted its marked todo through the public application. No cleanup receipt or uncertain test-object creation remained. `/health` returned HTTP 200 afterward.

These are observed results from this run, not continuous monitoring. The original deployment verification timestamp is retained; this maintenance check did not fabricate a new release.

## Acceptance status

Application tests: **808 passed, 15 opt-in cases skipped; 75 files passed, 2 skipped**. TypeScript, ESLint and formatting passed. The production build passed with the existing dynamic-filesystem tracing warning in `docker.ts`. The local controller and worker were restarted on the final build: normal application access returned 200, a direct request with an arbitrary Host header returned 403, and the saved live deployment remained visible. All **35 browser journeys have passing results**: the full run finished with 32 passed and three failures; the setup-history selector, dashboard smoke-count expectations, and dashboard-to-conversation handoff were corrected, then their targeted reruns passed. The two workspace-navigation cases both passed on the rerun. No journey was removed or skipped to obtain this coverage. Old phase-rail/completed-chat-read-only and Record-width-toggle expectations were deliberately replaced with application-owned conversation and dashboard behavior. This is full-suite execution plus targeted correction evidence, not a claim that the initial full run was green.

The deployment browser fixture simulates price changes and provider rejection; it does not create resources. Its €6.49 offer is synthetic. The real VPS remained on its original €5.99/month quoted offer. The new application-shell journey is tagged for the existing PR smoke job, covering durable conversations and deployment approval/repricing/recovery. The testing dashboard now shows three automatic smoke journeys. GitHub CI itself has not run for this unpushed candidate.

## Deliberate limits

Generic operation/attempt tables, separate host entities, full schema retirement, automatic host retirement, and a broader plugin/runtime redesign remain outside this fix pass. The initial deployment limits remain: HTTP only, one application host, no off-host backups, continuous monitoring, routine releases or BYOM adoption yet.

A lost mutating verification response without an object ID still needs investigation using the recorded marker. A recorded server that was manually removed is not silently replaced. Host retirement/replacement and controller state recovery need their own product flows. These restrictions prevent blind repeated effects; they are not claims of complete lifecycle support.
