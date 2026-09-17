/**
 * One explanation format for every suite. Keep these claims aligned with the
 * runners.
 */
const browserGuide = {
  execution:
    "Playwright drives Chromium against a disposable Next.js app and a separate Pi worker using the same temporary database. The dashboard journey starts its own temporary testing dashboard.",
  real: "Browser, UI, HTTP routes, domain logic, SQLite and the native Pi session/tool loop. Clicks, reloads and error handling run through real application code.",
  mocked:
    "Pi replies and ChatGPT login responses are synthetic. GitHub API responses and credential discovery are synthetic, but its setup routes and login coordinator are real. Dashboard tests simulate runner launches and saved answers; no model or provider calls.",
  isolation:
    "Product journeys start one disposable Haldur app on port 3180 with its own temporary SQLite file. All selected journeys share that file, but each creates a different application. Example: a priority saved by the isolation journey cannot appear in the revision journey. After the suite, Next.js and the Pi worker stop and the whole /tmp/haldur-e2e-* directory, database included, is deleted; the dashboard's Stop button and shutdown take the same path. Only a hard kill (SIGKILL) can leave one behind. Port 3000 and your normal database are never opened. Dashboard-only journeys use synthetic dashboard state.",
  checks:
    "Code assertions check visible UI and saved state: for example, send a message, reload, and verify its saved response and shared cards. No human or LLM grading.",
  limits:
    "Passing proves the selected journeys work with simulated providers. It does not prove real OAuth, GitHub access or model response quality.",
  artifacts:
    "HTML report, failure screenshots and traces: tests/results/browser-report/ and tests/results/browser-artifacts/.",
  sources: [
    "tests/browser/fixtures.ts",
    "tests/browser/applications.spec.ts",
    "tests/browser/github.spec.ts",
    "tests/browser/journeys.ts",
  ],
};

export const suiteGuides = {
  unit: {
    purpose:
      "Unit and integration tests, not just unit tests: check predictable application behavior without calling a model.",
    execution:
      "Vitest runs tests/application/unit/ and tests/application/integration/ in Node.js. Durable-request tests also start and crash a real worker process with synthetic Pi. No Next.js server or browser is started.",
    real: "Schemas, domain rules, database queries and SQLite constraints in integration tests; adapter code tested against controlled inputs.",
    mocked:
      "Pi, GitHub and OAuth/provider boundaries are replaced with test responses. Route tests stub domain calls when testing the HTTP boundary alone.",
    isolation:
      "Unit tests do not open SQLite. The database-backed integration tests create temporary databases: application tests reuse one file but clear its application rows before every test, while schema tests create a fresh file for every test. Example: a chat saved by one application test cannot appear in the next. After the tests, database connections close and these temporary folders are deleted. Your normal Haldur database is never opened.",
    checks:
      "Code assertions compare expected values, errors, saved messages, shared information, permissions and refresh behavior. No human or LLM grading.",
    limits:
      "Passing does not establish browser behavior, real provider access or whether a live model interprets your intent correctly.",
    artifacts:
      "Dashboard runs save the command and terminal output under tests/results/runs/. Temporary integration databases are removed during test teardown.",
    sources: [
      "tests/application/vitest.config.mjs",
      "tests/application/integration/operator-storage.test.ts",
      "tests/application/integration/db-setup.test.ts",
    ],
  },
  smoke: {
    ...browserGuide,
    purpose:
      "The small automatic subset: the application workspace, shared outcome cards, adding an application and chatting, and settings with privacy help and saved effort.",
    execution:
      "Playwright drives Chromium against a disposable Next.js app and Pi worker. Only the journeys tagged @smoke run.",
    mocked:
      "Pi replies, GitHub and login responses are synthetic. No model or provider calls.",
    limits:
      "Passing covers those journeys only, not the full browser suite or real provider/model behavior.",
  },
  e2e: {
    ...browserGuide,
    purpose:
      "Choose a subset or run every desktop journey. Browser smoke is part of this suite, not a different kind of test.",
  },
};
