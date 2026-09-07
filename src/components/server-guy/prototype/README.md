# Shell prototype (throwaway)

**Question:** how should the application top bar, the right-hand inspector
(Record / Activity / Changes / Receipts) and the phase actions be arranged so
that the phase's purpose, what is happening now and the next action are
discoverable, the record is not crowded, history and evidence are reachable,
and there is one authoritative current state?

**Plan:** three structurally different variants of the workspace shell on the
existing `/applications/[applicationId]` route, switchable via `?variant=A|B|C`
and a floating bottom bar (← → keys). Same server data as production; every
action is a stub reported in the bar. Hidden in production builds.

| Variant | Top bar | Right column | Actions |
| --- | --- | --- | --- |
| A | Identity + muted context; Settings names its state | "Now" panel (purpose, status, waiting-on, actions, stages, checks) + one wide Details overlay for everything else | Only in the Now panel; chat stays a plain transcript |
| B | Two-row header; connection states in words; the phase strip folded into row 2 | Two tabs: Record and History | Interactive cards in the chat after the reply that produced the record; replaced cards lose their buttons |
| C | Identity with environment/policy subtitle; strip unchanged | One outline with jump nav and collapsible sections | A persistent current-step bar above the transcript; chat shows reference chips |

Run: `node tests/browser/qa-fixture.mjs 3210 success ready`, add an
application from `qa/…`, then open its page with `?variant=A`.

`phase-copy.ts` is the liftable part: a pure description of the viewed phase
(purpose, now, waiting-on, distinct actions, Phase 3 stages, remaining work)
from the Operator View.
