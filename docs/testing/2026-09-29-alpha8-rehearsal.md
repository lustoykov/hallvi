# Alpha.8 candidate verification — 29 September 2026

The signed candidate is `0.1.1-alpha.8`, revision `48927a1417659448d249ee31f07bd868ec451add`, prepared in [PR #254](https://github.com/lustoykov/hallvi/pull/254). Product code is identical to merged performance PR #252 at `a81b6953ed3d3929393382662640e56a1ca5cd7c`; only package/lockfile versions and the changelog differ. The candidate is a draft. Published latest remains alpha.7.

## Native packages and clean installations

[Build/signing run](https://github.com/lustoykov/hallvi/actions/runs/36583816133) and [installation verification run](https://github.com/lustoykov/hallvi/actions/runs/36584552922) both passed for macOS arm64 and Ubuntu 24.04 x64.

The install run downloaded the exact draft assets and verified the manifest signature, source revision, archive size and SHA-256 before installing the archive. Both service and Pi worker reached running state, and cleanup stopped the test service. This verifies clean installation, not upgrading an existing installation or reboot persistence. The coordinator also independently checked the manifest signature with the public key shipped in the repository.

| Package | Bytes | SHA-256 |
| --- | ---: | --- |
| `hallvi-0.1.1-alpha.8-darwin-arm64.tgz` | 237,373,184 | `8ef203515ac14e28e4cdf7883c334e5d7ac8d178b5511f748a5e9aa21e5e1eab` |
| `hallvi-0.1.1-alpha.8-linux-x64.tgz` | 289,637,853 | `2f2489473d4171daba1c1a10e5cedc38c3d25325ff8696395b8d3afb6cb042b4` |

## Deeper local packaged-runtime rehearsal

A separate archive built from exact merged `a81b6953` ran on native macOS arm64 using bundled Node 22.23.2. It was unpacked outside the checkout, with synthetic controller records and an empty model account. It did not use application TypeScript sources or checkout dependencies. The local archive has alpha.7 in its filename; it is not the published alpha.7 artifact or the signed alpha.8 candidate.

- Web and Pi became ready in 2,404 ms; restart took 1,393 ms. These are single-run observations.
- Web-created application/main/side-chat records, Always ask mode and synthetic saved information survived restart.
- Startup recovery marked a seeded unfinished execution interrupted while preserving its output; packaged CLI and web snapshots agreed.
- The shipped database worker loaded, performed writes and closed cleanly. Final SQLite schema was 18 and `quick_check` returned `ok`.
- Without a model account, execution was refused; no real model or remote command ran.
- Both runtime shutdowns completed, fixture state was removed and ports 3932/3933 were free.

The local report and reproduction harness remain under the package task's ignored `work/post-merge-package-a81b6953/`. Two initial harness assumptions were corrected (tsx is a production dependency; the CLI exposes a public setup error). Neither required a product change.

## First-application rehearsal

The existing `onboarding-first-app.spec.ts` passed against merged product code on Node 22.23.2/macOS arm64, with a disposable fixture at port 3796. Connecting the scripted ChatGPT account created no message. Explicitly choosing Read repository sent exactly one inspection request, whose scope excluded deployment, and reload did not duplicate it. Narrow-screen reachability checks also passed. This used a scripted login/model; it does not prove live account authentication or repository understanding. The fixture process stopped and its port was free afterward.

## Retained histories and live updates

The production-mode merged revision ran against a credential-free copy of four retained applications: four conversations, approximately 22 MB of Pi history, and 174 execution records. Two histories originated in Pi 0.85.1; the candidate uses Pi 0.87.1. All four loaded. These are copies, not a live retained attachment; provider/model access was unavailable.

Chromium used a 1440 × 1000 viewport and separate contexts for 1, 5 and 10 clients, cycling across the four applications. This is not ten distinct large application histories. Browser pages showed 9–19 message elements; the fixture does not establish performance for thousands of rendered messages.

| Measurement | Observed result |
| --- | --- |
| Initial complete chat HTTP reads | 32–643 ms |
| Warm complete chat HTTP reads | 24–67 ms |
| First browser ready (initial snapshot and composer) | 1,196 ms |
| Subsequent browser openings in the initial run | 254–452 ms |
| Two reloads of the first chat | 294 / 245 ms |
| Browser errors / observed long tasks during initial openings | None |
| 1 / 5 / 10 clients, about 17 seconds idle each | No new SSE snapshot frames; corrected counters observed zero synchronous/async history and execution content reads, execution directory scans and version checks |
| Ten concurrent HTTP readers, five warm waves | Wave median 471 ms, max 538 ms; approximately 8.63 MB returned per wave |
| Unrelated host requests during ten-reader waves | Median 12 ms, p95 19 ms, max 38 ms |

The original file counters covered only asynchronous/stream reads. That gap was caught during coordinator review, synchronous wrappers were added, and the idle windows were repeated. Counts measure instrumented filesystem calls rather than physical disk I/O. The measurements are local, with an uncontrolled OS cache; they are not production SLAs or a paired pre-change comparison.

The web event loop had a **687 ms maximum delay during the first browser opening** in the initial run, versus 14–23 ms maxima during the idle windows. A separate cold-navigation CPU profile with histories warmed showed substantial ESM/CommonJS loading, module-source reads and compilation. This supports cold module loading as a contributor, but does not fully attribute the original spike or prove it is harmless. The profiled navigation itself took 4.17 seconds with instrumentation and is not comparable to the unprofiled browser timing above. No product optimization was added during this verification.

Three focused disposable browser journeys passed, reusing existing assertions with scratch timing instrumentation:

- A Next route mutation reached the correctly scoped subscribers; worker loss/reconnect recovered without idle snapshot polling.
- In Always ask, the CLI request stayed blocked without executing its marker until approved. Both browser pages cleared the card within 935 ms of approval; the observing page showed completion within 3.63 seconds.
- Worker loss appeared within 2.57 seconds. After restart, interrupted work appeared within 8.15 seconds and remained stopped until Continue. These are fixture observations, not guaranteed deadlines.

The mutation/restart journeys used installed Pi packages with scripted model responses. They did not execute real provider work. The copied-history screenshot and raw profiles remain local because retained history can be private; only aggregate measurements are included here.

## Beta boundary

No provider deployment or installed-service upgrade was performed. A dedicated test server has not been selected for the live rehearsal. The full [beta walkthrough](../beta-walkthrough.md) requires a fresh user to deploy a useful application, verify stored application data after refresh/restart, and report friction. Agent fixture checks do not complete that acceptance step.
