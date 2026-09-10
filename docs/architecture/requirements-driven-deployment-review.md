# Fable review: requirements-driven deployment

10 September 2026. Independent design review through Claude CLI, requested model and reported session model `claude-fable-5`. Read-only access; no implementation, tests or host operations delegated. Baseline code: `ee396b2`.

[Design](requirements-driven-deployment.md). This is design feedback, not evidence that the proposed runtime isolation or deployment behavior has been implemented.

## First review

The first draft proposed composable dedicated verification operations. After this review, the owner clarified the preference for general `bash`, `read` and `write` tools, and the design was revised accordingly. This response therefore refers to the earlier draft.

# Architecture review: requirements-driven deployment (Fable)

## Verdict

**Approve the direction; three design-level changes required before slice 2/3 implementation, no blocker to starting slice 1.** The document's premises are accurate — I verified every row of the "What exists" table against baseline code — and it is well aligned with the toolbox-of-primitives direction. The one serious gap is an unresolved trap state in the verification/promotion story; the rest is trimming.

## Premise verification (brief)

All checked claims hold: implicit special `app`, optional `postgres`, five-companion cap, and mandatory primary HTTP fields (`deployment-types.ts:14-84`); 2xx-only `expectedStatus` and the mandatory GET content assertion (`deployment-types.ts:75,88-98`); single managed-connection bindings (`compose-plan.ts:91-102`); scope binding and mount/postgres/exposure protection (`release-scope.ts`); name-free capture planning (`backup-capture-plan.ts`); Grafana-specific evidence fields (`backup-evidence.ts:103-108,298-369`); one stale Grafana mention in Pi's tool guidance (`pi.ts:691`) plus UI references. A worker-only stack genuinely cannot be expressed: `port`, `healthPath`, and one content-asserting GET are unconditionally required.

## Prioritized findings

**1. The promotion trap state is unresolved (§2/§3 interaction — must fix in the design).** `lastVerified` is not just a badge: it is the required baseline for any scoped update (`release-scope.ts:42`), the source of rollback's verified image mapping (`rollback.ts:10`), and set only by `finishDeploymentAttempt(... "verified")` (`deployment-lifecycle.ts:151-176`). §2 removes the mandatory HTTP proof and §3 says "retain the current promotion rule until a generalized equivalent" — but if slice 2's schema admits a check-less worker-only plan while promotion still requires the old checks, that stack deploys but can *never* become `lastVerified`, so it can never take a scoped update or a compatible rollback. The tempting fix — promote on readiness alone — is exactly the silent weakening §3 forbids. The design must specify, before implementation: what promotes a stack with no useful-behavior check (e.g., a distinct `runtime.state` such as "running, behavior unverified" that release-scope explicitly accepts as an update baseline with recorded reduced evidence), and which slice ships it. Slice ordering follows: the schema must not admit plans the update path cannot service.

**2. Exposure comparison must be set-based before any endpoint work (§1/§3).** Today authority compares a single `httpAccess` scalar (`release-scope.ts:54`). The moment endpoints move into services — even with exactly one public endpoint — the comparison must be over the set of `(service, endpoint, exposure, port)` plus the `httpSourceIp`/firewall consequence, or a conversion bug silently reopens exposure. The design says this for *multiple* endpoints; state it as a precondition for *moving* the single endpoint too.

**3. Factual slip: read-only mounts are already real (§1).** "Read access becomes an actual read-only mount, not a UI label" is wrong — `readOnly` already renders `:ro` (`deployment-compose.ts:94`) and is already scope-protected (`release-scope.ts:79`). Good news, but fix the text, and drop the sample's `access: "write"` enum in favor of the existing `readOnly` boolean — the document's own rule ("do not redesign storage to make this sample prettier") applies to its sample.

**4. Scheduled commands are in scope but inexpressible (§Scope gap).** Product scope includes cron-style scheduled commands; the plan has no representation, and `RecordedStack.jobs` is explicitly descriptive ("recording such metadata does not install a schedule", `deployment-types.ts:369-371`). The design should either add a minimal schedule requirement to the uniform service shape or explicitly defer with the consequence stated (schedules remain Pi-assembled host state outside the plan's authority comparison). Silence here will resurface as an ad-hoc mechanism mid-implementation.

**5. Three check dialects need a named end state (§2).** Primary checks, companion checks (`compose-plan.ts:68-83`, different shape: `jsonPath`/`equals`, no method/status), and the new Pi-directed checks would coexist. §2's "common check-result shape" covers *results*; also commit to one check *definition* shape, with the two legacy dialects read-compatible only. Otherwise verification generalization adds a dialect instead of removing two.

## Primitives versus hardcoded orchestration

The design correctly identifies that today's worst fixed workflow lives in the schema itself, and it should say so explicitly: `deployment-types.ts:260-284` hardcodes an entire POST→capture→GET→DELETE recipe with `SG_VERIFY_TOKEN` markers, and lines 88-98 force every application to prove itself over HTTP. Replacing schema-encoded recipes with Pi-sequenced primitives is exactly the owner's stated direction, and §2's safety constraints (marked disposable fixtures, recorded failed cleanup, no criterion-lowering) preserve what the recipe actually guaranteed. One caution: §2's enumerated operations ("bounded fixture upload, downloading/hashing a result, polling") must ship as separate composable calls — request, inspect, download+hash — not a fused upload-poll-download macro tool, which would just rebuild the recipe one level up. The design also correctly refuses to shatter deployment mutation into lock-losing micro-commands. On Q1: keep the normalized model; native Compose would sacrifice release identity, `kind`/`sqlite`/`capture` semantics, and authority comparison, and import a surface (bind mounts, host networking, privileged) the authority layer would then deny-list forever.

## Remove or defer

- **`role` on services**: descriptive-only fields in an authoritative schema invite branching — today's schema already branches on it (`deployment-types.ts:131-135`). Drop it from the new shape or move it to `RecordedStack`.
- **`endpoints[].name` / multiple endpoints per service**: no current consumer needs two ports on one service; start with at most one endpoint per service. Fails the design's own two-consumers rule.
- **Multiple *public* endpoints**: defer as slice 2 already does; the near-term wins are zero public endpoints and letting a non-`app` service own the single public one.
- **Non-2xx `expectedStatus` for plan-recorded checks**: useful for Pi's ad-hoc tools; questionable in recorded plans initially.
- Keep as planned: no requirements DB, no DSL, no plugin runtime, PostgreSQL as a concrete integration, legacy Grafana receipt readers (most of `backup-evidence.ts` is precisely the sanctioned legacy-reader exception).

## Smallest first PR (Q5)

Not slice 1 alone (worthwhile but trivial — one `pi.ts` line plus UI text). The keystone with near-zero behavioral risk: **a read-side uniform projection** — a pure function from the current plan to the uniform services list — with executor, layout, and backup-capture consumers routed through it, verified by golden before/after Compose renderings from *real recorded plans* (the migration test §Migration already demands). No schema change, no persistence change, no version bump. It proves the shape, preserves `app`/`server-guy-${id}:${revision}` image identities that rollback depends on (`deployment-layout.ts:31,37`), and de-risks everything after it. Guidance cleanup rides along or precedes it.

## Exact changes needed for approval

1. §2/§3: specify the promotion/baseline semantics for stacks without useful-behavior checks (new runtime state, its release-scope and rollback treatment) and pin it to a slice; add the constraint "the schema must not admit a plan the update path cannot baseline."
2. §1: correct the read-only claim; use the existing `readOnly` field in the sample.
3. §1/§3: make set-based exposure comparison a precondition for relocating even the single endpoint.
4. §1 or §Scope: decide schedules — minimal representation or explicit deferral with stated consequence.
5. §1: cut `role` and multi-endpoint-per-service from the committed shape (or mark them explicitly non-goals pending two consumers); §2: name the single check-definition end state.

With those five edits, this is an approvable design and the right next sequence.

## Follow-up review

Reviewed draft SHA-256: `9198612901a836aa7296a8eb43c093238fb888d59a0fa1089c275505fbb07ca9`. The final editorial changes listed below were made after this response.

All the code facts I need are confirmed. Here is my final review.

---

# Second review: requirements-driven deployment (Fable)

## Verdict

**Approved as a design.** All five required edits from my first review are incorporated correctly, and the owner's bash/read/write direction is genuinely the simpler path — the revised §2 is stronger than the tool-catalogue version it replaced. One concrete blocker remains, plus one honesty edit about what "reuse the runner" actually covers. I also now recommend flipping the first PR.

## First-review findings: resolved

1. **Promotion trap** — resolved. §3's observed-runtime snapshot (lifecycle state, not a second database), update scopes binding an observed-but-unverified baseline, strict `lastVerified` promotion, verified-only rollback targets, and the rule "no partial migration that creates a deployed application the update path cannot service," pinned to slice 2, is exactly the specification I asked for. I re-confirmed the coupling it fixes still exists at `release-scope.ts:41-46`.
2. **Set-based exposure comparison** — resolved; now a stated precondition for relocating even the single endpoint (`httpAccess` scalar at `release-scope.ts:54` is acknowledged).
3. **readOnly** — corrected; sample uses the real boolean.
4. **Schedules** — explicit deferral with stated consequence, including the right new rule that Pi's shell must not install unrecorded host timers.
5. **role / multi-endpoint / check end-state** — role moved to application facts; one optional endpoint; one criterion shape with both legacy check dialects as legacy-reader inputs.

## Is bash/read/write actually simpler? Yes

I inspected the isolated runner. `conformance-executor.ts` already provides real isolation and lifecycle: per-run containers with `CapDrop: ALL`, no-new-privileges, read-only rootfs, memory/pids/cpu caps, an `Internal: true` network (`docker.ts:484-494`) whose only egress is an install-time allowlist proxy that is removed before anything else runs (`conformance-executor.ts:409-412`), no host mounts or Docker socket, labeled ownership with teardown/leftover cleanup, and abort-signal cancellation. Each `run_repository_command` is durably recorded as a conformance-run row bound to the Pi run (`phase-three.ts:658-699`) — precisely the "captured execution attached to the actual attempt" §2 demands.

So the shell direction deletes real complexity: no bespoke request/upload/poll/download tools (curl, jq, sha256sum in the workspace suffice once the network path exists — this supersedes my first review's "ship request/inspect/download as separate calls"; they need not be product tools at all), and the schema-encoded POST/capture/GET/DELETE recipe (`deployment-types.ts:260-284`) becomes a Pi-authored script artifact. The two dedicated boundaries §2 keeps — criterion/evidence recording and the managed release/backup/rollback operations — are the right ones; nothing else earns a product API.

## Remaining blocker and one honesty edit

**Blocker: the verification environment's network path does not exist, and the doc hedges where it should decide.** §2 says "Reuse the existing isolated repository runner if it meets these requirements" and "Introduce a dedicated HTTP tool only if the actual runner cannot provide the needed credential/network boundary simply." I can answer that conditional from code: it cannot, today. The workload network is internal-only with zero post-install egress, so a check script cannot reach a deployed application's endpoint at all. The doc must name the two candidate mechanisms — execute check scripts on the managed host beside the Compose network via existing release machinery, or grant the runner deliberate scoped egress reusing the existing allowlist-proxy pattern — and require slice 2 to select one before any credential is supplied. Leaving this open is how a "temporary" secret-bearing proxy gets improvised mid-implementation.

**Edit: scope "reuse" honestly.** The runner is one-shot (full re-materialization plus mandatory `uv sync` per command) and coupled to the `fastapi-uv` profile and Python runner image (`conformance-definition.ts:10-14`). Reuse means the isolation, bounds, recording and cleanup machinery; a persistent per-run workspace session and profile/image decoupling are new work. One sentence in §2 saying so prevents a mid-slice surprise.

## First PR: flip to the workspace-shell slice

Projection-first was my recommendation before the owner's clarification; I now recommend the smallest shell slice first: `bash`/`read`/`write` over the existing runner, workspace environment only — internal-only network unchanged, executions recorded through the existing conformance-run rows, no verification credentials, no promotion or schema changes. This is the doc's own "split runner access from promotion changes" escape hatch made slice 1. It tests the central hypothesis (that generic tools cover most of the toolbox) with the least new machinery, and it is prerequisite-free. The projection PR moves to second, unchanged in content, still mandatory before any plan-shape change; the two touch disjoint code and could proceed in parallel. Guidance cleanup (`pi.ts:691`, UI text) rides along with either.

## Design approval versus unproved properties

I am approving the design and its sequencing, and confirming the isolation/recording mechanisms exist in code as described. I have not tested their adequacy — container escape surface, proxy robustness, session-lifetime behavior under crash — and `redactSecrets` in output handling is hygiene, not a boundary, exactly as the doc itself states. Those remain slice-2 exit criteria to demonstrate, not properties this review certifies.

## Author disposition after both reviews

Accepted the concrete findings; no production code changed.

- The first implementation PR is now isolated general workspace tools, with write/read/execute continuity and recorded results. Uniform service projection follows before any persisted plan change.
- Explicitly documented the runner's Python/profile and one-shot assumptions. Reuse is limited to isolation, bounds, recording and cleanup; workspace lifetime and profile decoupling need implementation.
- Named both live-verification network options. Proposed scoped runner egress first for reachable declared HTTP endpoints, with no implied access to private-only services. The later verification slice must demonstrate destination/credential/cancellation behavior before supplying credentials; a managed-host check container is the alternative if the egress boundary is unsuitable.
- Preserved strict historical verification while allowing a freshly observed, attributable but behavior-unverified runtime to baseline a corrective update. Unknown outcomes still require reconciliation.
- Kept existing read-only mounts, minimal endpoint representation, explicit schedules/registry gaps and legacy check readers. Added no plugin framework or workflow language.

Fable approved the reviewed design direction and identified a remaining networking prerequisite. The final document makes that prerequisite explicit and adopts the suggested sequencing; the post-review edits were not submitted for a third approval. This review does not certify the proposed implementation.
