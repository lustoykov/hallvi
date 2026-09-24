const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="testing-token"]').content;
let state = null;
let stateSignature = "";
let selectedRun = "";
let selectedCase = "";
let selectedLog = "";
let answerFilter = "attention";
let noteKey = "";
let selectorsReady = false;
let autoAll = false; // Landed on a run with nothing needing attention.
// The page can outrun the server process behind it; this is the state shape
// the page needs.
const REQUIRED_API = 6;
let busy = false;
const notes = new Map();
const openReasoning = new Set();
let openRun = "";
const VERDICTS = {
  pass: ["Pass", "pass"],
  fail: ["Fail", "fail"],
  "needs-discussion": ["Needs discussion", "discuss"],
};
const keyOf = (record) => `${record.caseId}:${record.repetition}`;
const reviewable = (record) => Boolean(record.reply && record.input);
const attentionStatuses = ["needs-judge", "needs-review", "failures"];
const triageKinds = {
  "needs-judge": "todo",
  "needs-review": "discuss",
  failures: "fail",
  cleared: "llm pass",
  reviewed: "pass",
};
const triageFor = (saved, c) => saved.triage[keyOf(c)];
const formatDate = (iso) =>
  new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function chip(text, kind) {
  return element("span", text, `chip ${kind ?? ""}`.trim());
}
function report() {
  return state?.reports.find((r) => r.run === selectedRun);
}
function record() {
  return orderedResults(report()).find((c) => keyOf(c) === selectedCase);
}
function reviewFor(saved, type, key) {
  return saved?.reviews.filter((v) => v.type === type && v.key === key).at(-1);
}
function caseName(id) {
  // The casebook that held the readable names has been retired; a saved
  // answer still knows the id it was recorded under.
  return id;
}
function suiteName(id) {
  // Archived runs keep the suite they were started as, including the two that
  // no longer exist. A row from one is history, and says so.
  const retired = {
    live: "Live agent evals (retired)",
    judge: "LLM judgments (retired)",
  };
  return state.suites.find((s) => s.id === id)?.name ?? retired[id] ?? id;
}
const statusLabel = (status) =>
  status === "timed-out"
    ? "Timed out"
    : status.charAt(0).toUpperCase() + status.slice(1);
const statusKind = (status) =>
  ({ passed: "pass", running: "discuss" })[status] ?? "fail";
function elapsed(run) {
  const seconds =
    Math.max(
      0,
      (run.finishedAt ? Date.parse(run.finishedAt) : Date.now()) -
        Date.parse(run.startedAt),
    ) / 1000;
  return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)} s`;
}
// What a recorded run covered, read back from its explicit runner options.
function scopeOf(run) {
  const command = run.command ?? "";
  const listed = (names, noun) =>
    names.length > 3
      ? `${names.slice(0, 3).join(", ")} + ${plural(names.length - 3, `more ${noun}`)}`
      : names.join(", ");
  const journeys = command.match(/@journey-\(\?:([^)]+)\)/)?.[1].split("|");
  if (journeys)
    return journeys.length === state.journeys.length
      ? `All ${plural(journeys.length, "journey")}`
      : listed(
          journeys.map(
            (id) => state.journeys.find((j) => j.id === id)?.name ?? id,
          ),
          "journey",
        );
  const cases = command.match(/PI_EVAL_CASES=([\w,.-]+)/)?.[1].split(",");
  if (cases) {
    const repeats = Number(command.match(/PI_EVAL_REPEATS=(\d+)/)?.[1] ?? 1);
    const scope =
      cases.length === 1
        ? caseName(cases[0])
        : listed(cases.map(caseName), "case");
    return repeats > 1 ? `${scope} × ${plural(repeats, "repetition")}` : scope;
  }
  const keys = command.match(/PI_JUDGE_CASES='(\[[^']*\])'/)?.[1];
  if (keys) {
    const judged = state.reports.find(
      (r) => r.run === command.match(/PI_JUDGE_RUN='?([\w.-]+)/)?.[1],
    );
    try {
      return `${plural(JSON.parse(keys).length, "saved answer")}${judged ? ` from the run of ${formatDate(judged.startedAt)}` : ""}`;
    } catch {
      return "";
    }
  }
  return "";
}
// Repetitions of one case sit together so a reviewer compares them back to
// back.
function orderedResults(saved) {
  if (!saved) return [];
  const order = [];
  for (const c of saved.results)
    if (!order.includes(c.caseId)) order.push(c.caseId);
  return [...saved.results].sort(
    (a, b) =>
      order.indexOf(a.caseId) - order.indexOf(b.caseId) ||
      a.repetition - b.repetition,
  );
}
function matchesFilter(saved, c, filter) {
  const status = triageFor(saved, c).status;
  return (
    filter === "all" ||
    (filter === "attention"
      ? attentionStatuses.includes(status)
      : filter === "reviewed"
        ? Boolean(reviewFor(saved, "human", keyOf(c)))
        : status === filter)
  );
}
function shownResults(saved) {
  return orderedResults(saved).filter((c) =>
    matchesFilter(saved, c, answerFilter),
  );
}
function triageCounts(saved) {
  const counts = {
    failures: 0,
    "needs-review": 0,
    "needs-judge": 0,
    cleared: 0,
    reviewed: 0,
  };
  for (const c of saved.results) counts[triageFor(saved, c).status]++;
  return counts;
}
function pendingCount(saved) {
  return saved.results.filter((c) =>
    attentionStatuses.includes(triageFor(saved, c).status),
  ).length;
}
// Where you and a current judgment both exist, the judge is either right or
// wrong; that is the calibration signal.
function agreement(saved, c) {
  const human = reviewFor(saved, "human", keyOf(c));
  const llm = reviewFor(saved, "llm", keyOf(c));
  return human && llm && triageFor(saved, c).judged
    ? human.verdict === llm.verdict
    : null;
}
function failure(error) {
  $("error").textContent = error.message;
  $("error").hidden = false;
}
async function api(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "X-Hallvi-Testing-Token": token,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error);
  return value;
}
// Safe rich text: paragraphs, line breaks and **bold** become nodes; nothing is
// parsed as HTML.
function renderRich(node, text) {
  node.replaceChildren(
    ...text.split(/\n{2,}/).map((block) => {
      const paragraph = document.createElement("p");
      for (const part of block.split(/(\*\*[^*\n]+\*\*)/)) {
        if (/^\*\*[^*\n]+\*\*$/.test(part)) {
          paragraph.append(element("strong", part.slice(2, -2)));
          continue;
        }
        part.split("\n").forEach((line, index) => {
          if (index) paragraph.append(document.createElement("br"));
          paragraph.append(line);
        });
      }
      return paragraph;
    }),
  );
}

async function refresh() {
  try {
    const nextState = await api("/api/state");
    const signature = JSON.stringify(nextState);
    // Preserve keyboard focus and open controls between polls.
    if (signature === stateSignature) return;
    stateSignature = signature;
    state = nextState;
    $("stale").hidden = (state.apiVersion ?? 0) >= REQUIRED_API; // The page can outrun the server process behind it.
    $("active").hidden = !state.active;
    tick();
    $("suites").replaceChildren(
      ...state.suites.map((suite) => {
        const row = document.createElement("tr");
        const name = document.createElement("td");
        name.append(
          element("strong", suite.name),
          element("small", suite.scope),
        );
        if (suite.id === "live") {
          const links = element("div", "", "suite-links");
          const link = element("a", "View saved runs", "text-button");
          link.href = "/evals";
          link.dataset.route = "";
          links.append(link);
          name.append(links);
        }
        const last = state.history.find((r) => r.suite === suite.id);
        const resultCell = document.createElement("td");
        const result = element("div", "", "last-result");
        if (last)
          result.append(
            chip(statusLabel(last.status), statusKind(last.status)),
            element("small", formatDate(last.startedAt)),
          );
        else result.append(element("small", "Not run yet"));
        const usage = document.createElement("td");
        usage.append(
          chip(suite.cost, suite.id === "live" ? "usage-paid" : "usage-free"),
        );
        const schedule = element("td", "", "suite-schedule");
        schedule.append(element("span", suite.ci));
        if (suite.ciDetail) schedule.append(element("small", suite.ciDetail));
        resultCell.append(result);
        row.append(name, usage, schedule, resultCell);
        const picker =
          suite.id === "e2e" ? "journey" : suite.id === "live" ? "eval" : null;
        const action = document.createElement("td");
        const button = element(
          "button",
          picker === "journey"
            ? "Choose journeys…"
            : picker
              ? "Choose cases…"
              : "Run",
          picker ? "secondary" : "primary",
        );
        button.disabled = Boolean(state.active);
        button.addEventListener("click", () => {
          if (picker) $(`${picker}-picker`).showModal();
          else requestRun({ suite: suite.id });
        });
        action.append(button);
        row.append(action);
        return row;
      }),
    );
    renderAbout();
    initializeSelectors();
    updateSelections();
    renderHistory();
    const pending = state.reports
      .filter((r) => !r.archived)
      .reduce((count, r) => count + pendingCount(r), 0);
    $("pending").hidden = !pending;
    $("pending").replaceChildren(
      ...(pending
        ? [
            String(pending),
            element("span", " need attention", "visually-hidden"),
          ]
        : []),
    );
    renderReview();
  } catch (error) {
    failure(error);
  }
}

// How it works: one comparison table across the suites, built from the guide
// the server ships with each suite.
function renderAbout() {
  const suites = state.suites.filter((suite) => suite.guide);
  $("compare").hidden = !suites.length;
  if (!suites.length) return;
  const cell = (tag, text, scope) => {
    const node = element(tag, text);
    if (scope) node.scope = scope;
    return node;
  };
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(cell("th", ""));
  for (const suite of suites) headRow.append(cell("th", suite.name, "col"));
  head.append(headRow);
  const body = document.createElement("tbody");
  for (const [label, key] of [
    ["Purpose", "purpose"],
    ["Execution", "execution"],
    ["Real", "real"],
    ["Mocked / simulated", "mocked"],
    ["Database & state lifecycle", "isolation"],
    ["Checks & review", "checks"],
    ["Doesn’t prove", "limits"],
  ]) {
    const tr = document.createElement("tr");
    tr.append(cell("th", label, "row"));
    for (const suite of suites) tr.append(element("td", suite.guide[key]));
    body.append(tr);
  }
  const tr = document.createElement("tr");
  tr.append(cell("th", "Code & saved output", "row"));
  for (const suite of suites) {
    const td = document.createElement("td");
    td.append(element("p", suite.guide.artifacts));
    const command = element("p", "Command: ");
    command.append(element("code", suite.command));
    td.append(command);
    const list = document.createElement("ul");
    for (const path of suite.guide.sources ?? []) {
      const item = document.createElement("li");
      item.append(element("code", path));
      list.append(item);
    }
    td.append(list);
    tr.append(td);
  }
  body.append(tr);
  $("compare").replaceChildren(
    $("compare").querySelector("caption"),
    head,
    body,
  );
}

// Recent runs: one row each; the selected run's output expands inline right
// under it.
const logPanel = $("log-panel");
const HISTORY_ROWS = 8;
let historyExpanded = false;
function renderHistory() {
  $("empty-runs").hidden = state.history.length > 0;
  const focusedRun = document.activeElement?.dataset.logRun;
  // Every judge pass adds a row, so the list folds to the latest few; an open
  // log stays visible.
  if (state.history.findIndex((r) => r.id === selectedLog) >= HISTORY_ROWS)
    historyExpanded = true;
  const shown = historyExpanded
    ? state.history
    : state.history.slice(0, HISTORY_ROWS);
  $("history").replaceChildren(
    ...shown.map((run) => {
      const row = element("div", "", "history-row");
      row.setAttribute("aria-current", String(run.id === selectedLog));
      const open = element("button", suiteName(run.suite), "history-open");
      open.type = "button";
      open.dataset.logRun = run.id;
      open.setAttribute("aria-expanded", String(run.id === selectedLog));
      const scope = scopeOf(run);
      if (scope) open.append(element("small", scope));
      const duration = element(
        "span",
        run.finishedAt || run.status === "running" ? elapsed(run) : "Unknown",
        "duration",
      );
      if (run.status === "running") duration.dataset.started = run.startedAt;
      row.append(
        chip(statusLabel(run.status), statusKind(run.status)),
        open,
        element("span", `${run.commit}${run.dirty ? " + local changes" : ""}`),
        element("span", formatDate(run.startedAt)),
        duration,
      );
      row.addEventListener("click", () => {
        selectedLog = selectedLog === run.id ? "" : run.id;
        renderHistory();
      });
      return row;
    }),
  );
  if (state.history.length > shown.length) {
    const more = element(
      "button",
      `Show all ${plural(state.history.length, "run")}`,
      "text-button history-more",
    );
    more.type = "button";
    more.addEventListener("click", () => {
      historyExpanded = true;
      renderHistory();
    });
    $("history").append(more);
  }
  const run = state.history.find((r) => r.id === selectedLog);
  // Re-attach before touching its children: replaceChildren above detaches it.
  logPanel.hidden = !run;
  if (run) {
    $("history").querySelector(`[aria-current="true"]`).after(logPanel);
    logPanel.querySelector("#log-title").textContent =
      `${suiteName(run.suite)} · ${statusLabel(run.status).toLowerCase()} · ${formatDate(run.startedAt)}`;
    logPanel.querySelector("#log").textContent =
      `${run.command ? `$ ${run.command}` : "Command not recorded for this older run."}\n\n${run.log}`;
  } else $("history").after(logPanel);
  if (focusedRun)
    document
      .querySelector(`[data-log-run="${CSS.escape(focusedRun)}"]`)
      ?.focus();
}
$("log-close").addEventListener("click", (event) => {
  event.stopPropagation();
  selectedLog = "";
  renderHistory();
});
logPanel.addEventListener("click", (event) => event.stopPropagation());
function tick() {
  if (state?.active) {
    const scope = scopeOf(state.active);
    $("active-text").textContent =
      `Running ${suiteName(state.active.suite)}${scope ? ` · ${scope}` : ""} · ${elapsed(state.active)}`;
  }
  for (const node of document.querySelectorAll("[data-started]"))
    node.textContent = elapsed({ startedAt: node.dataset.started });
}
setInterval(tick, 1000);

function renderReview() {
  const reports = state.reports;
  if (!reports.some((r) => r.run === selectedRun)) {
    selectedRun = (reports.find((r) => !r.archived) ?? reports[0])?.run ?? "";
    selectedCase = "";
    answerFilter = "attention";
  }
  $("empty-reviews").hidden = reports.length > 0;
  $("review-content").hidden = !reports.length;
  renderRuns();
  const saved = report();
  if (!saved) return;
  if (openRun !== saved.run) {
    openRun = saved.run;
    $("bulk-result").textContent = "";
    // Land on something useful: when nothing needs attention, show every
    // answer instead of an empty queue. Filter clicks after that are the
    // user's own.
    autoAll =
      answerFilter === "attention" &&
      saved.results.some((c) => c.reply) &&
      !pendingCount(saved);
    if (autoAll) answerFilter = "all";
  }
  const ordered = orderedResults(saved);
  const shown = shownResults(saved);
  if (!shown.some((c) => keyOf(c) === selectedCase))
    selectedCase = shown[0] ? keyOf(shown[0]) : "";
  renderAnswerList(saved, ordered, shown);
  renderRunHeader(saved);
  renderAnswer(saved, ordered, shown);
  fitSidebar();
}
// The sticky sidebar may only use the viewport space below its natural top,
// so the runs and answer queue scroll in place at scroll position zero. When
// the page scrolls for a long answer, the sidebar sticks 16px from the top.
function fitSidebar() {
  const layout = $("review-content");
  if (layout.hidden) return;
  const offset = Math.round(
    layout.getBoundingClientRect().top + window.scrollY,
  );
  document.documentElement.style.setProperty("--sidebar-offset", `${offset}px`);
}
window.addEventListener("resize", fitSidebar);

function runCard(r) {
  const li = document.createElement("li");
  const button = element("button", "", "run-card");
  button.type = "button";
  button.dataset.run = r.run;
  button.setAttribute("aria-current", String(r.run === selectedRun));
  button.disabled = busy;
  const answers = r.results.filter((c) => c.reply).length;
  const pending = pendingCount(r);
  button.append(
    element("strong", formatDate(r.startedAt)),
    element("small", `${r.model} · ${r.effort} · ${plural(answers, "answer")}`),
  );
  // The triage numbers make runs comparable at a glance; the same phrase on
  // every card carries no information.
  const counts = triageCounts(r);
  const human = r.results.filter(
    (c) => c.reply && reviewFor(r, "human", keyOf(c)),
  ).length;
  const summary = element("small");
  summary.append(
    element(
      "span",
      pending
        ? `${pending} need attention`
        : answers
          ? "Nothing needs attention"
          : "No saved answers",
      pending ? "todo" : answers ? "done" : "",
    ),
  );
  if (answers)
    summary.append(
      ` · ${counts.cleared} LLM-cleared · ${human} human-reviewed`,
    );
  button.append(summary);
  button.addEventListener("click", () => {
    if (selectedRun !== r.run) {
      selectedRun = r.run;
      selectedCase = "";
      answerFilter = "attention";
      renderReview();
    }
  });
  li.append(button);
  return li;
}
// A live run in progress sits at the top of the list. Its answers and
// judgments are saved when the runner finishes, so only scope and time are
// known until then.
function runningCard() {
  const li = document.createElement("li");
  const card = element("div", "", "run-card running");
  card.setAttribute("role", "status");
  const duration = element("small", elapsed(state.active));
  duration.dataset.started = state.active.startedAt;
  card.append(
    element("strong", "Running now"),
    element(
      "small",
      `${scopeOf(state.active) || "Live agent evals"} · answers are saved when the run finishes`,
    ),
    duration,
  );
  li.append(card);
  return li;
}
function renderRuns() {
  const active = state.reports.filter((r) => !r.archived);
  const archived = state.reports.filter((r) => r.archived);
  const focused = document.activeElement?.dataset.run;
  const live = state.active?.suite === "live";
  $("run-list").replaceChildren(
    ...(live ? [runningCard()] : []),
    ...active.map(runCard),
  );
  $("no-active-runs").hidden = live || active.length > 0;
  $("archived-runs").hidden = !archived.length;
  $("archived-count").textContent = `(${archived.length})`;
  $("archived-list").replaceChildren(...archived.map(runCard));
  if (archived.some((r) => r.run === selectedRun))
    $("archived-runs").open = true;
  if (focused)
    document
      .querySelector(`.run-card[data-run="${CSS.escape(focused)}"]`)
      ?.focus();
}

function renderAnswerList(saved, ordered, shown) {
  for (const button of document.querySelectorAll(".filters button")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.filter === answerFilter),
    );
    button.querySelector("span").textContent = String(
      ordered.filter((c) => matchesFilter(saved, c, button.dataset.filter))
        .length,
    );
  }
  $("answers-total").textContent = `${shown.length} of ${ordered.length}`;
  const focusedCase = document.activeElement?.dataset.caseKey;
  const repeated = new Set(ordered.map((c) => c.repetition)).size > 1;
  const rows = [];
  let lastCase = null;
  for (const c of shown) {
    if (repeated && c.caseId !== lastCase) {
      rows.push(element("li", caseName(c.caseId), "answer-group"));
      lastCase = c.caseId;
    }
    rows.push(answerRow(saved, c, repeated));
  }
  $("answer-list").replaceChildren(...rows);
  $("no-answers").hidden = shown.length > 0;
  $("no-answers").textContent = !ordered.length
    ? "This run saved no answers."
    : answerFilter === "attention"
      ? "Nothing needs attention. Open Cleared to spot-check the judge, or All to browse."
      : "No answers match this filter.";
  $("filter-note").hidden = !autoAll;
  $("filter-note").textContent = autoAll
    ? "Nothing needs attention, so all answers are shown."
    : "";
  if (focusedCase)
    document
      .querySelector(`.answer-open[data-case-key="${CSS.escape(focusedCase)}"]`)
      ?.focus();
}
// One row per saved answer. Runs with several repetitions group rows under the
// case name.
// "Not judged" is the quiet default; anything else earns a labeled chip.
function answerRow(saved, c, repeated) {
  const key = keyOf(c);
  const li = element("li", "", "answer-row");
  const button = element("button", "", "answer-open");
  button.type = "button";
  button.dataset.caseKey = key;
  button.setAttribute("aria-current", String(key === selectedCase));
  button.disabled = busy;
  button.append(
    element(
      "span",
      repeated ? `Repetition ${c.repetition}` : caseName(c.caseId),
      "answer-name",
    ),
  );
  const status = element("span", "", "answer-status");
  const llm = reviewFor(saved, "llm", key);
  if (!c.reply) status.append(chip("No answer", "todo"));
  else {
    const triage = triageFor(saved, c);
    if (triage.status === "needs-judge") {
      const dot = element("span", "", "dot");
      dot.append(element("span", triage.label, "visually-hidden"));
      status.append(dot);
    } else status.append(chip(triage.label, triageKinds[triage.status]));
    if (llm && triage.status !== "cleared") {
      const advice = chip("LLM", `llm ${VERDICTS[llm.verdict][1]}`);
      advice.append(
        element(
          "span",
          ` advice: ${VERDICTS[llm.verdict][0]}`,
          "visually-hidden",
        ),
      );
      status.append(advice);
    }
  }
  button.append(status);
  button.addEventListener("click", () => {
    selectedCase = key;
    renderReview();
  });
  li.append(button);
  return li;
}

function renderRunHeader(saved) {
  const caseCount =
    saved.caseIds?.length ?? new Set(saved.results.map((c) => c.caseId)).size;
  const answers = saved.results.filter((c) => c.reply).length;
  const plan = saved.repeats
    ? `${plural(caseCount, "case")} × ${plural(saved.repeats, "repetition")} = ${saved.plannedCases ?? caseCount * saved.repeats} planned`
    : `${plural(caseCount, "case")} · repetitions not recorded`;
  $("run-title").textContent = `Run from ${formatDate(saved.startedAt)}`;
  $("run-meta").textContent =
    `${saved.model} · ${saved.effort} effort · ${plan} · ${plural(answers, "answer")} saved · commit ${saved.commit.slice(0, 8)}${saved.dirty ? " + local changes" : ""}`;
  $("run-repeats").hidden = !(saved.repeats > 1);
  $("run-repeats").textContent =
    saved.repeats > 1
      ? `Each case was answered ${saved.repeats} times from a fresh application; every answer gets its own verdict.`
      : "";
  $("run-archived").hidden = !saved.archived;
  $("archive-run").textContent = saved.archived ? "Restore run" : "Archive run";
  $("archive-run").disabled = busy || Boolean(saved.archiveError);
  $("archive-error").hidden = !saved.archiveError;
  // One bar for the whole run: what still needs attention, what the judge
  // cleared, what you graded.
  const counts = triageCounts(saved);
  const segments = {
    failures: "failures",
    review: "needs-review",
    judge: "needs-judge",
    cleared: "cleared",
    reviewed: "reviewed",
  };
  for (const [segment, status] of Object.entries(segments))
    $("progress-bar").querySelector(`.${segment}`).style.width = saved.results
      .length
      ? `${(counts[status] / saved.results.length) * 100}%`
      : "0";
  const attention = pendingCount(saved);
  const humanReviewed = saved.results.filter(
    (c) => c.reply && reviewFor(saved, "human", keyOf(c)),
  ).length;
  const parts = [
    attention ? `${attention} need attention` : "Nothing needs attention",
  ];
  if (counts.cleared) parts.push(`${counts.cleared} LLM-cleared`);
  parts.push(`${humanReviewed} of ${answers} human-reviewed`);
  const compared = saved.results
    .map((c) => agreement(saved, c))
    .filter((verdict) => verdict !== null);
  if (compared.length)
    parts.push(
      `judge agreed ${compared.filter(Boolean).length} of ${compared.length}`,
    );
  $("progress-text").textContent = answers
    ? parts.join(" · ")
    : "No answers to review";
  $("progress-bar").setAttribute("aria-label", $("progress-text").textContent);
  // The runner's exit status lives under Run checks; the one failure that says
  // nothing about the answers is worth repeating here.
  $("run-notice").hidden = saved.sourcesUnchanged !== false;
  $("run-notice").textContent =
    saved.sourcesUnchanged === false
      ? "Source files changed while this run was in progress, so the runner reported a failure. The answers were saved and are reviewable; treat the run as a mixed-code baseline."
      : "";
}

function renderAnswer(saved, ordered, shown) {
  const current = record();
  $("empty-answers").hidden = Boolean(current);
  $("answer-detail").hidden = !current;
  if (!current) return;
  const key = keyOf(current);
  const triage = triageFor(saved, current);
  $("triage-chip").textContent = triage.label;
  $("triage-chip").className = `chip ${triageKinds[triage.status]}`;
  const agrees = agreement(saved, current);
  const llmVerdict = reviewFor(saved, "llm", key)?.verdict;
  $("triage-reason").textContent =
    triage.status === "cleared"
      ? "A retired judge policy and recorded code checks passed. Not human-approved."
      : triage.status === "needs-judge" || triage.label === "Failed checks"
        ? triage.reason
        : agrees === true
          ? "The judge agrees with your verdict."
          : agrees === false
            ? `The judge said ${VERDICTS[llmVerdict][0].toLowerCase()}; your verdict wins.`
            : triage.status === "reviewed"
              ? "Not judged by the LLM under the current policy."
              : "See the judgment and verdict below for the supporting evidence.";
  const index = shown.findIndex((c) => keyOf(c) === key);
  $("answer-position").textContent =
    index >= 0 ? `${index + 1} of ${shown.length}` : "";
  $("prev-answer").disabled = index <= 0;
  $("next-answer").disabled =
    index >= 0 ? index >= shown.length - 1 : !shown.length;
  const repetitions = ordered.filter((c) => c.caseId === current.caseId).length;
  $("case-title").textContent =
    repetitions > 1
      ? `${caseName(current.caseId)} · repetition ${current.repetition} of ${repetitions}`
      : caseName(current.caseId);
  $("case-meta").textContent =
    `${current.caseId} · ${saved.model} · ${saved.effort}`;
  // The casebook is gone, so every saved answer names a case that can no
  // longer be run, and the rubric a reader compares against is the one the
  // answer was recorded with.
  $("rerun-unavailable").hidden = false;
  const currentRubric = undefined;
  $("rubric").textContent = currentRubric ?? current.rubric;
  $("rubric-changed").hidden =
    !currentRubric || currentRubric === current.rubric;
  $("rubric-saved").textContent = `Saved with this run: ${current.rubric}`;
  const decisions = Array.isArray(current.input?.decisions)
    ? current.input.decisions
    : [];
  $("context").hidden = !decisions.length;
  $("context-list").replaceChildren(
    ...decisions.map((d) => {
      const li = document.createElement("li");
      li.append(
        chip(d.kind ?? "decision"),
        element("span", d.value ?? JSON.stringify(d)),
      );
      return li;
    }),
  );
  renderRich($("input"), current.input?.userMessage ?? "Not run.");
  renderRich($("answer"), current.reply?.message ?? "");
  $("answer").hidden = !current.reply;
  $("answer-error").hidden = Boolean(current.reply);
  $("answer-error").textContent =
    current.error ?? "No accepted answer was saved.";
  const proposals = current.reply?.decisionProposals ?? [];
  $("proposal-block").hidden = !current.reply;
  $("proposals-title").hidden = !proposals.length;
  $("no-proposals").hidden = proposals.length > 0;
  $("proposals").replaceChildren(
    ...proposals.map((p) => {
      const li = element("li", "", "proposal");
      const body = document.createElement("div");
      body.append(element("span", p?.value ?? JSON.stringify(p)));
      if (p?.replaces) {
        const existing = decisions.find((d) => d.id === p.replaces);
        body.append(
          element(
            "small",
            existing
              ? `Replaces: ${existing.value}`
              : `Replaces decision ${p.replaces}`,
          ),
        );
      }
      li.append(chip(p?.kind ?? "proposal"), body);
      return li;
    }),
  );
  const checks = Object.entries(current.checks);
  const passed = checks.filter(([, ok]) => ok).length;
  $("checks-summary").textContent = checks.length
    ? `Automatic checks · ${passed} of ${checks.length} passed`
    : "Automatic checks · none recorded";
  $("checks").replaceChildren(
    ...checks.map(([name, ok]) => element("li", name, ok ? "" : "failed")),
  );
  $("state").textContent = JSON.stringify(
    {
      before: current.before,
      after: current.after,
      nativeEvidence: current.nativeEvidence,
    },
    null,
    2,
  );
  const human = reviewFor(saved, "human", key);
  const llm = reviewFor(saved, "llm", key);
  $("judge-verdict").hidden = !llm;
  if (llm) {
    $("judge-verdict").textContent = VERDICTS[llm.verdict][0];
    $("judge-verdict").className = `chip llm ${VERDICTS[llm.verdict][1]}`;
  }
  $("judge-meta").textContent = llm
    ? `${llm.model} · ${llm.effort} · ${formatDate(llm.createdAt)}`
    : "";
  renderJudgment(llm?.reason, human);
  $("judge-result").className = `judgment${llm ? "" : " none"}`;
  $("judge-stale").hidden = !triage.stale;
  $("verdict").hidden = !reviewable(current);
  $("unreviewable").hidden = reviewable(current);
  for (const button of document.querySelectorAll(".verdict-button")) {
    button.setAttribute(
      "aria-pressed",
      String(human?.verdict === button.dataset.verdict),
    );
    button.disabled = busy;
    button.querySelector(".llm-tag")?.remove();
    if (llm?.verdict === button.dataset.verdict) {
      const tag = element("span", "LLM", "llm-tag");
      tag.setAttribute("aria-hidden", "true");
      button.append(tag);
    }
  }
  $("saved").className = human ? "ok" : "";
  $("saved").textContent = human
    ? `Saved · ${formatDate(human.createdAt)}`
    : "Not reviewed yet";
  const nextKey = `${saved.run}:${saved.hash}:${key}`;
  if (noteKey !== nextKey) {
    noteKey = nextKey;
    $("reason").value = notes.get(noteKey) ?? human?.reason ?? "";
    $("note-field").hidden = !$("reason").value;
  }
  $("note-toggle").textContent = $("note-field").hidden
    ? "Add a note"
    : "Hide note";
}
// The judge's first sentence is usually the reason for its verdict; the rest is
// evidence, folded away until asked for.
function renderJudgment(reason, human) {
  const node = $("judge-result");
  if (!reason) {
    node.textContent = human
      ? "Not judged by the LLM; your verdict stands on its own."
      : "Not judged yet.";
    return;
  }
  const split = reason.match(/^([\s\S]*?[.!?])(\s+)([\s\S]+)$/);
  if (!split) {
    node.replaceChildren(element("span", reason, "lead"));
    return;
  }
  const more = document.createElement("details");
  more.className = "judgment-more";
  more.open = openReasoning.has(selectedCase);
  more.append(element("summary", "Full reasoning"), element("p", split[3]));
  more.addEventListener("toggle", () => {
    if (more.open) openReasoning.add(selectedCase);
    else openReasoning.delete(selectedCase);
  });
  node.replaceChildren(element("span", split[1], "lead"), more);
}
$("note-toggle").addEventListener("click", () => {
  $("note-field").hidden = !$("note-field").hidden;
  $("note-toggle").textContent = $("note-field").hidden
    ? "Add a note"
    : "Hide note";
  if (!$("note-field").hidden) $("reason").focus();
});
$("reason").addEventListener("input", () =>
  notes.set(noteKey, $("reason").value),
);
function scrollToAnswer() {
  const top = $("answer-detail").getBoundingClientRect().top; // Start each answer from its top without hiding the run header when it already fits.
  if (top < 0 || top > window.innerHeight / 2)
    window.scrollTo({ top: window.scrollY + top - 20, behavior: "smooth" });
}
function step(direction) {
  const saved = report();
  if (!saved) return;
  const shown = shownResults(saved);
  if (!shown.length) return;
  const index = shown.findIndex((c) => keyOf(c) === selectedCase);
  const target = index < 0 ? shown[0] : shown[index + direction];
  if (!target) return;
  selectedCase = keyOf(target);
  renderReview();
  scrollToAnswer();
}
// One click is the whole review: save, then move to the next row so the queue
// keeps flowing.
async function saveVerdict(verdict) {
  const saved = report();
  const current = record();
  if (busy || !saved || !current || !reviewable(current)) return;
  const key = selectedCase;
  const index = shownResults(saved).findIndex((c) => keyOf(c) === key);
  const note = $("reason").value.trim();
  busy = true;
  renderReview();
  try {
    await api("/api/review", {
      run: saved.run,
      hash: saved.hash,
      key,
      review: { verdict, ...(note ? { reason: note } : {}) },
    });
    notes.delete(noteKey);
    noteKey = "";
    $("error").hidden = true;
    busy = false;
    await refresh();
    const shown = shownResults(report());
    const still = shown.findIndex((c) => keyOf(c) === key);
    const next =
      still >= 0 ? shown[still + 1] : (shown[index] ?? shown[index - 1]);
    selectedCase = next ? keyOf(next) : still >= 0 ? key : selectedCase;
    renderReview();
    if (next) scrollToAnswer();
  } catch (error) {
    failure(error);
  } finally {
    busy = false;
    renderReview();
  }
}
for (const button of document.querySelectorAll(".verdict-button"))
  button.addEventListener("click", () => {
    void saveVerdict(button.dataset.verdict);
  });
$("prev-answer").addEventListener("click", () => step(-1));
$("next-answer").addEventListener("click", () => step(1));
document.addEventListener("keydown", (event) => {
  if (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    $("reviews-panel").hidden ||
    document.querySelector("dialog[open]")
  )
    return;
  if (
    ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) ||
    event.target.isContentEditable
  )
    return;
  const shortcuts = {
    j: () => step(1),
    k: () => step(-1),
    p: () => saveVerdict("pass"),
    f: () => saveVerdict("fail"),
    d: () => saveVerdict("needs-discussion"),
  };
  if (shortcuts[event.key]) {
    event.preventDefault();
    void shortcuts[event.key]();
  }
});
for (const button of document.querySelectorAll(".filters button"))
  button.addEventListener("click", () => {
    answerFilter = button.dataset.filter;
    autoAll = false;
    renderReview();
  });
$("show-all").addEventListener("click", () => {
  answerFilter = "all";
  autoAll = false;
  renderReview();
});

async function start(input) {
  try {
    await api("/api/start", input);
    $("error").hidden = true;
    await refresh();
  } catch (error) {
    failure(error);
  }
}
// Nothing this dashboard starts costs anything or calls a model, so a run
// begins where it is asked for.
function requestRun(input) {
  void start(input);
}
for (const button of document.querySelectorAll("[data-close]"))
  button.addEventListener("click", () => {
    if (!busy) $(button.dataset.close).close();
  });
$("stop").addEventListener("click", () => {
  void api("/api/stop", {}).then(refresh).catch(failure);
});

// ------------------------------------------------ Development and Releases
//
// Both panels are read on demand rather than polled: nothing on them changes
// by itself except a workflow run, and a dashboard that re-fetched `gh` every
// 2.5 seconds would be rude to a laptop and to GitHub.

const bytes = (n) =>
  n == null
    ? "unknown size"
    : n >= 1e9
      ? `${(n / 1e9).toFixed(2)} GB`
      : n >= 1e6
        ? `${Math.round(n / 1e6)} MB`
        : `${Math.round(n / 1e3)} kB`;

const when = (iso) => {
  if (!iso) return "never";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "unknown";
  // GitHub answers with year 0001 for a draft that was never published,
  // which renders as a real date and reads as a very old one.
  return at.getUTCFullYear() < 1980 ? "not published" : at.toLocaleString();
};

function card(title, rows, extra = "") {
  const body = rows
    .filter(Boolean)
    .map(
      ([label, value, note]) =>
        `<div class="fact"><dt>${label}</dt><dd>${value}${note ? `<span class="footnote">${note}</span>` : ""}</dd></div>`,
    )
    .join("");
  return `<section class="surface"><h2>${title}</h2><dl class="facts">${body}</dl>${extra}</section>`;
}

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

function renderDevelopment(state) {
  const { checkout: here, running: live, records, applications } = state;
  const serving = live.serving;
  const mismatch =
    state.sameRevision === false
      ? `<p class="warn">The running Hallvi was built from ${escape((live.revision ?? "").slice(0, 9))}, not the ${escape(here.short ?? "")} in this checkout. Restart it to serve these files.</p>`
      : state.sameCheckout === false
        ? `<p class="warn">It is serving a different checkout from this dashboard: <code>${escape(serving?.path ?? "")}</code>${serving?.branch ? ` on <strong>${escape(serving.branch)}</strong> at <code>${escape(serving.short ?? "")}</code>` : ""}. The branch and revision above describe these files, not what is answering.</p>`
        : "";
  const edited = here.changed.length
    ? `${here.changed.length} tracked file${here.changed.length === 1 ? "" : "s"} changed`
    : "no tracked changes";

  const where = card("This checkout", [
    ["Path", `<code>${escape(here.path)}</code>`],
    ["Branch", escape(here.branch ?? "detached")],
    ["Revision", `<code>${escape(here.short ?? "unknown")}</code>`, edited],
  ]);

  const process = card(
    "What is running",
    [
      [
        "Address",
        live.up
          ? `<a href="${escape(live.address)}" target="_blank" rel="noreferrer">${escape(live.address)}</a>`
          : `${escape(live.address)} — not answering`,
      ],
      live.up && [
        "Serving",
        serving
          ? `<code>${escape(serving.path)}</code>`
          : "could not be determined",
        serving && state.sameCheckout ? "this checkout" : undefined,
      ],
      live.up &&
        serving && [
          "Its branch",
          `${escape(serving.branch ?? "detached")} at <code>${escape(serving.short ?? "unknown")}</code>`,
          serving.changed.length
            ? `${serving.changed.length} tracked file${serving.changed.length === 1 ? "" : "s"} changed there`
            : undefined,
        ],
      live.up && [
        "Release identity",
        live.revision
          ? `<code>${escape(live.revision.slice(0, 9))}</code>${live.version ? ` · ${escape(live.version)}` : ""}`
          : "none — a development run is not built from a release",
      ],
    ],
    mismatch,
  );

  const store = records
    ? card("Its records", [
        [
          "Database",
          `<code>${escape(records.path)}</code>`,
          state.paired ? "from this launch" : "registered, not discovered",
        ],
        [
          "Schema",
          records.schema == null ? "unreadable" : String(records.schema),
        ],
        [
          "Browse",
          live.up
            ? `<a href="${escape(records.browser)}" target="_blank" rel="noreferrer">open Hallvi</a> — the <strong>Database</strong> link in its top bar opens Drizzle Studio on this file`
            : "start <code>npm run dev</code> to browse it",
        ],
      ])
    : card("Its records", [
        [
          "Database",
          state.paired ? "not created yet" : "none registered",
          state.paired
            ? "run npm run db:push in this checkout"
            : "start npm run dev, or attach a retained application",
        ],
      ]);

  const apps = applications.length
    ? `<section class="surface"><h2>Retained applications</h2><p class="footnote">Each keeps its own Hallvi records outside every checkout and is deployed on ${escape(state.host?.address ?? "a shared host")}. One checkout at a time attaches one; this list links to whoever has it and opens none of their records.</p><ul class="plain">${applications
        .map(
          (application) =>
            `<li><strong>${escape(application.directory)}</strong> <code>${escape(application.id.slice(0, 8))}</code> · ${
              application.owner
                ? `attached from <code>${escape(application.owner.worktree ?? "")}</code> on <strong>${escape(application.owner.branch ?? "detached")}</strong> — <a href="${escape(application.owner.address)}" target="_blank" rel="noreferrer">${escape(application.owner.address)}</a>`
                : application.lastStop
                  ? `free; its last runtime ${application.lastStop === "forced" ? "was stopped before Pi was known to be idle" : "did not detach"}`
                  : "free"
            }<br><span class="footnote">${escape(application.exercises ?? "")} · schema ${escape(String(application.schema))}, Pi ${escape(application.pi)}</span>${application.url ? `<br><a href="${escape(application.url)}" target="_blank" rel="noreferrer">${escape(application.url)}</a>` : ""}</li>`,
        )
        .join("")}</ul></section>`
    : "";

  const copies = state.backups.length
    ? `<section class="surface"><h2>Retained environment copies</h2><ul class="plain">${state.backups
        .map(
          (backup) =>
            `<li><code>${escape(backup.path.replace(/^.*hallvi-dev\//, ""))}</code><br><span class="footnote">${escape(backup.kind)} · ${escape(when(backup.takenAt))}</span></li>`,
        )
        .join("")}</ul></section>`
    : `<section class="surface"><h2>Retained environment copies</h2><p class="footnote">None recorded yet.</p></section>`;

  $("development-body").innerHTML = where + process + store + apps + copies;
}

function renderReleases(state) {
  const here = state.checkout;
  const transitions = state.migrations.length
    ? state.migrations.map((step) => `${step.from} to ${step.to}`).join(", ")
    : "none";

  const what = card("What would be built", [
    ["Version", escape(state.version ?? "unknown")],
    [
      "From revision",
      `<code>${escape(here.revision ?? "unknown")}</code>`,
      escape(here.branch ?? ""),
    ],
    ["Platforms", state.platforms.map(escape).join(" and ")],
    [
      "Schema",
      `${escape(String(state.schema ?? "?"))}`,
      `migrations it could carry out: ${escape(transitions)}`,
    ],
    [
      "Local changes",
      state.excludesLocalChanges
        ? `${here.changed.length} changed file${here.changed.length === 1 ? "" : "s"} would <strong>not</strong> be in it`
        : "none — the revision is what is on disk",
      state.excludesLocalChanges
        ? escape(here.changed.slice(0, 6).join(", "))
        : undefined,
    ],
  ]);

  const contents = state.built.length
    ? state.built
        .map((archive) => {
          const boundary = archive.contents;
          const leaks = boundary
            ? boundary.absent.filter((rule) => rule.offenders.length)
            : [];
          const missing = boundary
            ? boundary.present.filter((rule) => !rule.there)
            : [];
          const verdict = !boundary
            ? `<p class="footnote">Could not read the archive.</p>`
            : leaks.length || missing.length
              ? `<p class="warn">${leaks
                  .map(
                    (rule) =>
                      `${escape(rule.what)} — found ${escape(rule.offenders.join(", "))}`,
                  )
                  .concat(missing.map((rule) => `missing ${escape(rule.path)}`))
                  .join("; ")}</p>`
              : `<p class="ok">Checked against the built archive: ${boundary.absent.length} things that must not ship are absent, and ${boundary.present.length} that must ship are present.</p>`;
          return card(
            `Built: ${escape(archive.name)}${archive.stale ? " (older packaging)" : ""}`,
            [
              ["Size", escape(bytes(archive.size))],
              ["Built", escape(when(archive.builtAt))],
              [
                "SHA-256",
                archive.checksum
                  ? `<code>${escape(archive.checksum.slice(0, 24))}…</code>`
                  : "no checksum beside it",
              ],
              [
                "Entries",
                archive.entries == null ? "unknown" : String(archive.entries),
              ],
            ],
            `${archive.stale ? `<p class="warn">This archive's name carries no platform, so it predates the current packaging. Build again before reading anything into the list below.</p>` : ""}${verdict}${boundary ? `<p class="footnote">${escape(boundary.shared)}</p>` : ""}`,
          );
        })
        .join("")
    : card("Contents, as planned", [
        [
          "Nothing built yet",
          `The archive would carry ${state.plannedContents ? state.plannedContents.length : "the allowlisted"} paths from <code>scripts/package.mjs</code>, plus a pinned Node.js, the built interface and production dependencies.`,
          "This is the plan, not a measurement. Build one to have its contents read from the archive itself.",
        ],
      ]);

  const drafts = Array.isArray(state.releases) ? state.releases : [];
  const draftRows = drafts.length
    ? `<ul class="plain">${drafts
        .map(
          (release) =>
            `<li><strong>${escape(release.tagName)}</strong> — ${release.isDraft ? "draft" : "published"}${release.isPrerelease ? " · prerelease" : ""}<br><span class="footnote">${escape(when(release.publishedAt ?? release.createdAt))}</span>${
              release.isDraft
                ? ` <button class="secondary small" type="button" data-publish="${escape(release.tagName)}">Review and publish</button>`
                : ""
            }</li>`,
        )
        .join("")}</ul>`
    : `<p class="footnote">No releases yet.</p>`;

  const runs = Array.isArray(state.runs) ? state.runs : [];
  const runRows = runs.length
    ? `<ul class="plain">${runs
        .map(
          (run) =>
            `<li><a href="${escape(run.url)}" target="_blank" rel="noreferrer">run ${escape(run.databaseId)}</a> — ${escape(run.status)}${run.conclusion ? ` · ${escape(run.conclusion)}` : ""}<br><span class="footnote"><code>${escape(String(run.headSha ?? "").slice(0, 9))}</code> · ${escape(when(run.createdAt))}</span></li>`,
        )
        .join("")}</ul>`
    : `<p class="footnote">No workflow runs yet.</p>`;

  const actions =
    state.actionsEnabled === false
      ? `<p class="warn" role="status">Release building is unavailable: GitHub Actions is disabled for this repository. A maintainer must enable it in repository Settings → Actions → General before starting a draft build.</p>`
      : state.signedIn
        ? `<div class="actions"><button id="build-release" class="primary" type="button" data-version="${escape(state.version ?? "")}" data-revision="${escape(here.revision ?? "")}">Build draft release</button></div>
       <p class="footnote">Dispatches the existing workflow for version ${escape(state.version ?? "")} at <code>${escape((here.revision ?? "").slice(0, 9))}</code>. Signing stays in the workflow. Publishing promotes the reviewed draft without rebuilding it.</p>`
        : `<p class="warn">Not signed in to GitHub. Run <code>gh auth login</code>; no token is entered here.</p>`;

  $("releases-body").innerHTML =
    what +
    contents +
    `<section class="surface"><h2>Releases</h2>${draftRows}</section>` +
    `<section class="surface"><h2>Workflow runs</h2>${runRows}${actions}</section>`;
}

async function loadPanel(path, into, render) {
  $(into).innerHTML = `<p class="footnote">Reading…</p>`;
  try {
    const response = await fetch(path, {
      headers: { "X-Hallvi-Testing-Token": token },
    });
    if (!response.ok)
      throw new Error((await response.json()).error ?? "unavailable");
    render(await response.json());
  } catch (error) {
    $(into).innerHTML =
      `<section class="surface"><p class="warn">${escape(error.message)}</p></section>`;
  }
}

document.addEventListener("click", async (event) => {
  const build = event.target.closest("#build-release");
  if (build) {
    build.disabled = true;
    try {
      const answer = await api("/api/releases/build", {
        version: build.dataset.version,
        revision: build.dataset.revision,
      });
      if (answer?.started === true) {
        await loadPanel("/api/releases", "releases-body", renderReleases);
      } else {
        window.alert(
          answer?.error ??
            "The workflow did not start. Retry after checking GitHub Actions.",
        );
      }
    } catch (error) {
      window.alert(
        `Could not start the release build: ${error.message}. Check the connection and retry.`,
      );
    } finally {
      build.disabled = false;
    }
    return;
  }
  const publish = event.target.closest("[data-publish]");
  if (!publish) return;
  const tag = publish.dataset.publish;
  if (
    !window.confirm(
      `Publish ${tag}? This promotes the draft's existing assets. Nothing is rebuilt.`,
    )
  )
    return;
  publish.disabled = true;
  try {
    const answer = await api("/api/releases/publish", { tag });
    if (answer?.published === true) {
      await loadPanel("/api/releases", "releases-body", renderReleases);
    } else {
      window.alert(
        answer?.error ?? `${tag} was not published. Check the draft and retry.`,
      );
    }
  } catch (error) {
    window.alert(
      `Could not publish ${tag}: ${error.message}. Check the connection and retry.`,
    );
  } finally {
    publish.disabled = false;
  }
});

// Two real URLs sharing one shell, so moving between them keeps unsaved notes.
const pages = {
  "/": ["runs", "checks-link", "checks-title", "Run checks"],
  "/evals": ["reviews", "reviews-link", "reviews-title", "Eval runs"],
  "/development": [
    "development",
    "development-link",
    "development-title",
    "Development",
  ],
  "/releases": ["releases", "releases-link", "releases-title", "Releases"],
  "/about": ["about", "about-link", "about-title", "How it works"],
};
function currentPage() {
  return pages[location.pathname] ?? pages["/"];
}
function renderPage() {
  const [panel, link, , title] = currentPage();
  if (panel === "development")
    void loadPanel("/api/development", "development-body", renderDevelopment);
  if (panel === "releases")
    void loadPanel("/api/releases", "releases-body", renderReleases);
  for (const [name, id] of Object.values(pages)) {
    $(`${name}-panel`).hidden = name !== panel;
    if (id === link) $(id).setAttribute("aria-current", "page");
    else $(id).removeAttribute("aria-current");
  }
  document.title = `${title} · Hallvi Testing`;
}
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-route]");
  if (
    !link ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  if (link.getAttribute("href") !== location.pathname)
    history.pushState(null, "", link.getAttribute("href"));
  renderPage();
  $(currentPage()[2]).focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
window.addEventListener("popstate", renderPage);
$("archive-run").addEventListener("click", async () => {
  const saved = report();
  if (busy || !saved) return;
  const input = { run: saved.run, hash: saved.hash, archived: !saved.archived };
  busy = true;
  renderReview();
  try {
    await api("/api/runs/archive", input);
    $("error").hidden = true;
    busy = false;
    await refresh();
    $("bulk-result").textContent = input.archived
      ? "Run archived. It stays readable under Archived runs, and every answer and verdict is preserved."
      : "Run restored to the active list.";
  } catch (error) {
    failure(error);
  } finally {
    busy = false;
    renderReview();
  }
});

function initializeSelectors() {
  if (!selectorsReady) {
    $("journey-options").replaceChildren(
      ...state.journeys.map((item) => {
        const row = element("div", "", "selection-option");
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.value = item.id;
        input.checked = true;
        const copy = element("span", "", "selection-copy");
        const title = element("span", item.name, "selection-title");
        if (item.smoke)
          title.append(element("span", "CI · Every PR", "chip ci-badge"));
        copy.append(title, element("small", item.description ?? item.rubric));
        label.append(input, copy);
        row.append(label);
        input.addEventListener("change", updateSelections);
        if (item.message) {
          const details = document.createElement("details");
          details.append(
            element("summary", "Exact input"),
            element("p", item.message),
          );
          row.append(details);
        }
        return row;
      }),
    );
  }
  selectorsReady = true;
}
function selectedOptions(prefix) {
  return Array.from(
    $(`${prefix}-options`).querySelectorAll(".selection-option input:checked"),
  ).map((input) => input.value);
}
function updateSelections() {
  const journeys = selectedOptions("journey").length;
  $("journey-count").textContent =
    `${journeys} of ${state.journeys.length} journeys selected · no model calls`;
  $("run-journeys").disabled = Boolean(state.active) || !journeys;
  for (const control of $("journey-picker").querySelectorAll(
    "input,select,.selection-actions button",
  ))
    control.disabled = Boolean(state.active);
}
for (const action of ["all", "clear"])
  $(`journeys-${action}`).addEventListener("click", () => {
    for (const input of $("journey-options").querySelectorAll("input"))
      input.checked = action === "all";
    updateSelections();
  });
$("run-journeys").addEventListener("click", () => {
  $("journey-picker").close();
  requestRun({ suite: "e2e", journeys: selectedOptions("journey") });
});

$("origin").textContent = `Local · ${location.host}`; // Loopback only; the host doubles as the reminder.
renderPage();
void refresh();
setInterval(() => {
  if (!document.hidden) void refresh();
}, 2500);
