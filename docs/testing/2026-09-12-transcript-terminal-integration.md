# Transcript and terminal integration — 12 September 2026

PRs #56, #58, #59 and #60 are merged into main. Integration candidate: `3f85046e8eb7fbba82720b1c5c82102a2bde8c8c` (the final merge has the same application tree as the tested candidate).

## Corrections

- SDK completion preserves an executor-set decline instead of replacing it with success.
- A live draft appears once, after preceding calls. Completed tool-only transcripts retain their saved final answer.
- Docker output is parsed incrementally, including split headers and UTF-8 characters, with bounded retained data. A synthetic Docker Engine response proves partial output arrives before the final result.
- Terminal tickets require the exact application origin. Changing or removing the saved target closes the existing shell. Late socket events and setup failures settle the panel correctly.
- Transcript labels say Command / not run rather than claiming a declined command ran. The quieter grouping, running indicators and inline Stop control are retained.

## Verification

Node 22 in an isolated checkout; disposable browser databases and synthetic GitHub/model responses. No real credentials or application data were copied into these fixtures.

- 429 unit/integration tests passed; one optional real-Docker test skipped. The completed-transcript fallback was then covered by the nine passing chat-recovery tests.
- Lint passed with one existing React hook warning in the architecture prototype. Production build and its TypeScript check passed.
- All six browser smoke cases passed on the combined implementation. Focused transcript/reload/mobile/no-host terminal and durable acceptance/cancel/retry cases also passed.
- Final isolated browser rerun: SSE acceptance and streaming output both passed (2/2). Output checks cover updates before completion, preserving scroll position, follow-latest, copy, narrow screens, reload and failed output. An earlier concurrent run timed out during application creation before reaching SSE; it is not recorded as a clean nine-case run.
- Native node-pty execution was exercised locally. SSH argument policy, target invalidation and exact-origin enforcement have focused tests; this integration pass did not open a live SSH terminal on the Hetzner host or redeploy an application.

## Remaining test limits

The exploratory full browser run was stopped after identifying historical cases that still expect the retired History/Decision model and use the removed `propose_decision` tool. It is not fully green. Tests were not deleted or disabled to conceal those failures. Current acceptance commands and the distinction from historical coverage are in `tests/README.md`.

Merging code does not update a running preview worker. The separate Opus preview on port 3385 retains its own checkout and data; no queue rows, credentials, or native session history were edited during integration.
