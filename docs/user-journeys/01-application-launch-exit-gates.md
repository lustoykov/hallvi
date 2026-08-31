# Journey 01: Exit Gates and Gate Checks

Status: workshop draft for product-owner review. This document defines the fixed substeps for Application Launch. It does not define implementation workflows and does not resolve the V1 acceptance pack's U1-U16 product decisions.

## Purpose

Application Launch always moves through the same nine **Launch Phases**:

1. Start
2. Understand
3. Conform
4. See the launch
5. VPS
6. Domain
7. Operations
8. Go live
9. Handoff

Each Launch Phase produces one **Phase Deliverable** and has one **Exit Gate**. The user-facing word **substep** means a **Gate Check** inside that Exit Gate; it does not introduce another domain object.

Pi may inspect, reason, ask questions, use tools, loop, or revise its approach inside a phase. Those actions are not the substeps. The Gate Checks describe the observable bar that the resulting work must satisfy.

## Source and decision status

This draft reconciles:

- the canonical terms in [`CONTEXT.md`](../../CONTEXT.md);
- the nine-phase journey in [`01-application-launch.md`](./01-application-launch.md);
- the acceptance review at `review/v1-acceptance-pack` commit `3994f49`, especially F-1 through F-21 and U1-U16;
- the two-speed launch prototype at `prototype/launch-vertical` commit `3df7bdc`, especially `src/vertical/DESIGN-RATIONALE.md`.

The following inputs are treated as fixed for this draft:

- the nine Launch Phases and their Phase Deliverables;
- Chat with Pi as the primary completion surface;
- one Operator Session per Launch Phase;
- the compact default sidebar shows the current Exit Gate and Decision Records recognized from chat;
- Activity, Changes, and Evidence are opened on demand;
- every Gate Check has a human-verifiable Control Point;
- Gate Checks are computed from evidence and cannot be manually marked satisfied;
- Application Profiles interpret the checks but do not add, remove, rename, or redefine them per application.

Anything marked with a U-code remains unresolved. A check may depend on the eventual answer, but this document does not choose that answer.

## Proposal: variable-size Exit Gates

This draft proposes **N Gate Checks per phase**, rather than exactly three.

A Gate Check should contain one independently falsifiable claim with one primary verification path. Exactly three checks forced unrelated claims together, made partial failure hard to represent, and contributed to the contradictory authored progress identified in acceptance finding F-3.

The proposed gates contain between three and six checks. Only the current phase's checks are visible by default, so this does not create a forty-item launch checklist in the primary UI.

| Phase | Deliverable | Proposed checks |
| --- | --- | ---: |
| 1. Start | Launch Brief | 5 |
| 2. Understand | Application Contract | 4 |
| 3. Conform | Conformance Result | 3 |
| 4. See the launch | Launch Plan | 4 |
| 5. VPS | Host Record | 4 |
| 6. Domain | Domain Route | 5 |
| 7. Operations | Operational Baseline | 5 |
| 8. Go live | Verified Release | 6 |
| 9. Handoff | Operations Handoff | 4 |

## Uniform Gate Check contract

Every Gate Check has the same product-level shape:

| Field | Meaning |
| --- | --- |
| **Check ID and statement** | Stable identity and one observable claim. |
| **Applicability interpretation** | How the selected Application Profile evaluates the same check for this application. A profile may prove that a responsibility is absent; it may not delete the check. |
| **Current result** | **Satisfied** or **Unsatisfied**. An unsatisfied result carries a reason such as missing input, waiting, blocked, failed, missing evidence, or stale evidence. |
| **Evidence References** | Current evidence supporting or refuting the claim. Each reference identifies source, observation time, collection method, raw result, artifact identity when available, and limits. |
| **Observability targets** | Real destinations a human can open: repository revision, pull request, provider console object, server session, raw probe, evidence artifact, or the originating Decision Record. |
| **Re-verification** | A way to run the check again against current sources. Re-verification appends a new Observation; it does not overwrite the previous one. |
| **Dependencies** | Decision Records, source identities, product policies, or other Gate Checks whose changes make the result stale. |

### Result rules

- An Exit Gate is satisfied only when every Gate Check in it is currently **Satisfied**.
- A check is **Satisfied** only when current evidence supports its predicate and no relevant dependency has changed since that evidence was collected.
- Missing, refuting, unavailable, or stale evidence makes the check **Unsatisfied**. The reason remains visible.
- “Not applicable” is not a hidden third result. The Application Profile must provide evidence that the responsibility does not apply; that evidence can satisfy the same check.
- Pi may explain evidence, investigate an unsatisfied check, and recommend a resolution. Pi's statement is not proof that the check is satisfied.
- A Decision Record may change the source used by a check, but it does not directly change the result. The check must be re-run.
- The exact general mechanism for material-change detection and evidence freshness remains a specification gap identified by F-7. Each check below names the source changes that must invalidate it without choosing a universal hashing or time-to-live policy.

### Observability-link contract

Every check's default sidebar row exposes one quiet **Details** link. Details must provide:

1. the check's definition and why it matters;
2. the current result and unsatisfied reason;
3. the Evidence References used now, including raw result, source, method, time, identity, and limits;
4. at least one real observability target when the underlying system has one;
5. **Ask Pi**, **Open source**, and **Re-run check** paths;
6. no manual “mark satisfied” or result override.

An observability target is a runtime link, not documentation prose. Product documentation may explain the rule, but it cannot substitute for the current repository, provider, host, or public Observation supporting the result.

## Phase 1 — Start

**Phase Deliverable:** **Launch Brief** — application identity, repository, target environment, Approval Mode and authority context, operating intent, and known prerequisites.

### P1.G1. Application identity recorded

- **Satisfied when:** A stable Application record exists with the engineer-recognized application name and ownership context. It is unambiguously the application being launched.
- **Evidence:** Application-record creation receipt plus the originating user input or Decision Record.
- **Human observability:** Open **Operator Record → Launch Brief → Application identity**; open the originating message in the Start Operator Session.
- **Invalidated by:** Changing the selected application or replacing the Application record.

### P1.G2. Repository is readable at a recorded identity

- **Satisfied when:** Server Guy can read the selected repository and records its provider, owner, repository name, default branch, and inspected revision without requiring write access.
- **Evidence:** Fresh repository-access Observation, returned repository metadata, inspected commit SHA, and observed credential scope.
- **Human observability:** Open the repository at the inspected revision in GitHub; open the raw repository-access probe; open the GitHub integration scope.
- **Profile interpretation:** The profile may select which repository paths to inspect later, but readability and repository identity are stack-independent.
- **Invalidated by:** Repository selection, installation/access scope, default branch, or inspected revision changing.

### P1.G3. Target environment is explicit

- **Satisfied when:** The intended Environment and its purpose are recorded, and the engineer can distinguish it from any other environment.
- **Evidence:** Environment record plus the originating Decision Record.
- **Human observability:** Open **Operator Record → Launch Brief → Environment** and its originating chat decision.
- **Invalidated by:** Selecting a different Environment or changing the application's environment association.

### P1.G4. Approval Mode and authority context are explicit

- **Satisfied when:** The selected Approval Mode, its effective scope, and the provider/repository capabilities currently available to Server Guy are recorded without implying broader authority than the integrations provide.
- **Evidence:** Approval Mode Decision Record, authority-context snapshot, and redacted integration-scope Observations.
- **Human observability:** Open the Approval Mode decision and origin; open **Integrations/Credentials → effective scopes**; open the relevant provider authorization page when available.
- **Open dependency:** **U5** determines the permitted scope model for Approval Mode. This check requires the effective scope to be explicit but does not choose application-only, per-Release/per-Incident, or override semantics.
- **Invalidated by:** Approval Mode, effective scope, credential scope, or connected account changing.

### P1.G5. Operating intent and known prerequisites are explicit

- **Satisfied when:** The Launch Brief records the engineer's material operating intent and every prerequisite currently known to be required is either available or represented by a precise Blocker with an owner and next resolution path.
- **Evidence:** Launch Brief artifact, Decision Records recognized from chat, prerequisite Observations, and any Blocker records.
- **Human observability:** Open the Launch Brief; jump to each originating chat decision; open the affected integration or source for each prerequisite.
- **Invalidated by:** Revising operating intent, discovering a new material prerequisite, or resolving/invalidating a prerequisite Observation.

## Phase 2 — Understand

**Phase Deliverable:** **Application Contract** — the app-level agreement describing build, runtime, health, persistence, configuration, observability, and verification requirements with provenance and explicit gaps.

### P2.G1. Application Profile resolution is conclusive and supported

- **Satisfied when:** The repository resolves to one supported Application Profile with an explicit profile identity and version. Unsupported or ambiguous resolution remains Unsatisfied with a Blocker; recording the mismatch alone does not make the launch eligible to advance.
- **Evidence:** Profile-resolution report, matched and rejected profile criteria, repository Observations, and profile identity.
- **Human observability:** Open the profile-resolution report; open the profile specification; open each cited repository file or manifest at the inspected revision.
- **Open dependency:** **U2** determines whether V1 exposes one or two supported profiles. The check itself remains unchanged; supporting two profiles adds a real ambiguity path rather than redefining the check.
- **Invalidated by:** Repository revision, profile definition/version, or profile-selection Decision Record changing.

### P2.G2. Every material Application Contract field is represented

- **Satisfied when:** Every material field required by the selected Application Profile exists in the Application Contract, including an explicit unknown or gap rather than silent omission.
- **Evidence:** Versioned Application Contract artifact plus schema-validation result against the selected profile.
- **Human observability:** Open the Application Contract grouped by build, runtime, health/readiness, persistence, migrations, configuration/secrets, logs/telemetry, backup, and verification; open the governing profile field definition.
- **Open dependency:** **U16** affects the required migration-compatibility and rollback fields. Until U16 is resolved, those fields must remain visibly unresolved rather than defaulted.
- **Invalidated by:** Contract schema, profile version, or material repository facts changing.

### P2.G3. Every material field carries provenance

- **Satisfied when:** Each material Application Contract value is labeled as repository-declared, profile-derived, user-confirmed, provider-observed, or unresolved, and links to the source that produced it.
- **Evidence:** Contract provenance map and Evidence References for inferred or observed values; Decision Records for user-confirmed values.
- **Human observability:** Open any contract field to its repository line, profile rule, raw Observation, or originating chat decision.
- **Invalidated by:** Any source value, source identity, or field origin changing.

### P2.G4. No required contract gap remains unresolved

- **Satisfied when:** Every required field has a valid value and every incompatibility is resolved. Unknown, unsupported, or contradictory required fields produce explicit Conformance Blockers and keep this check Unsatisfied.
- **Evidence:** Contract validation report and bounded gap list, each tied to the affected field and source evidence.
- **Human observability:** Open the gap report; open the affected contract field and repository source; ask Pi to explain or propose conformance work.
- **Open dependency:** **U3** determines whether explicit engineer confirmation of the initial Application Contract is additionally required before paid work. This check does not treat silence as confirmation or choose mode-specific confirmation behavior.
- **Invalidated by:** Application Contract, profile, repository revision, or a gap-resolution source changing.

## Phase 3 — Conform

**Phase Deliverable:** **Conformance Result** — one exact eligible repository revision and evidence that all required profile checks pass for it.

### P3.G1. Exact candidate revision is identified

- **Satisfied when:** One immutable repository commit is recorded as the conformance candidate. If a pull request was needed, this is the merged target revision rather than only an unmerged head.
- **Evidence:** Git commit identity, branch/ref Observation, and merge receipt when applicable.
- **Human observability:** Open the exact GitHub commit; open the originating pull request and merge event.
- **Invalidated by:** Candidate selection or target branch head changing.

### P3.G2. Required source-controlled changes are resolved

- **Satisfied when:** Every required conformance gap is resolved in the exact candidate revision, no required change remains only local or unmerged, and any returned coding-agent change stays within its bounded brief.
- **Evidence:** Gap-to-diff mapping, pull-request status, changed-file list, independent scope check, and merge result. A timeout, abandoned handoff, or scope violation keeps the check Unsatisfied.
- **Human observability:** Open the pull request, complete diff, changed files, review discussion, and coding-agent evidence separately from Server Guy's checks.
- **Specification dependency:** **G-HANDOFF-TIMEOUT** still requires a defined abandoned/timeout terminal. This draft does not invent one.
- **Invalidated by:** Candidate revision, required-gap set, PR status, or returned diff changing.

### P3.G3. Profile conformance checks pass for the exact candidate

- **Satisfied when:** Every required conformance check defined by the selected Application Profile passes against the exact candidate revision, and the result is current for that revision.
- **Evidence:** Profile-check run identity, per-check output, logs, timestamps, and candidate SHA.
- **Human observability:** Open the GitHub check run or Server Guy check artifact; inspect raw output for every check; open the exact source lines involved.
- **Invalidated by:** Candidate revision, profile version, check definition, or relevant configuration changing.

## Phase 4 — See the launch

**Phase Deliverable:** **Launch Plan** — visible intended topology, expected cost, responsibilities and actions, verification bar, and material risks before external effects begin.

### P4.G1. Target topology is explicit

- **Satisfied when:** The intended relationship between public route, host, runtime services, persistence, and required supporting services is represented without implying that any proposed resource already exists.
- **Evidence:** Versioned Launch Plan derived from the Application Contract and current provider/repository Observations.
- **Human observability:** Open the Launch Plan topology; open each referenced Application Contract field and current provider inventory Observation.
- **Profile interpretation:** The Application Profile supplies service/runtime interpretation; the check and topology categories remain stable across stacks.
- **Invalidated by:** Application Contract, selected provider target, hostname intent, or relevant inventory changing.

### P4.G2. Expected external cost is explicit and sourced

- **Satisfied when:** Expected one-time and recurring provider costs, assumptions, region, resource shape, currency, and observation time are visible before paid creation.
- **Evidence:** Provider pricing response or price-list Observation plus the cost calculation used by the Launch Plan.
- **Human observability:** Open the raw price Observation; open the provider's current pricing/calculator page; open the plan's cost breakdown.
- **Invalidated by:** Resource shape, region, provider price, currency assumption, or plan changing.

### P4.G3. Provider, Pi, and engineer actions are separated

- **Satisfied when:** Every known launch action names its intended effect, actor, dependencies, and whether it is read-only, state-changing, paid, user-owned, or waiting on an external system. VPS and domain/DNS work remain distinct.
- **Evidence:** Proposed Operation list and any user-action/Guided Operation records in the Launch Plan.
- **Human observability:** Open the plan's action list; inspect the effect and actor for each item; open the affected provider or account destination without performing the action.
- **Invalidated by:** Plan, actor assignment, operation intent, or authority context changing.

### P4.G4. Verification bar and material risks are explicit

- **Satisfied when:** The Launch Plan names the contract checks, semantic verification categories, known waits, material failure risks, and what evidence will be collected. Unresolved product policy is named rather than silently defaulted.
- **Evidence:** Launch Plan verification section, Application Contract verification fields, and risk/Blocker records.
- **Human observability:** Open each planned check's definition and source; open the risk detail and affected provider/application source.
- **Open dependencies:** **U15** determines mandatory versus Pi-selected verification; **G-STOP-LAUNCH** leaves first-launch failure disposition undefined. Naming these dependencies satisfies transparency but does not resolve them.
- **Invalidated by:** Verification requirements, risk evidence, Application Contract, or candidate topology changing.

## Phase 5 — VPS

**Phase Deliverable:** **Host Record** — the intended owned machine's identity, actual cost, reachability, and readiness evidence.

### P5.G1. Hetzner account and project access are observed

- **Satisfied when:** Server Guy can read the intended Hetzner account/project and the effective credential scope is sufficient for the planned host work without implying access outside that scope.
- **Evidence:** Fresh provider-auth Observation, project identity, accessible-resource inventory, and redacted scope metadata.
- **Human observability:** Open the Hetzner project in the provider console; open the Server Guy integration-scope detail and raw access probe.
- **Invalidated by:** Credential, provider project, scope, account, or connection status changing.

### P5.G2. Authority for the intended host effect is satisfied

- **Satisfied when:** The current host-creation or host-adoption Operation has authority under the effective Approval Mode and unresolved account-action policy, with expected effect and cost visible beforehand. A denied, absent, or stale authority result keeps the check Unsatisfied.
- **Evidence:** Current Operation intent, Approval Mode and scope, applicable Approval Record or mode evaluation, and the sourced cost/effect shown to the engineer.
- **Human observability:** Open the exact proposal and cost in the VPS chat; open the applicable approval/mode record and origin; inspect what will and will not change.
- **Open dependencies:** **U3**, **U4**, and **U5** determine confirmation, user-only actions, and mode scope. This check does not choose their outcomes.
- **Invalidated by:** Machine shape, region, expected cost, provider project, Operation intent, Approval Mode/scope, or applicable policy changing.

### P5.G3. Exactly one intended host exists and its identity and actual cost are recorded

- **Satisfied when:** Fresh provider inventory reconciles the intended host to exactly one provider resource, including provider ID, name, region, machine shape, network identity, lifecycle state, and actual recurring price. Duplicate or orphan candidates keep the check Unsatisfied.
- **Evidence:** Durable Operation record written before the effect, idempotency/reconciliation identity, provider receipt, and fresh provider inventory Observation.
- **Human observability:** Open the server resource in the Hetzner console; open the raw creation/import receipt; open the current inventory comparison.
- **Specification dependency:** F-1 requires a complete Operation lifecycle and resume/reconciliation rule. This is specification debt, not a U1-U16 choice.
- **Invalidated by:** Provider inventory, intended Operation identity, machine resource, or pricing changing.

### P5.G4. Host readiness is verified

- **Satisfied when:** The recorded host is reachable through the intended administration path and passes the non-application readiness checks required to accept operational setup, such as OS identity, network access, storage availability, and required base capabilities.
- **Evidence:** Server-session connection result, command outputs, host facts, and readiness probe artifact tied to the Host Record identity.
- **Human observability:** Open the live or recorded server session; inspect raw readiness commands and outputs; open the Hetzner networking view.
- **Invalidated by:** Host replacement, host image, network identity, readiness requirements, or fresh readiness result changing.

## Phase 6 — Domain

**Phase Deliverable:** **Domain Route** — authoritative hostname, DNS route, HTTPS state, and external observations.

### P6.G1. Intended public hostname is recorded

- **Satisfied when:** One intended public hostname is recorded as a Decision Record and associated with this Environment. A proposed alternative during conflict resolution does not replace it until the decision changes.
- **Evidence:** Hostname Decision Record and its originating chat context.
- **Human observability:** Open **Operator Record → Domain Route → Intended hostname** and jump to the originating Domain chat decision.
- **Invalidated by:** Hostname or target Environment changing.

### P6.G2. Authoritative domain control is observed

- **Satisfied when:** External DNS observations and provider state show that the relevant zone is authoritative under the intended Cloudflare account. User reports or an initiated nameserver change alone are insufficient.
- **Evidence:** Public NS/SOA observations from independent resolvers, Cloudflare zone identity/status, observation times, and raw DNS results.
- **Human observability:** Open the Cloudflare zone; open registrar nameserver configuration when relevant; open each raw NS/SOA probe.
- **Invalidated by:** Zone, registrar delegation, Cloudflare account, or newer authoritative DNS observations changing.

### P6.G3. Public DNS resolves the hostname to the intended route

- **Satisfied when:** Fresh external resolver observations return the expected route for the intended hostname and it maps to the current Host Record or approved fronting resource.
- **Evidence:** DNS-record change receipt, Cloudflare record snapshot, multi-resolver DNS observations, and expected-target comparison.
- **Human observability:** Open the exact Cloudflare DNS record; open the raw resolver results; open the related Host Record/network identity.
- **Invalidated by:** Host Record network identity, DNS record, proxy mode, hostname, or newer resolver observations changing.

### P6.G4. Valid HTTPS is observed externally for the intended hostname

- **Satisfied when:** An external client reaches the intended hostname over HTTPS and observes a valid certificate for that hostname plus the expected HTTP/TLS behavior.
- **Evidence:** Raw TLS handshake and HTTPS probe including hostname, chain/result, endpoint, method, timestamp, and response summary.
- **Human observability:** Open the raw TLS/HTTPS probe artifact; open the Cloudflare certificate/edge view and the origin/server TLS destination when applicable.
- **Open dependency:** F-8 requires the TLS termination model to be settled. This check remains stable regardless of where termination occurs.
- **Invalidated by:** Hostname, DNS route, certificate state, TLS configuration, or newer external probe changing.

### P6.G5. No unresolved conflict or propagation wait remains

- **Satisfied when:** Current observations show no collision with unrelated DNS service and no unresolved propagation, delegation, or certificate wait blocks the intended route. A known conflict or pending wait remains Unsatisfied with a precise Blocker and safe options.
- **Evidence:** Before/after DNS record comparison, public resolver timeline, conflict analysis, and related Blocker resolution evidence.
- **Human observability:** Open the Cloudflare DNS table and change history; open conflicting record targets; inspect the sequence of appended public observations.
- **Invalidated by:** DNS records, conflict resolution, delegation, certificate state, or fresh public observations changing.

## Phase 7 — Operations

**Phase Deliverable:** **Operational Baseline** — runtime, configuration/secrets, persistence protection, observability, and external observation responsibilities with evidence.

### P7.G1. Required runtime services are ready and managed

- **Satisfied when:** Every runtime service required by the Application Contract is installed/configured, running in the intended topology, and addressable by the operational tools Server Guy will use. The same check may be satisfied by a profile proving that a service category is absent.
- **Evidence:** Runtime/service inventory, configuration identity, service status outputs, and profile-to-service mapping.
- **Human observability:** Open the server session and service manager/container view; inspect service configuration and raw status output.
- **Profile interpretation:** The Application Profile maps its web, worker, database, and supporting processes into this fixed responsibility.
- **Invalidated by:** Application Contract, runtime configuration, host identity, service inventory, or fresh status changing.

### P7.G2. Configuration and secret responsibilities are resolved

- **Satisfied when:** Every required configuration and secret is present in the intended source, ownership is explicit, no required value is unresolved, and evidence is redacted rather than leaking secret values.
- **Evidence:** Redacted configuration validation, secret metadata/identity, missing-value report, and ownership records.
- **Human observability:** Open the configuration source and redacted secret metadata; open the raw validation result; never expose the secret value in the Evidence Reference.
- **Invalidated by:** Application Contract, configuration source, secret identity/version, or validation result changing.

### P7.G3. Persistence-protection responsibility is satisfied

- **Satisfied when:** The Application Profile and Application Contract establish whether persistent application data exists. If it does, the backup and restore-verification bar required by the eventual product policy is met; if it does not, current evidence supports that absence.
- **Evidence:** Persistence inventory, database identity when applicable, backup receipt/artifact, restore proof when required, or profile-backed no-persistence evidence.
- **Human observability:** Open the database/server session; open the backup artifact in its actual storage destination; open the raw restore-verification report or the evidence supporting no persistence.
- **Open dependencies:** **U1** decides the minimum backup/restore bar before “live”; **U16** defines migration and rollback expectations. Backup storage backend remains unresolved and is not invented here.
- **Invalidated by:** Application Contract, persistence topology, database identity, backup artifact, restore policy/evidence, or profile changing.

### P7.G4. Required logs and telemetry channels are reporting

- **Satisfied when:** Every logging/telemetry channel required by the Application Contract and eventual U1 policy has produced fresh, attributable data for the intended application/environment, and Server Guy can retrieve it for diagnosis.
- **Evidence:** Ingestion/query observations, sample redacted log/trace/metric records, application/environment correlation fields, and evidence age.
- **Human observability:** Open the actual log/telemetry viewer or storage query; inspect the raw sampled event and retrieval result.
- **Open dependency:** **U1** determines the minimum required channel set. The Gate Check remains fixed while the required set is policy- and profile-interpreted.
- **Invalidated by:** Required-channel policy, telemetry configuration, application/release identity, ingestion health, or evidence freshness changing.

### P7.G5. External observation and its ownership are active

- **Satisfied when:** An external observer is configured for the intended public contract, produces current observations, has an explicit owner, and exposes whether the observer itself is live rather than treating silence as health.
- **Evidence:** Sentinel/observer configuration, raw public probe, latest successful/failed observation, heartbeat or equivalent liveness evidence, and ownership record.
- **Human observability:** Open the external observer's status/configuration; open the raw public probe and its timestamp; open the liveness/heartbeat evidence.
- **Open dependencies:** **U1** determines whether this is mandatory before “live”; **U6** determines the always-on owner and alert behavior; **G-SENTINEL-WATCHDOG** still needs a staleness threshold and consequence of silence.
- **Invalidated by:** Intended hostname, public contract, observer configuration/owner, liveness policy, or fresh observation changing.

## Phase 8 — Go live

**Phase Deliverable:** **Verified Release** — one exact revision and configuration supported as live by current external contract and semantic evidence.

### P8.G1. Exact Release candidate is identified and eligible

- **Satisfied when:** One immutable candidate ties repository revision, build/package identity, deployment configuration, and Conformance Result together, and no newer material source change has made it ineligible.
- **Evidence:** Commit SHA, build/check result, image/package digest or equivalent artifact identity, configuration identity, and candidate record.
- **Human observability:** Open the exact GitHub commit and checks; open the build/package artifact in its real registry; open the Release candidate detail.
- **Open dependency:** F-8 requires build ownership/location to be settled. The identity requirement remains the same for either build architecture.
- **Invalidated by:** Revision, artifact digest, configuration, Conformance Result, or build eligibility changing.

### P8.G2. Migration and rollout preconditions are resolved

- **Satisfied when:** Every pre-deployment condition declared by the Application Contract is met for the exact candidate, including the migration/compatibility and recovery preparation required by the eventual U16 policy.
- **Evidence:** Preflight report, migration inventory/plan when applicable, compatibility result, required backup/restore evidence, and candidate identity.
- **Human observability:** Open migration files and plan in the repository; open preflight output; open the affected database/server session and relevant recovery artifact.
- **Open dependency:** **U16** determines the required migration compatibility and rollback expectation. Until resolved, this check cannot silently assume either forward-only or rollback-safe behavior.
- **Invalidated by:** Candidate, migration set, database state, Application Contract, or recovery evidence changing.

### P8.G3. Candidate is deployed and reconciled on the intended host

- **Satisfied when:** Fresh host observations show the exact candidate artifact and configuration running in the intended topology, with the deployment Operation reconciled to its actual outcome. “Command returned success” alone is insufficient.
- **Evidence:** Deployment Operation record/receipt, server process or container identity, configuration identity, and fresh host inventory/status.
- **Human observability:** Open the server session; inspect deployment logs and current process/container identity; compare them with the candidate record.
- **Invalidated by:** Host identity, deployed artifact/configuration, runtime state, or deployment reconciliation changing.

### P8.G4. Contract checks pass through the intended HTTPS hostname

- **Satisfied when:** Every required public contract check runs from outside the host against the intended HTTPS hostname and currently passes. IP-only, localhost-only, and container-running checks cannot satisfy it.
- **Evidence:** Per-check raw external probe results, request/response summaries, timestamps, source locations, and intended hostname/candidate identity.
- **Human observability:** Open each raw probe artifact and external check run; open the intended public URL where safe.
- **Invalidated by:** Candidate, public hostname, DNS/HTTPS route, contract check definition, or fresh probe result changing.

### P8.G5. Required semantic checks pass

- **Satisfied when:** The semantic verification set required by the eventual U15 policy runs through the public route against the exact candidate and all required results pass. Pi may explain or add investigation, but model-authored confidence is not evidence.
- **Evidence:** Semantic scenario definitions, execution identity, raw results/traces, timestamps, candidate identity, and any created test-data cleanup record.
- **Human observability:** Open each semantic scenario definition and raw run; inspect relevant application logs/traces and resulting test data when safe.
- **Open dependency:** **U15** decides which checks are mandatory versus Pi-selected and the exact bar for declaring a Release healthy. This document preserves the check without choosing the set owner.
- **Invalidated by:** Candidate, semantic-check set, application data preconditions, route, or fresh result changing.

### P8.G6. Current Release and launch-time drift are recorded honestly

- **Satisfied when:** The exact verified candidate is recorded as current only after the applicable verification checks pass, and every direct live-environment mutation is either represented by the Release/configuration identity or recorded as an Out-of-band Change with scope and reconciliation status.
- **Evidence:** Release promotion record, links to P8.G4/P8.G5 evidence, deployment/configuration identity, and drift/Out-of-band Change inventory.
- **Human observability:** Open the current Release; open **Changes** for the release-to-live comparison; open every Out-of-band Change and affected server/configuration source.
- **Specification dependency:** **G-LAUNCH-DRIFT** is treated as missing specification, not an owner option. **G-STOP-LAUNCH** remains unresolved when P8.G4 or P8.G5 fails on a first launch.
- **Invalidated by:** Release promotion, verification evidence, live configuration, host mutation, or drift reconciliation changing.

## Phase 9 — Handoff

**Phase Deliverable:** **Operations Handoff** — current topology, Release, health evidence, cost, responsibilities, gaps, and active observation available in the normal application workspace.

### P9.G1. Current topology and resource inventory are assembled

- **Satisfied when:** The Operator Record links the current Environment, Host Record, Domain Route, runtime/persistence resources, connected providers, and current cost facts without conflicting identities.
- **Evidence:** Cross-record identity validation plus fresh provider/host inventory Observations.
- **Human observability:** Open each underlying provider resource, server session, Domain Route, and inventory comparison from the handoff view.
- **Invalidated by:** Any linked resource identity, provider inventory, topology, or current cost changing.

### P9.G2. Launch and current Release evidence are assembled

- **Satisfied when:** The handoff Evidence Bundle contains or references every Phase Deliverable, current Gate Check result, current Release identity, required verification evidence, and known missing-evidence state with source attribution and redaction.
- **Evidence:** Immutable or content-addressed Evidence Bundle manifest plus validation that its references resolve.
- **Human observability:** Open the bundle manifest; open each referenced contract, receipt, check, raw probe, and artifact at its source.
- **Open dependency:** **U15** determines the exact Release-health evidence bar; the bundle must reflect that eventual policy rather than invent it.
- **Invalidated by:** Referenced artifact identity, required evidence set, redaction result, or current Release changing.

### P9.G3. Gaps, ownership, costs, and drift are visible

- **Satisfied when:** Every accepted gap, unresolved responsibility, Blocker, Out-of-band Change, and continuing cost has an explicit owner, status, impact, and next review/resolution path. Nothing is hidden by a generic “complete” status.
- **Evidence:** Decision Records for accepted gaps, Blocker records, responsibility assignments, provider cost Observations, and Out-of-band Change records.
- **Human observability:** Open each item from the handoff summary to its originating chat decision, affected source/resource, evidence, and re-verification path.
- **Open dependency:** **U1** determines which operational gaps may coexist with “live.” This check requires visibility and ownership but does not decide which gaps are acceptable.
- **Invalidated by:** Gap acceptance/ownership, blocker status, cost evidence, or drift state changing.

### P9.G4. Ongoing observation is currently verifiable

- **Satisfied when:** The normal application workspace receives fresh external observations for the intended public contract and exposes the observer's own liveness. A previous successful probe without current observer liveness is insufficient.
- **Evidence:** Latest external Observation, observer configuration, heartbeat/liveness evidence, freshness evaluation, and application/environment identity.
- **Human observability:** Open the observer/sentinel status; open the latest raw probe and observation timeline; open the rule governing freshness once defined.
- **Open dependencies:** **U1**, **U6**, and **G-SENTINEL-WATCHDOG** determine the mandatory observer, owner, staleness bound, and consequence of silence.
- **Invalidated by:** Observer configuration/owner, hostname, public contract, freshness policy, liveness evidence, or latest observation changing.

## One Operator Session per phase

Each Launch Phase has exactly one Launch Operator Session. Chat is where the engineer and Pi work toward the current Gate Checks; it is not the durable source of truth for completed work. Other application conversations are outside this journey and do not become additional chats for the phase.

When every Gate Check in the current Exit Gate becomes Satisfied, Server Guy performs one visible phase transition:

1. finalize the Phase Deliverable and its version/identity;
2. persist the Gate Check results and their Evidence References in the Operator Record;
3. persist recognized Decision Records, current facts, Blockers, Operations, and unresolved product dependencies;
4. archive the completed phase's Operator Session without deleting its conversation or Session Events;
5. open a fresh Operator Session for the next Launch Phase;
6. seed Pi from the Operator Record, not from the archived conversation transcript;
7. let Pi's first message name the new Phase Deliverable, summarize inherited facts/decisions, and identify the first unsatisfied Gate Checks.

The archived session remains available for provenance. Its transcript is not injected wholesale into the next phase. Phase 9 ends by archiving the Handoff session and entering the normal application workspace rather than creating a tenth Launch Phase.

If durable recording or new-session creation fails, the phase transition must not present the next phase as active. The current completed session remains resumable until the transition is reconciled.

## Default sidebar and deeper inspection

The default sidebar for the current phase contains only:

- the Phase Deliverable name and concise meaning;
- every current Gate Check with Satisfied/Unsatisfied status and unsatisfied reason;
- evidence age when it materially affects the result;
- Decision Records recognized from the current phase chat;
- one **Details** link on every check and decision.

One level deeper:

- **Activity** shows what happened in this Operator Session, including Pi's visible intent, tool calls, observations, waits, approvals, and outcomes;
- **Changes** shows proposed and actual external/repository changes, including rejected effects and Out-of-band Changes;
- **Evidence** shows the source-attributed proof behind claims and Gate Checks, with raw results and observability targets.

The deeper surfaces may be dense and engineer-oriented. The default view should not duplicate them.

## U1-U16 preservation matrix

No U-code is answered by this draft.

| ID | Effect on these Exit Gates |
| --- | --- |
| **U1** | Determines the minimum policy interpreted by P7.G3-P7.G5 and P9.G3-P9.G4 before “live.” |
| **U2** | Determines the number of supported profiles evaluated by P2.G1; it does not change the Gate Check list. |
| **U3** | Affects contract-confirmation authority before paid work and therefore P5.G2; no mode behavior is chosen here. |
| **U4** | Affects whether P5.G2 can be satisfied without user action for paid/account operations in Full Autonomy. |
| **U5** | Affects P1.G4 and P5.G2 by defining Approval Mode scope and freshness behavior. |
| **U6** | Affects P7.G5 and P9.G4 by defining the always-on observation/notification owner. |
| **U7** | Does not change Journey 01's Gate Check list; it affects what may happen during later offline recovery. |
| **U8** | Does not change the checks; it affects how an External Agent Client reaches their Control Points. |
| **U9** | Does not change the checks; it affects who may use direct takeover paths to alter provider/configuration state. |
| **U10** | Does not change first-launch checks; it affects how later candidate Releases are created. |
| **U11** | Does not change the checks; it affects later merge/deploy/repair/rollback authority and may constrain authority evaluation. |
| **U12** | Does not change first-launch checks; it affects later rollback representation. |
| **U13** | Does not change P3.G1-P3.G3; it determines whether MCP/Remediation PR is required in the V1 demonstration. |
| **U14** | Does not change Application Launch; it governs later Incident Case closure. |
| **U15** | Determines P4.G4, P8.G4-P8.G5, P9.G2, and the exact healthy/verified evidence bar. |
| **U16** | Determines P2.G2, P7.G3, and P8.G2 migration/rollback requirements. |

## Remaining specification gaps surfaced by this draft

These are not new product-owner choices and are not silently resolved here:

- **Operation lifecycle and resumption (F-1):** needed before P5.G3 can safely prove one paid resource after interruption.
- **Gate dependency and freshness mechanism (F-7):** each check names invalidating sources, but the shared mechanism still needs definition.
- **TLS and build ownership (F-8):** P6.G4 and P8.G1 remain stable while the architecture choice stays open.
- **Pi/model unavailable experience (G-PI-DOWN-UX):** each phase needs an honest blocked/degraded state without losing Control Points.
- **Coding handoff timeout/scope violation (G-HANDOFF-TIMEOUT):** affects P3.G2.
- **Sentinel watchdog (G-SENTINEL-WATCHDOG):** affects P7.G5 and P9.G4.
- **Launch-time drift (G-LAUNCH-DRIFT):** affects P8.G6 and P9.G3.
- **First-launch failure disposition (G-STOP-LAUNCH):** affects what happens while P8.G4 or P8.G5 remains Unsatisfied.

## Review question for the next workshop pass

Should we accept the proposed rule of one independently falsifiable claim with one primary verification path per Gate Check, allowing three to six checks per phase, or force a smaller fixed count and merge some of these claims?
