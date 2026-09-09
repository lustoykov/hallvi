# Recovered controller worker proof — 9 September 2026

A fresh encrypted checkpoint was restored into Linux and its Pi worker completed a real ChatGPT request. The replacement stopped cleanly and the original controller returned to service. This extends the [offline UI and read-only access rehearsal](2026-09-09-controller-recovery-rehearsal.md); it does not prove full controller failover or independent-machine loss recovery.

## Exact candidate and containment

- Application source: clean 8fdddb338c53f1e080b449eec230a2d526c102c3.
- Restic snapshot: e0446a29b650d5b984f5e06c7869bc4fe970329ba5384cc05d3a3b45681dd51e.
- Linux image: sha256:b38fa6fa7d6757ad7af3f0d30a93d74445950843c7e57b29393b0d45766071c6.
- Image built from the Git archive before introducing recovery secrets.
- Same-Mac Docker Desktop container, non-root, private tmpfs state, dropped capabilities, no Docker socket. Network access was enabled for ChatGPT.
- Original web/worker identities and stopped processes were verified, its port was closed, and its worker/deployment locks were held until replacement shutdown. The sidecar locks alone do not fence web, operation or observation processes.
- Only replacement web and runPiWorker ran. Deployment, operation and backup-observation executors stayed stopped. No conformance work was pending.
- The fresh R2 upload/restore roundtrip used the Mac operator tool, then the verified quarantine was copied into Linux. The earlier rehearsal separately proved Linux restic restoration.

The working-copy preparation report was explicitly changed from the offline helper's mode to a controlled networked Pi-worker rehearsal before activation. The selected credential had to be present; disabled environment files stayed disabled. The preserved quarantine passed verification again afterward.

## Verified result

A new rehearsal chat was created only in the recovered Grafana/Prometheus application's cloned state, in its start workspace. It requested one exact acknowledgement and no tools.

| Check | Result |
| --- | --- |
| Model | OpenAI Codex, GPT-5.6 Sol, high reasoning; real subscription request |
| Reply | Recovery rehearsal verified: 42 |
| Durable run | One new succeeded run: 6898f182-54e8-4d6d-bc41-09355588d09b |
| Duplicate body/key | Returned the same run; no duplicate run |
| Changed body, same key | HTTP 409 |
| Native transcript | Zero tool calls; SHA-256 066e81bc6e9caf9afb72198cb2bfc8facf2354315a8d67dca77a15624f7eea29 |
| Application state | Operation, deployment and conformance rows unchanged |
| Worker shutdown | Loop settled, tracing shutdown completed, exit code 0 |
| Final original pause | 16.69 seconds |
| Original after restart | ChatGPT configuration ready in separate mode |
| Public applications | Grafana/Prometheus, Kuma and Todo each returned HTTP 200 |

The temporary chat/database was not merged into the original. The worker wrapper exited only after its queue loop and tracing shutdown settled. Its supervisor used the shell's kill builtin and checked signal delivery before accepting the drain receipt.

Earlier harness attempts exposed a non-UUID request key (correctly rejected before a model call) and a missing external kill executable in the slim image. The latter prevented signal delivery; it was not an application shutdown defect. Those attempts restarted the original automatically. The final invocation passed functional assertions and shutdown supervision.

## Credentials and custody

Server Guy was reconnected through the signed-in work account using its own device-login flow and separate private credential file. No host Codex, Claude or shared Pi credential was borrowed.

Original model work stayed frozen from capture through replacement shutdown. The supervisor compared the selected credential and supported atomically handing back just that provider entry if refreshed. **No credential change occurred**, so rotation/handback remains reviewed logic rather than an exercised outcome.

The password and complete recovery kit were saved in Apple Passwords as **Server Guy — controller recovery**. System Settings showed iCloud Passwords on. Retrieval from another device was not independently tested. The entry includes the earlier verified snapshot reference; its unchanged repository, password and storage credentials also recover subsequent checkpoints. Use restic snapshots, then the chosen snapshot's source manifest.

Actual Claude Opus 5 at maximum effort reviewed the procedure. Its feedback informed credential isolation, the freeze/handback boundary, stopping mutation executors, correct lock claims and explicit receipt modes.

Private receipts and the concrete operator harness remain under /tmp/server-guy-takeover/attempt4 and its parent. No secrets are committed. Full multi-loop takeover, credential rotation and another-machine recovery remain separate acceptance steps.
