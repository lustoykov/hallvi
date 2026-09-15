# Two ways the conversation showed its own history badly — 15 September 2026

Both found by the owner reading the Shop conversation, not by a test.

## What they were

**A repeat sent the reader nowhere useful.** A record mentioned twice draws
its full card once and a one-line repeat afterwards, linking to the first
appearance with `#record-<id>`. That is worth doing only when the first
appearance holds more than the repeat does — and often it does not. "Controller
backups retain up to seven Shop copies" went well, so it was compact both
times: following "see it in full above" scrolled the reader into the middle of
history and showed them the same single line. Nothing was in full anywhere.

**A resolved failure still read as a to-do.** Directly beneath it sat "No
controller-held Shop backup copy was created", retired at 11:55Z when the
transfer succeeded two minutes after it failed. It still rendered at full
height with a red failed check, "Protected transfer to the controller
completed", and a line reading "Next: Retry `fetch_backup_copy`…". A reader
scrolling past met an instruction about a state that had not held for hours.

## What they are now

A repeat offers the destination that renders the record — the record already
names its views, and the link uses **the record's own order** rather than the
sidebar's: Pi writes `["backups", "overview"]` for a backup copy because
Backups renders it and Overview only mentions it. Choosing by sidebar order
sent the reader to the page that says least, which is how the first attempt at
this read "open Overview".

![The repeat now reading "Verified · open
Backups"](2026-09-15-record-cards/cards-1-repeat-and-retired.png)

A retired record gives up the room like the other two kinds of quiet card:
tag, title and time, with its detail behind the existing disclosure. The
failed check is still there — it is history and history is the point — but it
is not on the surface, and the next step is gone entirely, because advice
about a superseded state is not advice.

![The retired card as one muted line reading "No longer current · No
controller-held Shop backup copy was created ·
14:51 · Details"](2026-09-15-record-cards/cards-2-retired-card.png)

*Both captures: revision `8664b84` plus this change, on the local rig — real
sshd in a Linux container, real ssh client with a pinned host key, real Docker;
GitHub and Hetzner are stand-ins. 1440×980, on the owner's own Shop
conversation rather than a fixture. The capture scripts refuse to run if the
old wording or a `Next` line is still on the page.*

## What changed, and what did not

`information-card.tsx` and `information-content.tsx` — the second because
deployment, access and database records render through it with the same
one-line repeat. In this conversation three such records accounted for **46 of
the 47 repeats on screen**, so fixing only the first component would have
fixed one of them. The rule itself lives in `application-sections.ts` as
`recordDestination`, so the two cannot drift.

`chat-pane.tsx` needed nothing: it already passes `onOpen`.

Verified on the page afterwards: no "see it in full above" anywhere, seven
repeats offering their destination, and no `Next` line rendered at all.

- **A retired record that carries its own content is untouched.** There are
  none in this conversation and none in the fixtures, so the compact treatment
  is applied where the defect exists rather than to a case nobody has.
- **The verdict, the records and the Backups page are untouched.**
- **Owner acceptance is not claimed.** The two behaviours were requested; how
  they read is theirs to judge.
