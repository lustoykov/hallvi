# Automatic deployment from GitHub — 22 September 2026

The push-to-running-application journey, run once end to end on a real Hetzner
host through a real GitHub App connection, with no stand-in anywhere. What is
written here was read from the product's own records, the fixture server over
SSH, and GitHub; the times are UTC.

## What was proved

| Step | Evidence |
| --- | --- |
| Setup journey asks the choice | Pi read a private repository, arranged a server, then called `request_deployment_choice`; the card offered *Automatically when main changes* / *Only when I ask*, a branch field and the authorization text. Choosing saved the record, folded the card into a receipt and told Pi in one message. |
| Only GitHub says "watching" | The first choice was saved while the instance's GitHub token had expired: the record said `watching: false`, `checkError: "Connect GitHub…"`, and Pi's reply said automatic deployment was **saved but not active**. Once the login renewed, `watching` became true on the next look. |
| Push → running, no chat message | v2 pushed 09:58:53 · noticed and Pi woken 09:59:53 · release verified 10:02:48 · attempt `deployed` 10:04:07. Server answered `v2`, visit counter continued 6 → 11. |
| Exact commits | Every wakeup names the full SHA and Pi calls `copy_repository_to_server` with it; every release record's `revision` is that SHA. |
| Pause / resume | v3 pushed 10:05:21 while paused · noticed 10:05:59 · held for 2½ minutes with no attempt · Resume 10:08:05 · attempt started 10:08:05 · `deployed` 10:11:52; server `v3`. |
| Restart recovery | Instance stopped 10:12 · v4 pushed 10:12:28 · record on disk unchanged for 90 s · instance started 10:14 · attempt started 10:14:11, on the first look · `deployed` 10:19:03; server `v4`. |
| Failure told truthfully | v5 (`/health` answers 500) pushed 10:19:27 · attempt 10:20:17 · Pi found the container unhealthy, restored v4 and saved a **failed** release record · attempt `failed` 10:24:51 with detail *"v5 failed health checks and was rolled back · Docker reported state=running and health=unhealthy."* · server still `v4`, counter continued. |
| No retry by itself | Two minutes later the record still held one attempt for v5; the page offered **Retry**. |
| Recovery by the next push | v6 (health repaired) pushed 10:28:37 · attempt 10:29:25 · `deployed` 10:32:53; server `v6`, counter continued to 30. |

Deployment showed, throughout: mode with Pause/Resume, the tracked branch, the
latest commit against what runs, Deploy latest / Retry, the attempts with
commit links and the failure detail, and — from the release records the page
already had — "Last verified release: 2d0158f" beside "Latest attempt: Failed"
while v5 was being rolled back.

## Timing

Detection ran at the documented cadence: every look landed 60–61 s after the
previous one, and each push was noticed within one look. From push to a
verified release took 3½–5 minutes for this one-container application, almost
all of it Pi building the image and checking the result.

## What this run does not prove

- Only one application was tracked; the per-application serialization was
  exercised by the integration test (`tests/application/integration/deployment-watch.test.ts`),
  not live.
- A worker stopped *mid-deployment* was not exercised live; the `interrupted`
  outcome is covered by the integration test.
- The instance ran from a checkout with `scripts/serve.mjs` under Node 22 on
  a MacBook, not as an installed service on the Mac mini.
- Permission mode was *Pi decides*; *Always ask* was not exercised.

## Fixtures

- Repository `lustoykov/hallvi-autodeploy-fixture-20260921` (private,
  disposable): one Node file with a version page, a health endpoint and a visit
  counter in a Compose volume. Commits v1 `419d524` → v6.
- Server `hallvi-autodeploy-fixture-20260921` (Hetzner 166930482, cpx12,
  Nuremberg — CX23 was unavailable in every location that morning), created by
  Pi, labelled with the development contract and registered under task
  `76d057ad-9637-42ed-a19f-cb36f981b777`; retired when this run ended.
- Controller state under the worktree's `.hallvi/autodeploy`, deleted with the
  worktree.

Before the run the Hetzner project was at its 4-server limit. At the owner's
instruction the three finished fixture servers were deleted (`166572853`,
`166601795`, `166612442`, with their IPs, firewall and keys) and the shared
development host `166459264` was renamed `hallvi-dev`; the before/after
inventories are in the development-cleanup registry.
