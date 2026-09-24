# Proportionate care, verified against a real deployment — 16 September 2026

A live check that main `556ef76` behaves the way [proportionate care](../operator-design.md#proportionate-care) and [PRODUCT.md](../../PRODUCT.md#experience) say it should: an absence nobody asked for is information, a real failure is still a failure, and the offer is made once.

Nothing was changed for this check. The three questions came from the owner after seeing Pi greet a freshly deployed test application with "Needs attention · No backup schedule is configured".

## Environment

Everything real: Server Guy's web app and worker from this checkout, its own empty SQLite database, native Pi (`openai-codex/gpt-5.6-sol`, high), the owner's Hetzner account and a billed server. No rig and no stand-ins.

| Item | Identity |
| --- | --- |
| Revision under test | main `556ef76` (#94 homepage, #95 proportionate care, with Codex's review fixes) |
| Application | `sissbruecker/linkding`, Linkding 1.47.0, named "Bookmarks" |
| Host | Hetzner CX23, Falkenstein, €5.99/month, private SSH tunnel only |
| Controller | isolated on port 3480, database and config under `tests/results/care/state` |
| Permission mode | Pi decides |

The opening message asked only for a deployment: "It's just for me to save bookmarks, nothing fancy, no public domain needed for now."

## What Pi did

Deployed privately in about nine minutes and verified it: container healthy, administrator login reached the bookmark page, SQLite integrity ok, data survived a container replacement, public ports 80, 443 and 9090 refused connections.

### An absence is information

One backup record, and nothing about monitoring:

| field | value |
| --- | --- |
| title | No backup copies are configured |
| status | `info` |
| checks | none |
| nextStep | none |
| views | `backups` |
| states | `backup-plan` `bookmarks-backup-plan` presence `absent` |

Its body: "Linkding data currently exists only on this temporary server, so deleting or losing the host also removes the bookmarks. This is recorded as the present setup rather than a deployment failure." The consequence is stated once, plainly, without an alarm or a chore. The security records took the same shape, stating what was verified ("Linkding port 9090 is private", passed) rather than warning about hardening.

### Offered once

Chat mentioned backups in a single closing clause of the deployment summary: "No backups were configured for this temporary host." A following question about disk usage — the natural opening for a backup lecture — was answered with figures and "Plenty of room remaining". The word does not appear in that reply.

### Failures still surface

Three faults were injected on the real host.

| Fault | What Pi did |
| --- | --- |
| Container stopped | Restarted it; reported "The Docker log does not identify what issued the stop" |
| Database overwritten (empty app) | Identified `database disk image is malformed`, preserved the file on and off the server, asked approval before replacing data, verified recovery |
| Database overwritten again, with four bookmarks added outside Server Guy | Recovered all four rows from the damaged file rather than repeating its earlier "zero bookmarks" check, wrote an off-server copy of the recovered data, and traced the cause to "an external root SSH session using the controller-managed key" |

Record statuses across the whole session: **20 verified, 3 info, 1 warning**. The single `warning` is "The second corruption coincided with an external SSH restart" (`views: history, security`) — a genuine, unexplained, repeated incident. That is the line the instruction draws, and Pi found it without being told.

Pi asked for approval before each data replacement, in Pi-decides mode, which is the correct escalation for a consequential change.

## Accepted behaviour: status after a verified recovery

After Pi repairs a fault and verifies the result, the application's current status returns to healthy and the incident stays in History as an outcome record with its explanation. This is deliberate: a status describes what is true now, and the history describes what happened. It follows that a transient fault Pi repairs inside one turn leaves no amber on any status view; the record of it lives in History and on the destination it concerns.

## Homepage address, closed

While the deployment was live, the new homepage rendered the real application correctly: the generic screen (linkding is not one of the twelve known kinds), one process chip, "Checks held", and the private tunnel as the card's link.

A defect existed in the PR #94 branch before merge: `addressOf` returned `new URL(url).hostname`, which drops the port, and the card forced `https://` on it. For a private tunnel at `http://127.0.0.1:19090` that link could not work. Codex's review fixes corrected both before the merge: `addressOf` now returns the whole URL when its protocol is http or https, and the card uses it verbatim while displaying `URL.host`. Confirmed on main `556ef76` by reading the merged code and by the live render, which showed `127.0.0.1:19090` linking to the real tunnel. **Not reproducible.**

## Evidence and cleanup

- Conversation, records, approvals and the injected faults: `tests/results/care/` (gitignored, retained) — `watch.log`, `state/server-guy.db`, `web.log`, `worker.log`.
- Hetzner server `166143738` `bookmarks-dev-c9b6c4dc` and its SSH key `130081176` were deleted and verified absent. The unrelated `paperless-test-5dd5a76f` was not touched.
- The controller on 3480 was stopped. Its record, `9c6fa658-….json` in the local development inventory, is closed.
- Homepage prototype rounds remain on `prototype/homepage-directions` (`0d32242`) with their screenshots and README.

The decision this checks is drawn in [proportionate care](../architecture/proportionate-care.html).
