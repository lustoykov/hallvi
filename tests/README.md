# Testing Server Guy

For the schema 15 checkpoint, run `npm test`, then `npm run test:e2e:smoke`. Tests use disposable databases and synthetic provider/model responses. The shared-information browser case covers rich cards in chat and Deployment after refresh. `npx tsc --noEmit` and `npm run build` check the application bundle.

The old workflow/decision model-eval runner and compatibility deployment scripts have been retired with their implementation. `npm run eval:pi` explains this and exits without making model calls. Historical model answers and their optional judge remain available; they do not verify the redesigned operator. New live deployment evals follow provisioning.

The local testing dashboard is available through `npm run test:dashboard`. Opening it makes no model calls. Its live-case catalog still describes historical cases; do not treat those as current implementation requirements.

Install Chromium with `npx playwright install chromium`. Browser fixtures run on 3180+ with synthetic credentials; they never open the normal application database. Failure artifacts and the rich-card screenshots are under `tests/results/`. The workspace Docker test is opt-in and requires a reachable engine.
