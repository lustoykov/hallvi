# Visual application directions — round two

Throwaway desktop prototypes on `codex/overview-three-directions`. No winner is selected. These rules describe the comparison only; they do not replace Hallvi’s production design language.

## Question

Should the application’s landing page show its life — usage, releases and meaningful changes — instead of four maintenance timelines? Could a journal replace Overview?

The owner rejected the first evidence-first alternatives. They are removed from the preview; commit `e7c4890a` preserves that rejected experiment in branch history.

## Three alternatives

- **A — Application pulse:** a growing-audience illustration, a dated health strip, a dominant traffic/people chart with a previous-week comparison and release marker, then release and log disclosures.
- **B — Activity map:** visitors connect to the application and its read/search/write activity. Selecting people, the application or search explains that part. Weekly bars, shipped changes and log findings support the map.
- **C — Application journal:** meaningful events replace the Overview content. A weekly audience comparison, a short error burst and a deployment with its three commits form a visual chronology. Filters isolate releases or usage and health.

The existing application shell remains. The old Overview hero and lower architecture/recent-work content are replaced only while a valid development variant is active.

## Visual language

Hallvi’s Geist typography, ink, muted text, thin separators and quiet navigation remain. Purple (`#7560ba`, pale `#eeebf8`) connects usage graphics and selection; teal (`#27786d`, pale `#eaf3ee`) supports positive comparisons and shipped changes. Existing warning color identifies the error story.

Charts and diagrams carry the information: common time axes, labeled counts, a dashed previous period, proportional endpoint bars and distinct commit/deployment labels. Disclosure reveals supporting details. No animation suggests a live traffic stream. The bottom switcher is prototype control chrome, not product UI.

The large headlines and audience illustration are experimental. One-off sizes, prototype labels and decorative audience icons are not new production design-system rules.

## Data and capability boundaries

Usage, releases, commit IDs and log stories are **sample data**. They are not the owner’s application analytics. Sample traffic totals 15,600 requests versus 11,270 in the previous week (38% rounded growth); sample distinct signed-in users total 218 versus 154 (42% rounded growth). Daily active users are not summed to derive weekly distinct users.

Hallvi’s existing usage record can carry requests, server errors, response times and distinct client-address visitor estimates. Actual signed-in users require application analytics or equivalent application evidence. This prototype adds no collector or integration.

The health strip reads the existing synthetic fixture’s dated application-check projection. “Passed its last check” does not assert current health. Traffic history can inform health without replacing a fresh check. Repository commits and deployed commits stay separate; timing of growth after a release does not establish causation.

All controls in the alternatives change local UI state only: chart metric/day selection, map selection, disclosures and journal filters. They send no operator requests and execute no changes. The scenario runner uses an isolated database and Pi configuration, without a worker.

## Try it

With Node.js 22 and locked dependencies installed using `npm ci`:

```sh
npm run prototype:overview
```

Open [A](http://127.0.0.1:3197/applications/eeeeeeee-0000-4000-8000-000000000019?variant=A#overview), [B](http://127.0.0.1:3197/applications/eeeeeeee-0000-4000-8000-000000000019?variant=B#overview), or [C](http://127.0.0.1:3197/applications/eeeeeeee-0000-4000-8000-000000000019?variant=C#overview). The bottom arrows or left/right keys cycle between alternatives. URL selection survives refresh. Production builds render the existing Overview.

## Evidence and handoff

Node 22, locked installation, formatting, TypeScript and targeted ESLint completed. Desktop browser interaction covered variant switching, the chart metric, map selection and journal filtering. No mobile or operational validation was attempted. The independent screenshot/source review found no blocker **to owner comparison**, not production readiness or acceptance.

Screenshots: [A](screenshots/A.png), [B](screenshots/B.png), [C](screenshots/C.png), [C release filter](screenshots/C-release.png). The screenshot/source review did not independently operate the browser. Documentation was completed locally after its helper became unavailable.

The local worktree, preview on port 3197 and synthetic fixture are retained for owner selection, with ownership recorded outside the worktree. No cloud resources were created. Nothing is promoted to main; a selected design would need implementation against real sources.
