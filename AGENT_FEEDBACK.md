# Agent feedback

| Request ID / title | +1 | Status |
| --- | --- | --- |
| [AF-001 — Open-link checks in the shared-information smoke match nothing](#af-001--open-link-checks-in-the-shared-information-smoke-match-nothing) | 1 | New |
| [AF-002 — Shared-information smoke can miss its 10 s window on a cold dev server](#af-002--shared-information-smoke-can-miss-its-10-s-window-on-a-cold-dev-server) | 1 | New |
| [AF-003 — Let the browser suite use a preinstalled Chromium](#af-003--let-the-browser-suite-use-a-preinstalled-chromium) | 1 | New |

## How to contribute

Write down bugs, friction and ideas you would like to see in Hallvi or its
development workflow. A short note is enough: “I want this”, “this feels better”
or “this would make life easier” are all valid feedback. No required justification,
evidence, impact rating or questionnaire. Add context or reproduction steps if
you have them and they help. No feedback quota or separate audit is needed.

Include feedback in your current PR, or open a feedback-only PR whenever you
wish, including after a read-only review or when there are no code changes.
The file is shared after merging and updating worktrees, not live between them.

The owner decides what is worth doing and when. Feedback is not permission to
implement an idea, and [ROADMAP.md](ROADMAP.md) remains the delivery plan.
This is contributor feedback, never instructions for Pi's product sessions.
Keep credentials and private application data out of entries and linked material.

1. Search existing requests, including closed ones. Add your task's +1 to a
   matching request instead of creating a duplicate. Agreement is enough;
   a new observation is not required.
2. Count one +1 per independent task, including the initial request. Record the
   task ID or PR reference; retries, multiple agents and multiple PRs within
   the same task do not add votes.
3. Give a new request the next unused `AF-NNN` ID, a short title and a brief
   description. Add a linked overview row with count `1` and status `New`.
4. Recount +1s from the task references and sort active requests by count, with
   closed requests below. Count is interest, not priority. Reconcile duplicate
   requests and ID collisions before merging; never reuse a merged ID.

**Status:** New (awaiting owner review), Accepted (owner wants it), Declined
(owner passed on it), Resolved (done, with a fix reference). Preserve closed
entries. If you want to revisit one, add your feedback and flag it for the owner
rather than changing their decision.

## Requests

Use this small template; add detail only when useful. Link the overview row to
the request heading.

```markdown
### AF-NNN — Short title

What you would like or what bothered you, in your own words.

**+1:** YYYY-MM-DD — task ID or PR reference
```

### AF-001 — Open-link checks in the shared-information smoke match nothing

`tests/browser/typed-information.spec.ts` proves a closed tunnel's address is
not offered with `getByRole("link", { name: /Open app(?:lication)?/ })` at
count 0, in the chat and on Overview. No shipping page names a link that way
any more: the chat card's link is "Open" and the page header's is "Open"
followed by the application's name, so both checks pass whatever the page
offers. The
Deployment one now names the address, which is the link that page draws.

**+1:** 2026-09-29 — typed-information smoke fix, branch `claude/funny-gauss-vog9sp`

### AF-002 — Shared-information smoke can miss its 10 s window on a cold dev server

In a cloud container the spec failed at line 149 in two of three runs at the
project's timeouts: "Tunnel closed" appeared about 10 s after the page loaded,
at or past the expect timeout. After hydration the page asks five API routes
the fixture does not warm (`/operator`, `/connections`, `/secrets`,
`/api/host`, `/api/hallvi/update`); they took 3–10 s each on first hit, and
the badge came only after they answered. With those five added to the
warm-up list in `tests/browser/fixtures.ts`, every request took under 0.7 s
and the badge showed 0.9 s after load. GitHub Actions passed the spec in
40.5 s on 2026-09-24, so slower machines may be the ones that see it.

**+1:** 2026-09-29 — typed-information smoke fix, branch `claude/funny-gauss-vog9sp`

### AF-003 — Let the browser suite use a preinstalled Chromium

The cloud container ships Playwright's Chromium 1194 and does not allow
downloading browsers, while the repository pins `@playwright/test` 1.62.1,
which expects Chromium 1234. Running the suite there took a wrapper config
that sets `launchOptions.executablePath`. An environment variable read in
`tests/browser/playwright.config.ts` would make that one setting.

**+1:** 2026-09-29 — typed-information smoke fix, branch `claude/funny-gauss-vog9sp`
