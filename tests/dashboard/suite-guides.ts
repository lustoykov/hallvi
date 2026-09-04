/** One explanation format for every suite. Keep these claims aligned with the runners. */
const browserGuide = {
  execution: "Playwright drives Chromium against a disposable Next.js app. The dashboard journey starts its own temporary testing dashboard.",
  real: "Browser, UI, HTTP routes, domain logic and SQLite. Clicks, reloads and error handling run through real application code.",
  mocked: "Pi replies, GitHub and login responses are synthetic. Dashboard tests simulate runner launches and saved answers; no model or provider calls.",
  isolation: "One temporary app and database per product-browser worker, on port 3180+. Scenarios use different applications, not a fresh database for every test. Your app on port 3000 is not used.",
  checks: "Code assertions check visible UI and saved state: for example, send a priority, reload, and verify its message and Decision. No human or LLM grading.",
  limits: "Passing proves the selected journeys work with simulated providers. It does not prove real OAuth, GitHub access or model response quality.",
  artifacts: "HTML report, failure screenshots and traces: tests/results/browser-report/ and tests/results/browser-artifacts/.",
  sources: ["tests/e2e/fixtures.ts", "tests/e2e/phase-one.spec.ts", "tests/e2e/journeys.ts"],
};

export const suiteGuides = {
  unit: {
    purpose: "Unit and integration tests, not just unit tests: check predictable application behavior without calling a model.",
    execution: "Vitest runs TypeScript in Node.js. No Next.js server or browser is started.",
    real: "Schemas, domain rules, database queries and SQLite constraints in integration tests; adapter code tested against controlled inputs.",
    mocked: "Pi, GitHub and OAuth/provider boundaries are replaced with test responses. Route tests stub domain calls when testing the HTTP boundary alone.",
    isolation: "Pure unit tests need no database. Phase 1 integration tests create one temporary SQLite database per file and clear application rows before each test. Schema tests use their own database setup per test.",
    checks: "Code assertions compare expected values, errors, saved messages, Decisions and rollback behavior. No human or LLM grading.",
    limits: "Passing does not establish browser behavior, real provider access or whether a live model interprets your intent correctly.",
    artifacts: "Dashboard runs save the command and terminal output under tests/results/runs/. Temporary integration databases are removed during test teardown.",
    sources: ["tests/vitest.config.mjs", "tests/phase-one.test.ts", "tests/db.test.ts"],
  },
  smoke: {
    ...browserGuide,
    purpose: "The small automatic subset: add an application and save a priority; then check settings, privacy help and saved effort.",
    execution: "Playwright drives Chromium against a disposable Next.js app. Only the two journeys tagged @smoke run.",
    mocked: "Pi replies, GitHub and login responses are synthetic. No model or provider calls.",
    limits: "Passing covers those two journeys only, not the full browser suite or real provider/model behavior.",
  },
  e2e: {
    ...browserGuide,
    purpose: "Choose a subset or run every desktop journey. Browser smoke is part of this suite, not a different kind of test.",
  },
  live: {
    purpose: "Exercise the real Server Guy agent, then evaluate both its answer and the state it saved.",
    execution: "Vitest calls sendChatMessage() directly in Node.js. No Next.js server, HTTP request or browser is involved.",
    real: "Pi, the configured model, tool proposals, domain validation and the SQLite transaction. Uses your configured ChatGPT subscription.",
    mocked: "Application data and existing Decisions are seeded examples. GitHub inspection is blocked; model replies are not mocked.",
    isolation: "One temporary SQLite database per eval run. Every case and repetition gets a new application and chat. Your application database is untouched, but real login credentials are used and Pi may refresh them.",
    checks: "Code checks proposal counts, replacement IDs and persistence. An optional LLM judge and/or a human reviews meaning. LLM clearance is not human approval; failed code checks stay failed.",
    limits: "Passing covers these inputs with this model at this time. It does not prove browser flows, real GitHub integration or correctness for every prompt. An LLM judge can also be wrong.",
    artifacts: "Answers, before/after state and reviews: tests/results/evals/. Temporary eval databases are retained for debugging. Archiving a saved run hides it; it does not delete its files.",
    sources: ["tests/evals/phase-one-cases.ts", "tests/evals/phase-one.eval.ts", "tests/evals/check-phase-one.ts", "tests/evals/judge.ts"],
  },
};
