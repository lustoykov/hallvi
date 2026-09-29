# Private access observations — plan 02 increment 1

The access check, Open links and existing reopen draft now use one current
saved route. A private connection being open establishes SSH tunnel liveness;
it does not establish application HTTP health. Missing answers, controller
read errors and edited routes cannot retain an earlier green answer.

## Revisions and method

- Baseline product: `d9ecaf1ae5cdb2535ef41ba84942d568a979b598` (#255).
- Candidate product and browser harness: `e3610c9c07bcf50c73ce512dd93dffe5411e118b`.
  Subsequent evidence/document/workflow commits do not change these product
  components or access implementation.
- Captured on 29 September 2026 with the disposable browser QA controller,
  Playwright Chromium, Node 22.23.2; no account or retained application state.
- Both versions render the actual product components with the same synthetic
  Private Notes records: the current route is `127.0.0.1:18000`, while an earlier
  route at `18001` has a later establishment time but an older update time.
- The access endpoint is intercepted to model tunnel open, tunnel closed,
  absent observation and controller transport loss. Controller loss follows a
  successful check. The traffic stream is fixed at no-server in both captures;
  that independent background tile is not the access observation.
- The page clock advances the existing 30-second polling interval. Screenshots
  wait for the expected visible access answer; CSS animations are disabled
  during capture. Desktop is 1440×1000, narrow is 390×844. Narrow captures scroll
  to the “The way in” tile so the relevant observation is visible. Each image
  is an unedited browser screenshot, with no synthetic layout replacement.
- Baseline captures use a disposable archive of the baseline source plus the
  identical test harness and its unused pure route-identity helper. No baseline
  product component is patched for the candidate behavior. The normal fixture
  adapters remain the repository's existing synthetic setup/worker boundary.

## Matched states

| State | Before, desktop | After, desktop | Before, narrow | After, narrow |
| --- | --- | --- | --- | --- |
| Normal | [Before](baseline/normal-desktop.png) | [After](candidate/normal-desktop.png) | [Before](baseline/normal-narrow.png) | [After](candidate/normal-narrow.png) |
| Closed | [Before](baseline/closed-desktop.png) | [After](candidate/closed-desktop.png) | [Before](baseline/closed-narrow.png) | [After](candidate/closed-narrow.png) |
| Unknown | [Before](baseline/unknown-desktop.png) | [After](candidate/unknown-desktop.png) | [Before](baseline/unknown-narrow.png) | [After](candidate/unknown-narrow.png) |
| Controller unreachable | [Before](baseline/controller-unreachable-desktop.png) | [After](candidate/controller-unreachable-desktop.png) | [Before](baseline/controller-unreachable-narrow.png) | [After](candidate/controller-unreachable-narrow.png) |

Normal stays open, with “Private connection open” describing the actual
observation. Closed remains closed with the existing draft action. The baseline
incorrectly shows green for an absent answer and retains green after controller
loss; the candidate shows neutral “Access has not been checked” and “Cannot
reach Hallvi” and withholds private Open links. The normal header also exposes
an existing CSS defect: its white Open text had no background on Overview.
The candidate's scoped fallback uses the existing shell ink/blue tokens. This
visible difference is a product correction, not a retouched baseline image.

## Verification

- 119 focused unit assertions passed across 9 files: route selection/identity,
  controller private/public checks, release links, Access projection, Overview,
  deployment, process projection and list/Overview agreement.
- The private-access browser regression passed: refresh, displayed route and
  release-strip agreement, historical private cards withholding old URLs,
  controller loss, missing observations, same-route draft text, edited route
  identity and an older successful poll arriving after a newer failure.
- The existing shared-information browser journey passed: saved records render
  in chat and destinations, persist after refresh and update by record ID.
- TypeScript, production build and lint/format checks passed. Lint retains the
  repository's existing warnings; no new lint errors remain.
- Visual review covered desktop and narrow status presentation, readable Open
  contrast and horizontal overflow. The one manual design scan reported only
  existing declarations in `journey-v2.css` (1 warning, 103 advisories), outside
  the two changed token fallbacks. No theme redesign is part of this increment.
- Baseline archives in ignored `work/` exposed duplicate TypeScript globals in
  the compiler's source glob. The narrow workflow correction excludes `work/`
  and documents archive cleanup. TypeScript and the production build pass with
  a deliberately invalid scratch TypeScript file present; product source and
  tests remain in the compiler's file list.

Reproduce the screenshots with
`HALLVI_E2E_PORT=3670 HALLVI_ACCESS_CAPTURE=candidate npm run test:e2e -- tests/browser/private-access.spec.ts`.
The baseline mode runs the same harness against the baseline source and returns
after capture; candidate mode continues through the regression assertions.

## Limits and remaining scope

These fixtures prove UI/controller interpretation of modeled observations;
they do not prove a real SSH tunnel, application HTTP health, remote-device
forwarding or deployment. No live model, provider or application mutation was
performed. No database schema, SSH mutation, tool form, permission mode or
submission contract changed. Reopen still prepares a main-conversation draft.

The reconnect proposal remains **In progress (partial)**, with its initial vote
preserved. Increment 2 (saved-route tool form/direct submission) and increment 3
(real return/controller-restart/remote-device acceptance) remain unimplemented.
This work is subsequent to the separately frozen alpha.8 source; it does not
claim alpha.8 or the broader beta walkthrough is complete. AF-012 records this
increment's resolved observation/selection defect with one independent task vote.
