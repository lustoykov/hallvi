# Fable review of the final integration — 9 September 2026

Independent read-only review through the installed Claude CLI, model `claude-fable-5-1`, high effort, session `10429ca4-4752-4f43-bcd1-54aac4e331d4`. The isolated source snapshot was Git tree `051cbaf85de60769e9ccb6544f83bb7ddf9fcf55`, subsequently committed with acceptance documentation as `4a309a4`. Fable could use Read, Glob and Grep only; it ran no tests, edited no files and contacted no providers.

**Reviewer verdict: no merge blockers found for the supported first-deployment slice.** The reviewer confirmed the cross-conversation worker fix, source/spending boundaries, host metadata protection, loopback boundary and populated migration approach. This is not a review of the broader unimplemented roadmap or of Fable's separate final-screen branch.

## Disposition

1. **Approval versus a concurrent conversation reference — fixed.** The approval path now uses the same execution-state comparison as worker saves. Reference metadata cannot invalidate an otherwise unchanged recommendation during source/pricing awaits; changed recommendations still reject approval before saving private inputs. The regression suite passes all 11 cases, including the new concurrent-reference approval case and the existing changed-recommendation rejection case.
2. **Uncertain purchase with an empty reconciliation result — retained conservative stop.** The reviewer suggested cancelling after an empty provider lookup. A timeout/5xx does not establish completion of the original create request, and a single empty lookup is not by itself evidence that no delayed resource can appear. This pass does not convert uncertainty into authority for a new purchase. When no matching server can be recovered, product-assisted resolution remains a known limitation; preserve the intent and investigate the provider outcome. A future resolution flow must establish completion/non-creation before clearing authority.
3. **Lost verification POST response without an object ID — retained conservative stop.** The reviewer suggested clearing the marker on retry. That would repeat a data-changing request without establishing what happened to the previous object. Keep the marker and stop; a future resolution flow must locate/clean up the object or explicitly record verified absence before rerunning the check. There is currently no in-product resolution action, so this is an acknowledged recovery gap, not a completed journey.
4. **Cancelled setup files — retention limitation.** Cancellation removes the active intent, but its private local directory may retain inputs and keys. No public exposure was found. Controlled deletion of definitively abandoned local material belongs with the remaining setup/recovery cleanup work.
5. **Concurrent log refresh — recoverable conflict.** A second simultaneous refresh can lose its race and ask the user to retry; it does not overwrite execution state. No additional concurrency mechanism was added for this low-impact case.

The two unresolved-outcome cases must not be presented as automatically recoverable. They are explicitly tracked in [Roadmap](../../ROADMAP.md). This merge preserves the verified happy path and bounded failure behavior without claiming complete lifecycle support.

## Original reviewer response

The following describes the review snapshot, before the approval fix above. Suggestions are retained as review evidence; their disposition is the section above.

**Verdict: no merge blockers found.** The supported slice (loopback controller, one HTTP app plus optional PostgreSQL on a fresh Hetzner host) holds up on correctness, security and data protection. The cross-chat mention fix is sound. I found two recovery dead ends worth closing before this path is relied on, and one boundary that still trips on the same mention race the fix addressed. All three are small.

## Assessment of the mention conflict fix

The fix in `src/server/deployment-store.ts:39-58` is correct. Execution state is compared with `mentions` and `updatedAt` stripped, mentions are merged by message id so nothing is lost, and the conditional update runs inside an immediate transaction. The comparison depends on JSON key order surviving a database round trip. That holds because every stored body is produced by serialising the same in-memory object and is re-parsed in insertion order. The regression test at `tests/application/integration/deployment-state.test.ts:124-147` exercises the real failure (worker saves after another chat mentions the record) and also proves a stale cross-chat object cannot overwrite execution state. Good.

## Findings

**1. Approval still conflicts on a cross-chat mention during pricing.** `src/app/api/applications/[applicationId]/deployment/route.ts:92` compares the full JSON body, including mentions. The record is read at line 54, then two network awaits follow (source check, live pricing). If another conversation asks about the deployment in that window, approve returns "Deployment changed while this action was running" and the user must re-approve. Same class of bug as the one fixed, on the boundary that matters most. Fix: export the store's `executionState` helper and use it here. Add a test like the existing "changed during pricing" case, but with a mention instead of a recommendation change, expecting success.

**2. An uncertain server creation with no server is a permanent dead end.** After a Hetzner 5xx or the 30 s timeout on the create call (`src/server/hetzner.ts:71-83`), the attempt flag stays set. Every retry throws at `src/server/deployment-executor.ts:246-249`, and cancel is refused at `route.ts:114-122` because the flag is set. The error text says "retry reconciliation", but reconciliation can only succeed if a labelled server exists. Application removal is also blocked at `src/server/phase-one.ts:384`. Recovery is SQLite surgery. Smallest fix: in the cancel branch, allow the case where the flag is set but no server id is recorded, provided the Hetzner connection matches and the live label query already at `route.ts:123-132` returns no server. Hetzner attaches labels at creation, so that query is a reliable answer. Record an event describing the confirmed empty outcome.

**3. A lost verification POST strands the deployment.** `deployment-executor.ts:682-683` saves the marker before the POST. If the request throws with no response (20 s timeout at line 618, or a reset), no cleanup receipt exists and every later retry throws at lines 665-670. Nothing in the product clears `verificationPending`, so a single slow response on a purchased server means the deployment can never reach "live". The hardening report lists this as needing investigation but gives no way to continue afterwards. Smallest fix: when `retry` is used with a pending marker and no cleanup receipt, record an event naming the marker and clear the flag. The leftover object is a synthetic test record carrying a unique token, which is far less costly than a stranded host. This is a product call, so I flag it rather than assume it.

## Optional observations

- Cancel deletes the row (`deployment-store.ts:66-85`) but leaves `inputs.json`, keys and the database password under the deployment directory (`deployment-executor.ts:35-55`). User secrets outlive the intent. Remove the directory after the delete commits.
- Two simultaneous "logs" clicks make the second fail with a conflict. Harmless.

## Checked and clean

- Approval binds recommendation id, live re-pricing at approve and again before purchase, and the client sends the displayed price as the cap (`deployment-decision.tsx:78`).
- Source identity is rebound at planning and rechecked at approval and execution.
- Host key is generated locally and pinned in a dedicated known_hosts. Metadata guard runs from cloud-init and is re-applied before application code.
- Compose escaping of dollar signs, no host mounts or privileged flags reachable from the plan, tar reader rejects links and traversal, Dockerfile path cannot escape the source directory.
- Loopback Host allowlist is enforced in the proxy and again inside every JSON mutation.
- Worker lock is a separate SQLite file with an exclusive transaction, released on crash. Interrupted work is marked failed on restart, never re-run blindly.
- Migration scripts and the chat ownership rebuild match schema version 12 and remain owner-merged preparation.
