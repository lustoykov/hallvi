const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="testing-token"]').content;
let state = null;
let stateSignature = "";
let selectedRun = "";
let selectedCase = "";
let selectedLog = "";
let answerFilter = "attention";
let noteKey = "";
let pendingRun = null;
let returnToEvalPicker = false;
let judgePreferences = null;
let selectorsReady = false;
let expandedSuite = "";
let busy = false;
const notes = new Map();
const openReasoning = new Set();
let openRun = "";
const VERDICTS = { pass: ["Pass", "pass"], fail: ["Fail", "fail"], "needs-discussion": ["Needs discussion", "discuss"] };
const keyOf = (record) => `${record.caseId}:${record.repetition}`;
const reviewable = (record) => Boolean(record.reply && record.input);
const attentionStatuses = ["needs-judge", "needs-review", "failures"];
const triageKinds = { "needs-judge": "todo", "needs-review": "discuss", failures: "fail", cleared: "llm pass", reviewed: "pass" };
const triageFor = (saved, c) => saved.triage[keyOf(c)];
const formatDate = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;
function element(tag, text, className) { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; }
function chip(text, kind) { return element("span", text, `chip ${kind ?? ""}`.trim()); }
function report() { return state?.reports.find((r) => r.run === selectedRun); }
function record() { return orderedResults(report()).find((c) => keyOf(c) === selectedCase); }
function reviewFor(saved, type, key) { return saved?.reviews.filter((v) => v.type === type && v.key === key).at(-1); }
function caseName(id) { return state.evalCases.find((c) => c.id === id)?.name ?? id; }
function suiteName(id) { return state.suites.find((s) => s.id === id)?.name ?? (id === "judge" ? "LLM judgments" : id); }
const statusLabel = (status) => status === "timed-out" ? "Timed out" : status.charAt(0).toUpperCase() + status.slice(1);
const statusKind = (status) => ({ passed: "pass", running: "discuss" })[status] ?? "fail";
function elapsed(run) {
  const seconds = Math.max(0, (run.finishedAt ? Date.parse(run.finishedAt) : Date.now()) - Date.parse(run.startedAt)) / 1000;
  return `${seconds >= 10 ? Math.round(seconds) : seconds.toFixed(1)} s`;
}
// What a recorded run covered, read back from its explicit runner options.
function scopeOf(run) {
  const command = run.command ?? "";
  const listed = (names, noun) => names.length > 3 ? `${names.slice(0, 3).join(", ")} + ${plural(names.length - 3, `more ${noun}`)}` : names.join(", ");
  const journeys = command.match(/@journey-\(\?:([^)]+)\)/)?.[1].split("|");
  if (journeys) return journeys.length === state.journeys.length ? `All ${plural(journeys.length, "journey")}` : listed(journeys.map((id) => state.journeys.find((j) => j.id === id)?.name ?? id), "journey");
  const cases = command.match(/PI_EVAL_CASES=([\w,.-]+)/)?.[1].split(",");
  if (cases) {
    const repeats = Number(command.match(/PI_EVAL_REPEATS=(\d+)/)?.[1] ?? 1);
    const scope = cases.length === state.evalCases.length ? `All ${plural(cases.length, "case")}` : cases.length === 1 ? caseName(cases[0]) : listed(cases.map(caseName), "case");
    return repeats > 1 ? `${scope} × ${plural(repeats, "repetition")}` : scope;
  }
  const keys = command.match(/PI_JUDGE_CASES='(\[[^']*\])'/)?.[1];
  if (keys) { try { return plural(JSON.parse(keys).length, "saved answer"); } catch { return ""; } }
  return "";
}
// Repetitions of one case sit together so a reviewer compares them back to back.
function orderedResults(saved) {
  if (!saved) return [];
  const order = []; for (const c of saved.results) if (!order.includes(c.caseId)) order.push(c.caseId);
  return [...saved.results].sort((a, b) => order.indexOf(a.caseId) - order.indexOf(b.caseId) || a.repetition - b.repetition);
}
function matchesFilter(saved, c, filter) {
  const status = triageFor(saved, c).status;
  return filter === "all" || (filter === "attention" ? attentionStatuses.includes(status) : filter === "reviewed" ? Boolean(reviewFor(saved, "human", keyOf(c))) : status === filter);
}
function shownResults(saved) { return orderedResults(saved).filter((c) => matchesFilter(saved, c, answerFilter)); }
function pendingCount(saved) { return saved.results.filter((c) => attentionStatuses.includes(triageFor(saved, c).status)).length; }
// The run's Judge button: first whatever lacks a current judgment (answers you graded yourself are your call and are
// left alone), then "again" for what the current filter shows, then the whole run.
function judgeTargets(saved, shown) {
  const all = orderedResults(saved).filter(reviewable);
  const unjudged = all.filter((c) => triageFor(saved, c).status === "needs-judge");
  if (unjudged.length) return { keys: unjudged.map(keyOf), label: `Judge ${plural(unjudged.length, "unjudged answer")}…`, title: `Judge ${plural(unjudged.length, "unjudged answer")}`, primary: true };
  const subset = shown.filter(reviewable);
  if (subset.length && subset.length < all.length) return { keys: subset.map(keyOf), label: subset.length === 1 ? "Judge this one again…" : `Judge these ${subset.length} again…`, title: `Judge ${plural(subset.length, "answer")} again`, primary: false };
  return { keys: all.map(keyOf), label: "Judge run again…", title: `Judge all ${all.length} answers again`, primary: false };
}
// Where you and a current judgment both exist, the judge is either right or wrong; that is the calibration signal.
function agreement(saved, c) {
  const human = reviewFor(saved, "human", keyOf(c)); const llm = reviewFor(saved, "llm", keyOf(c));
  return human && llm && triageFor(saved, c).judged ? human.verdict === llm.verdict : null;
}
function failure(error) { $("error").textContent = error.message; $("error").hidden = false; }
async function api(path, body) {
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: { "X-SG-Testing-Token": token, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error); return value;
}
// Safe rich text: paragraphs, line breaks and **bold** become nodes; nothing is parsed as HTML.
function renderRich(node, text) {
  node.replaceChildren(...text.split(/\n{2,}/).map((block) => {
    const paragraph = document.createElement("p");
    for (const part of block.split(/(\*\*[^*\n]+\*\*)/)) {
      if (/^\*\*[^*\n]+\*\*$/.test(part)) { paragraph.append(element("strong", part.slice(2, -2))); continue; }
      part.split("\n").forEach((line, index) => { if (index) paragraph.append(document.createElement("br")); paragraph.append(line); });
    }
    return paragraph;
  }));
}

function suiteExplanation(suite) {
  const row = element("tr", "", "suite-explanation"); row.id = `suite-details-${suite.id}`;
  const cell = document.createElement("td"); cell.colSpan = 5;
  const section = element("section", "", "suite-guide"); section.setAttribute("aria-label", `${suite.name} explained`);
  section.append(element("p", suite.guide.purpose, "suite-purpose"));
  const facts = document.createElement("dl");
  for (const [label, key] of [["Execution", "execution"], ["Real", "real"], ["Mocked / simulated", "mocked"], ["Database boundary", "isolation"], ["Checks & review", "checks"], ["Doesn’t prove", "limits"]]) {
    facts.append(element("dt", label), element("dd", suite.guide[key]));
  }
  const technical = document.createElement("details");
  technical.append(element("summary", "Code & saved output"), element("p", suite.guide.artifacts));
  const command = element("p", "Command: "); command.append(element("code", suite.command)); technical.append(command);
  const sources = document.createElement("ul");
  for (const path of suite.guide.sources) { const item = document.createElement("li"); item.append(element("code", path)); sources.append(item); }
  technical.append(sources); section.append(facts, technical); cell.append(section); row.append(cell);
  return row;
}

async function refresh() {
  try {
    const nextState = await api("/api/state");
    const signature = JSON.stringify(nextState);
    if (signature === stateSignature) return; // Preserve keyboard focus and open controls between polls.
    stateSignature = signature; state = nextState;
    $("stale").hidden = (state.apiVersion ?? 0) >= 4; // The page can outrun the server process behind it.
    $("active").hidden = !state.active; tick();
    const focusedSuite = document.activeElement?.dataset.suiteHelp;
    $("suites").replaceChildren(...state.suites.flatMap((suite) => {
      const row = document.createElement("tr"); const name = document.createElement("td");
      if (suite.guide) {
        const explain = element("button", suite.name, "suite-explain"); explain.type = "button";
        explain.id = `suite-help-${suite.id}`; explain.dataset.suiteHelp = suite.id;
        explain.setAttribute("aria-label", `About ${suite.name}`);
        explain.setAttribute("aria-expanded", String(expandedSuite === suite.id));
        explain.setAttribute("aria-controls", `suite-details-${suite.id}`);
        explain.addEventListener("click", () => {
          expandedSuite = expandedSuite === suite.id ? "" : suite.id;
          $("suites").querySelector(".suite-explanation")?.remove();
          for (const button of $("suites").querySelectorAll("[data-suite-help]")) button.setAttribute("aria-expanded", String(button.dataset.suiteHelp === expandedSuite));
          if (expandedSuite) row.after(suiteExplanation(suite));
        });
        name.append(explain);
      } else name.append(element("strong", suite.name));
      name.append(element("small", suite.scope));
      if (suite.id === "live") { const links = element("div", "", "suite-links"); const link = element("a", "View saved runs", "text-button"); link.href = "/evals"; link.dataset.route = ""; links.append(link); name.append(links); }
      const last = state.history.find((r) => r.suite === suite.id); const resultCell = document.createElement("td"); const result = element("div", "", "last-result");
      if (last) result.append(chip(statusLabel(last.status), statusKind(last.status)), element("small", formatDate(last.startedAt))); else result.append(element("small", "Not run yet"));
      const usage = document.createElement("td"); usage.append(chip(suite.cost, suite.id === "live" ? "usage-paid" : "usage-free"));
      const schedule = element("td", "", "suite-schedule"); schedule.append(element("span", suite.ci));
      if (suite.ciDetail) schedule.append(element("small", suite.ciDetail));
      resultCell.append(result); row.append(name, usage, schedule, resultCell);
      const picker = suite.id === "e2e" ? "journey" : suite.id === "live" ? "eval" : null;
      const action = document.createElement("td"); const button = element("button", picker === "journey" ? "Choose journeys…" : picker ? "Choose cases…" : "Run", picker ? "secondary" : "primary");
      button.disabled = Boolean(state.active);
      button.addEventListener("click", () => { if (picker) $(`${picker}-picker`).showModal(); else requestRun({ suite: suite.id }); });
      action.append(button); row.append(action); return [row, ...(expandedSuite === suite.id && suite.guide ? [suiteExplanation(suite)] : [])];
    }));
    if (focusedSuite) $(`suite-help-${focusedSuite}`)?.focus({ preventScroll: true });
    initializeSelectors(); updateSelections();
    renderHistory();
    const pending = state.reports.filter((r) => !r.archived).reduce((count, r) => count + pendingCount(r), 0);
    $("pending").hidden = !pending;
    $("pending").replaceChildren(...(pending ? [String(pending), element("span", " need attention", "visually-hidden")] : []));
    renderReview();
  } catch (error) { failure(error); }
}

// Recent runs: one row each; the selected run's output expands inline right under it.
const logPanel = $("log-panel");
function renderHistory() {
  $("empty-runs").hidden = state.history.length > 0;
  const focusedRun = document.activeElement?.dataset.logRun;
  $("history").replaceChildren(...state.history.map((run) => {
    const row = element("div", "", "history-row"); row.setAttribute("aria-current", String(run.id === selectedLog));
    const open = element("button", suiteName(run.suite), "history-open"); open.type = "button"; open.dataset.logRun = run.id;
    open.setAttribute("aria-expanded", String(run.id === selectedLog));
    const scope = scopeOf(run); if (scope) open.append(element("small", scope));
    const duration = element("span", run.finishedAt || run.status === "running" ? elapsed(run) : "Unknown", "duration");
    if (run.status === "running") duration.dataset.started = run.startedAt;
    row.append(chip(statusLabel(run.status), statusKind(run.status)), open, element("span", `${run.commit}${run.dirty ? " + local changes" : ""}`), element("span", formatDate(run.startedAt)), duration);
    row.addEventListener("click", () => { selectedLog = selectedLog === run.id ? "" : run.id; renderHistory(); });
    return row;
  }));
  const run = state.history.find((r) => r.id === selectedLog);
  logPanel.hidden = !run; // Re-attach before touching its children: replaceChildren above detaches it.
  if (run) {
    $("history").querySelector(`[aria-current="true"]`).after(logPanel);
    logPanel.querySelector("#log-title").textContent = `${suiteName(run.suite)} · ${statusLabel(run.status).toLowerCase()} · ${formatDate(run.startedAt)}`;
    logPanel.querySelector("#log").textContent = `${run.command ? `$ ${run.command}` : "Command not recorded for this older run."}\n\n${run.log}`;
  } else $("history").after(logPanel);
  if (focusedRun) document.querySelector(`[data-log-run="${CSS.escape(focusedRun)}"]`)?.focus();
}
$("log-close").addEventListener("click", (event) => { event.stopPropagation(); selectedLog = ""; renderHistory(); });
logPanel.addEventListener("click", (event) => event.stopPropagation());
function tick() {
  if (state?.active) $("active-text").textContent = `Running ${suiteName(state.active.suite)} · ${elapsed(state.active)}`;
  for (const node of document.querySelectorAll("[data-started]")) node.textContent = elapsed({ startedAt: node.dataset.started });
}
setInterval(tick, 1000);

function renderReview() {
  const reports = state.reports;
  if (!reports.some((r) => r.run === selectedRun)) {
    selectedRun = (reports.find((r) => !r.archived) ?? reports[0])?.run ?? ""; selectedCase = ""; answerFilter = "attention";
  }
  $("empty-reviews").hidden = reports.length > 0; $("review-content").hidden = !reports.length;
  renderRuns();
  const saved = report();
  if (!saved) return;
  if (openRun !== saved.run) { openRun = saved.run; $("bulk-result").textContent = ""; }
  const ordered = orderedResults(saved); const shown = shownResults(saved);
  if (!shown.some((c) => keyOf(c) === selectedCase)) selectedCase = shown[0] ? keyOf(shown[0]) : "";
  renderAnswerList(saved, ordered, shown);
  renderRunHeader(saved, shown);
  renderAnswer(saved, ordered, shown);
}

function runCard(r) {
  const li = document.createElement("li"); const button = element("button", "", "run-card"); button.type = "button";
  button.dataset.run = r.run; button.setAttribute("aria-current", String(r.run === selectedRun)); button.disabled = busy;
  const answers = r.results.filter((c) => c.reply).length; const pending = pendingCount(r);
  button.append(element("strong", formatDate(r.startedAt)), element("small", `${r.model} · ${r.effort} · ${plural(answers, "answer")}`));
  button.append(element("small", pending ? `${pending} need attention` : answers ? "Nothing needs attention" : "No saved answers", pending ? "todo" : answers ? "done" : ""));
  button.addEventListener("click", () => { if (selectedRun !== r.run) { selectedRun = r.run; selectedCase = ""; answerFilter = "attention"; renderReview(); } });
  li.append(button); return li;
}
function renderRuns() {
  const active = state.reports.filter((r) => !r.archived); const archived = state.reports.filter((r) => r.archived);
  const focused = document.activeElement?.dataset.run;
  $("run-list").replaceChildren(...active.map(runCard)); $("no-active-runs").hidden = active.length > 0;
  $("archived-runs").hidden = !archived.length; $("archived-count").textContent = `(${archived.length})`;
  $("archived-list").replaceChildren(...archived.map(runCard));
  if (archived.some((r) => r.run === selectedRun)) $("archived-runs").open = true;
  if (focused) document.querySelector(`.run-card[data-run="${CSS.escape(focused)}"]`)?.focus();
}

function renderAnswerList(saved, ordered, shown) {
  for (const button of document.querySelectorAll(".filters button")) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === answerFilter));
    button.querySelector("span").textContent = String(ordered.filter((c) => matchesFilter(saved, c, button.dataset.filter)).length);
  }
  $("answers-total").textContent = `${shown.length} of ${ordered.length}`;
  const focusedCase = document.activeElement?.dataset.caseKey;
  const repeated = new Set(ordered.map((c) => c.repetition)).size > 1;
  const rows = []; let lastCase = null;
  for (const c of shown) {
    if (repeated && c.caseId !== lastCase) { rows.push(element("li", caseName(c.caseId), "answer-group")); lastCase = c.caseId; }
    rows.push(answerRow(saved, c, repeated));
  }
  $("answer-list").replaceChildren(...rows);
  $("no-answers").hidden = shown.length > 0;
  $("no-answers").textContent = !ordered.length ? "This run saved no answers." : answerFilter === "attention" ? "Nothing needs attention. Open Cleared to spot-check the judge, or All to browse." : "No answers match this filter.";
  if (focusedCase) document.querySelector(`.answer-open[data-case-key="${CSS.escape(focusedCase)}"]`)?.focus();
}
// One row per saved answer. Runs with several repetitions group rows under the case name.
// "Not judged" is the quiet default; anything else earns a labeled chip.
function answerRow(saved, c, repeated) {
  const key = keyOf(c); const li = element("li", "", "answer-row");
  const button = element("button", "", "answer-open"); button.type = "button"; button.dataset.caseKey = key;
  button.setAttribute("aria-current", String(key === selectedCase)); button.disabled = busy;
  button.append(element("span", repeated ? `Repetition ${c.repetition}` : caseName(c.caseId), "answer-name"));
  const status = element("span", "", "answer-status"); const llm = reviewFor(saved, "llm", key);
  if (!c.reply) status.append(chip("No answer", "todo"));
  else {
    const triage = triageFor(saved, c);
    if (triage.status === "needs-judge") { const dot = element("span", "", "dot"); dot.append(element("span", triage.label, "visually-hidden")); status.append(dot); }
    else status.append(chip(triage.label, triageKinds[triage.status]));
    if (llm && triage.status !== "cleared") { const advice = chip("LLM", `llm ${VERDICTS[llm.verdict][1]}`); advice.append(element("span", ` advice: ${VERDICTS[llm.verdict][0]}`, "visually-hidden")); status.append(advice); }
  }
  button.append(status);
  button.addEventListener("click", () => { selectedCase = key; renderReview(); });
  li.append(button); return li;
}

function renderRunHeader(saved, shown) {
  const caseCount = saved.caseIds?.length ?? new Set(saved.results.map((c) => c.caseId)).size;
  const answers = saved.results.filter((c) => c.reply).length;
  const plan = saved.repeats ? `${plural(caseCount, "case")} × ${plural(saved.repeats, "repetition")} = ${saved.plannedCases ?? caseCount * saved.repeats} planned` : `${plural(caseCount, "case")} · repetitions not recorded`;
  $("run-title").textContent = `Run from ${formatDate(saved.startedAt)}`;
  $("run-meta").textContent = `${saved.model} · ${saved.effort} effort · ${plan} · ${plural(answers, "answer")} saved · commit ${saved.commit.slice(0, 8)}${saved.dirty ? " + local changes" : ""}`;
  $("run-repeats").hidden = !(saved.repeats > 1);
  $("run-repeats").textContent = saved.repeats > 1 ? `Each case was answered ${saved.repeats} times from a fresh application; every answer gets its own verdict.` : "";
  $("run-archived").hidden = !saved.archived;
  $("archive-run").textContent = saved.archived ? "Restore run" : "Archive run";
  $("archive-run").disabled = busy || Boolean(saved.archiveError);
  const targets = judgeTargets(saved, shown);
  $("judge-run").textContent = targets.keys.length ? targets.label : "Judge…";
  $("judge-run").className = targets.primary ? "primary" : "secondary"; // Re-judging is the rare, paid case.
  $("judge-run").disabled = busy || Boolean(state.active) || !targets.keys.length;
  $("archive-error").hidden = !saved.archiveError;
  // One bar for the whole run: what still needs attention, what the judge cleared, what you graded.
  const counts = { failures: 0, "needs-review": 0, "needs-judge": 0, cleared: 0, reviewed: 0 };
  for (const c of saved.results) counts[triageFor(saved, c).status]++;
  const segments = { failures: "failures", review: "needs-review", judge: "needs-judge", cleared: "cleared", reviewed: "reviewed" };
  for (const [segment, status] of Object.entries(segments)) $("progress-bar").querySelector(`.${segment}`).style.width = saved.results.length ? `${(counts[status] / saved.results.length) * 100}%` : "0";
  const attention = pendingCount(saved);
  const humanReviewed = saved.results.filter((c) => c.reply && reviewFor(saved, "human", keyOf(c))).length;
  const parts = [attention ? `${attention} need attention` : "Nothing needs attention"];
  if (counts.cleared) parts.push(`${counts.cleared} LLM-cleared`);
  parts.push(`${humanReviewed} of ${answers} human-reviewed`);
  const compared = saved.results.map((c) => agreement(saved, c)).filter((verdict) => verdict !== null);
  if (compared.length) parts.push(`judge agreed ${compared.filter(Boolean).length} of ${compared.length}`);
  $("progress-text").textContent = answers ? parts.join(" · ") : "No answers to review";
  $("progress-bar").setAttribute("aria-label", $("progress-text").textContent);
}

function renderAnswer(saved, ordered, shown) {
  const current = record();
  $("empty-answers").hidden = Boolean(current); $("answer-detail").hidden = !current;
  if (!current) return;
  const key = keyOf(current);
  const triage = triageFor(saved, current);
  $("triage-chip").textContent = triage.label; $("triage-chip").className = `chip ${triageKinds[triage.status]}`;
  const agrees = agreement(saved, current); const llmVerdict = reviewFor(saved, "llm", key)?.verdict;
  $("triage-reason").textContent = triage.status === "cleared" ? "Current judge policy and recorded code checks passed. Not human-approved."
    : triage.status === "needs-judge" || triage.label === "Failed checks" ? triage.reason
    : agrees === true ? "The judge agrees with your verdict."
    : agrees === false ? `The judge said ${VERDICTS[llmVerdict][0].toLowerCase()}; your verdict wins.`
    : triage.status === "reviewed" ? "Not judged by the LLM under the current policy."
    : "See the judgment and verdict below for the supporting evidence.";
  const index = shown.findIndex((c) => keyOf(c) === key);
  $("answer-position").textContent = index >= 0 ? `${index + 1} of ${shown.length}` : "";
  $("prev-answer").disabled = index <= 0; $("next-answer").disabled = index >= 0 ? index >= shown.length - 1 : !shown.length;
  const repetitions = ordered.filter((c) => c.caseId === current.caseId).length;
  $("case-title").textContent = repetitions > 1 ? `${caseName(current.caseId)} · repetition ${current.repetition} of ${repetitions}` : caseName(current.caseId);
  $("case-meta").textContent = `${current.caseId} · ${saved.model} · ${saved.effort}`;
  const knownCase = state.evalCases.some((c) => c.id === current.caseId);
  $("rerun-case").hidden = !knownCase; $("rerun-case").disabled = Boolean(state.active) || busy;
  $("rerun-unavailable").hidden = knownCase;
  const currentRubric = state.evalCases.find((c) => c.id === current.caseId)?.rubric; // The judge grades against today's wording.
  $("rubric").textContent = currentRubric ?? current.rubric;
  $("rubric-changed").hidden = !currentRubric || currentRubric === current.rubric;
  $("rubric-saved").textContent = `Saved with this run: ${current.rubric}`;
  const decisions = Array.isArray(current.input?.decisions) ? current.input.decisions : [];
  $("context").hidden = !decisions.length;
  $("context-list").replaceChildren(...decisions.map((d) => { const li = document.createElement("li"); li.append(chip(d.kind ?? "decision"), element("span", d.value ?? JSON.stringify(d))); return li; }));
  renderRich($("input"), current.input?.userMessage ?? "Not run.");
  renderRich($("answer"), current.reply?.message ?? ""); $("answer").hidden = !current.reply;
  $("answer-error").hidden = Boolean(current.reply); $("answer-error").textContent = current.error ?? "No accepted answer was saved.";
  const proposals = current.reply?.decisionProposals ?? [];
  $("proposal-block").hidden = !current.reply;
  $("proposals-title").hidden = !proposals.length; $("no-proposals").hidden = proposals.length > 0;
  $("proposals").replaceChildren(...proposals.map((p) => {
    const li = element("li", "", "proposal"); const body = document.createElement("div"); body.append(element("span", p?.value ?? JSON.stringify(p)));
    if (p?.replaces) { const existing = decisions.find((d) => d.id === p.replaces); body.append(element("small", existing ? `Replaces: ${existing.value}` : `Replaces decision ${p.replaces}`)); }
    li.append(chip(p?.kind ?? "proposal"), body); return li;
  }));
  const checks = Object.entries(current.checks); const passed = checks.filter(([, ok]) => ok).length;
  $("checks-summary").textContent = checks.length ? `Automatic checks · ${passed} of ${checks.length} passed` : "Automatic checks · none recorded";
  $("checks").replaceChildren(...checks.map(([name, ok]) => element("li", name, ok ? "" : "failed")));
  $("state").textContent = JSON.stringify({ before: current.before, after: current.after }, null, 2);
  const human = reviewFor(saved, "human", key); const llm = reviewFor(saved, "llm", key);
  $("judge-verdict").hidden = !llm;
  if (llm) { $("judge-verdict").textContent = VERDICTS[llm.verdict][0]; $("judge-verdict").className = `chip llm ${VERDICTS[llm.verdict][1]}`; }
  $("judge-meta").textContent = llm ? `${llm.model} · ${llm.effort} · ${formatDate(llm.createdAt)}` : "";
  renderJudgment(llm?.reason, human);
  $("judge-result").className = `judgment${llm ? "" : " none"}`;
  $("judge").textContent = llm ? "Judge again…" : "Judge this answer…";
  $("judge-stale").hidden = !triage.stale; // Judged under wording the casebook no longer has; a retry uses today's.
  $("judge").disabled = Boolean(state.active) || busy || !reviewable(current);
  $("verdict").hidden = !reviewable(current); $("unreviewable").hidden = reviewable(current);
  for (const button of document.querySelectorAll(".verdict-button")) {
    button.setAttribute("aria-pressed", String(human?.verdict === button.dataset.verdict));
    button.disabled = busy;
    button.querySelector(".llm-tag")?.remove();
    if (llm?.verdict === button.dataset.verdict) { const tag = element("span", "LLM", "llm-tag"); tag.setAttribute("aria-hidden", "true"); button.append(tag); }
  }
  $("saved").className = human ? "ok" : "";
  $("saved").textContent = human ? `Saved · ${formatDate(human.createdAt)}` : "Not reviewed yet";
  const nextKey = `${saved.run}:${saved.hash}:${key}`;
  if (noteKey !== nextKey) {
    noteKey = nextKey;
    $("reason").value = notes.get(noteKey) ?? human?.reason ?? "";
    $("note-field").hidden = !$("reason").value;
  }
  $("note-toggle").textContent = $("note-field").hidden ? "Add a note" : "Hide note";
}
// The judge's first sentence is usually the reason for its verdict; the rest is evidence, folded away until asked for.
function renderJudgment(reason, human) {
  const node = $("judge-result");
  if (!reason) { node.textContent = human ? "Not judged by the LLM; your verdict stands on its own." : "Not judged yet."; return; }
  const split = reason.match(/^([\s\S]*?[.!?])(\s+)([\s\S]+)$/);
  if (!split) { node.replaceChildren(element("span", reason, "lead")); return; }
  const more = document.createElement("details"); more.className = "judgment-more"; more.open = openReasoning.has(selectedCase);
  more.append(element("summary", "Full reasoning"), element("p", split[3]));
  more.addEventListener("toggle", () => { if (more.open) openReasoning.add(selectedCase); else openReasoning.delete(selectedCase); });
  node.replaceChildren(element("span", split[1], "lead"), more);
}
$("note-toggle").addEventListener("click", () => { $("note-field").hidden = !$("note-field").hidden; $("note-toggle").textContent = $("note-field").hidden ? "Add a note" : "Hide note"; if (!$("note-field").hidden) $("reason").focus(); });
$("reason").addEventListener("input", () => notes.set(noteKey, $("reason").value));
function scrollToAnswer() {
  const top = $("answer-detail").getBoundingClientRect().top; // Start each answer from its top without hiding the run header when it already fits.
  if (top < 0 || top > window.innerHeight / 2) window.scrollTo({ top: window.scrollY + top - 20, behavior: "smooth" });
}
function step(direction) {
  const saved = report(); if (!saved) return;
  const shown = shownResults(saved); if (!shown.length) return;
  const index = shown.findIndex((c) => keyOf(c) === selectedCase);
  const target = index < 0 ? shown[0] : shown[index + direction];
  if (!target) return;
  selectedCase = keyOf(target); renderReview(); scrollToAnswer();
}
// One click is the whole review: save, then move to the next row so the queue keeps flowing.
async function saveVerdict(verdict) {
  const saved = report(); const current = record();
  if (busy || !saved || !current || !reviewable(current)) return;
  const key = selectedCase; const index = shownResults(saved).findIndex((c) => keyOf(c) === key);
  const note = $("reason").value.trim();
  busy = true; renderReview();
  try {
    await api("/api/review", { run: saved.run, hash: saved.hash, key, review: { verdict, ...(note ? { reason: note } : {}) } });
    notes.delete(noteKey); noteKey = ""; $("error").hidden = true;
    busy = false; await refresh();
    const shown = shownResults(report()); const still = shown.findIndex((c) => keyOf(c) === key);
    const next = still >= 0 ? shown[still + 1] : shown[index] ?? shown[index - 1];
    selectedCase = next ? keyOf(next) : still >= 0 ? key : selectedCase;
    renderReview(); if (next) scrollToAnswer();
  } catch (error) { failure(error); }
  finally { busy = false; renderReview(); }
}
for (const button of document.querySelectorAll(".verdict-button")) button.addEventListener("click", () => { void saveVerdict(button.dataset.verdict); });
$("prev-answer").addEventListener("click", () => step(-1));
$("next-answer").addEventListener("click", () => step(1));
document.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || $("reviews-panel").hidden || document.querySelector("dialog[open]")) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) || event.target.isContentEditable) return;
  const shortcuts = { j: () => step(1), k: () => step(-1), p: () => saveVerdict("pass"), f: () => saveVerdict("fail"), d: () => saveVerdict("needs-discussion") };
  if (shortcuts[event.key]) { event.preventDefault(); void shortcuts[event.key](); }
});
for (const button of document.querySelectorAll(".filters button")) button.addEventListener("click", () => { answerFilter = button.dataset.filter; renderReview(); });

async function start(input) { try { await api("/api/start", input); $("error").hidden = true; await refresh(); } catch (error) { failure(error); } }
// One dialog for every paid action: what will run, with which model, then Start.
function requestRun(input) {
  if (input.suite !== "live" && input.suite !== "judge") { void start(input); return; }
  const judge = input.suite === "judge";
  const model = (judge ? judgePreferences?.model : null) || state.defaults.model;
  const effort = (judge ? judgePreferences?.effort : null) || state.defaults.effort;
  pendingRun = { ...input, model, effort };
  const count = judge ? input.keys.length : input.cases.length * input.repeats;
  $("confirm-title").textContent = judge ? input.title : input.cases.length === 1 ? `Run ${caseName(input.cases[0])}` : `Run ${plural(input.cases.length, "case")}`;
  $("confirm-description").textContent = judge ? "An isolated Pi session grades each saved answer against its rubric and saves an advisory verdict. Server Guy is not rerun and your verdicts are untouched." : `${plural(input.cases.length, "case")} × ${plural(input.repeats, "repetition")} = ${plural(count, "planned answer")}, each from fresh application data with no GitHub calls. Saves a new run; existing answers and reviews stay unchanged.`;
  $("confirm-selection").textContent = judge ? input.keys.join(", ") : input.cases.join(", ");
  $("confirm-limits").textContent = judge ? "One judgment per answer, sequentially. Stops on the first failure or after 15 minutes; earlier judgments stay saved. No retries. Model judgments can be wrong." : "Repeats test consistency, not retry failures. Tool calls and Pi’s built-in retries can make multiple requests per turn.";
  $("run-model").value = model; $("run-effort").value = effort; syncSettingsLine();
  // Live evals exercise the app's saved configuration; these values are expectations,
  // not runtime overrides. Only the separate judge can choose its own model.
  $("change-settings").hidden = !judge; $("live-settings").hidden = judge;
  $("run-model").readOnly = !judge; $("run-effort").disabled = !judge;
  $("settings-fields").hidden = true; $("judge-after-row").hidden = judge; $("judge-after").checked = true;
  $("confirm-run").textContent = judge ? "Start judging" : "Start run";
  returnToEvalPicker = $("eval-picker").open;
  if (returnToEvalPicker) $("eval-picker").close();
  $("confirm").showModal();
}
function syncSettingsLine() { $("confirm-model").textContent = $("run-model").value.trim() || "?"; $("confirm-effort").textContent = $("run-effort").value; }
for (const id of ["run-model", "run-effort"]) $(id).addEventListener("input", syncSettingsLine);
$("change-settings").addEventListener("click", () => { $("settings-fields").hidden = !$("settings-fields").hidden; if (!$("settings-fields").hidden) $("run-model").focus(); });
function cancelRun() { pendingRun = null; $("confirm").close(); if (returnToEvalPicker) { $("eval-picker").showModal(); $("run-evals").focus(); } returnToEvalPicker = false; }
$("cancel").addEventListener("click", cancelRun);
$("confirm").addEventListener("cancel", (event) => { event.preventDefault(); cancelRun(); });
$("confirm-run").addEventListener("click", () => {
  if (!pendingRun || !$("run-model").reportValidity()) return;
  const { title, ...request } = pendingRun;
  const input = { ...request, model: $("run-model").value.trim(), effort: $("run-effort").value, consent: true, ...(request.suite === "live" ? { judgeAfter: $("judge-after").checked } : {}) };
  if (input.suite === "judge") judgePreferences = { model: input.model, effort: input.effort };
  void title; pendingRun = null; returnToEvalPicker = false; $("confirm").close(); void start(input);
});
for (const button of document.querySelectorAll("[data-close]")) button.addEventListener("click", () => { if (!busy) $(button.dataset.close).close(); });
$("stop").addEventListener("click", () => { void api("/api/stop", {}).then(refresh).catch(failure); });
// Two real URLs sharing one shell, so moving between them keeps unsaved notes.
function renderPage() {
  const reviewing = location.pathname === "/evals";
  $("runs-panel").hidden = reviewing; $("reviews-panel").hidden = !reviewing;
  for (const [id, current] of [["checks-link", !reviewing], ["reviews-link", reviewing]]) { if (current) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current"); }
  document.title = `${reviewing ? "Eval runs" : "Run checks"} · Server Guy Testing`;
}
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-route]");
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  if (link.getAttribute("href") !== location.pathname) history.pushState(null, "", link.getAttribute("href"));
  renderPage();
  $(location.pathname === "/evals" ? "reviews-title" : "checks-title").focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
window.addEventListener("popstate", renderPage);
$("empty-choose").addEventListener("click", () => $("eval-picker").showModal());
$("rerun-case").addEventListener("click", () => requestRun({ suite: "live", cases: [record().caseId], repeats: 1 }));
$("judge").addEventListener("click", () => requestRun({ suite: "judge", run: selectedRun, hash: report().hash, keys: [selectedCase], title: "Judge this answer" }));
$("judge-run").addEventListener("click", () => {
  const targets = judgeTargets(report(), shownResults(report())); if (!targets.keys.length) return;
  requestRun({ suite: "judge", run: selectedRun, hash: report().hash, keys: targets.keys, title: targets.title });
});

$("archive-run").addEventListener("click", async () => {
  const saved = report(); if (busy || !saved) return;
  const input = { run: saved.run, hash: saved.hash, archived: !saved.archived };
  busy = true; renderReview();
  try {
    await api("/api/runs/archive", input); $("error").hidden = true;
    busy = false; await refresh();
    $("bulk-result").textContent = input.archived ? "Run archived. It stays readable under Archived runs, and every answer and verdict is preserved." : "Run restored to the active list.";
  } catch (error) { failure(error); }
  finally { busy = false; renderReview(); }
});

function initializeSelectors() {
  if (selectorsReady) return;
  for (const [prefix, items] of [["journey", state.journeys], ["eval", state.evalCases]]) {
    $(`${prefix}-options`).replaceChildren(...items.map((item) => {
      const row = element("div", "", "selection-option"); const label = document.createElement("label");
      const input = document.createElement("input"); input.type = "checkbox"; input.value = item.id; input.checked = true;
      const copy = element("span", item.name); copy.append(element("small", item.description ?? item.rubric));
      if (item.smoke) copy.append(element("small", "Included in Browser smoke"));
      label.append(input, copy); row.append(label); input.addEventListener("change", updateSelections);
      if (item.message) { const details = document.createElement("details"); details.append(element("summary", "Exact input"), element("p", item.message)); row.append(details); }
      return row;
    }));
  }
  selectorsReady = true;
}
function selectedOptions(prefix) { return Array.from($(`${prefix}-options`).querySelectorAll("input:checked")).map((input) => input.value); }
function updateSelections() {
  const journeys = selectedOptions("journey").length; const cases = selectedOptions("eval").length; const repeats = Number($("eval-repeats").value);
  $("journey-count").textContent = `${journeys} of ${state.journeys.length} journeys selected · no model calls`;
  $("eval-count").textContent = `${plural(cases, "case")} × ${plural(repeats, "repetition")} = ${plural(cases * repeats, "planned answer")}`;
  $("run-journeys").disabled = Boolean(state.active) || !journeys; $("run-evals").disabled = Boolean(state.active) || !cases;
  for (const picker of ["journey-picker", "eval-picker"]) for (const control of $(picker).querySelectorAll("input,select")) control.disabled = Boolean(state.active);
}
for (const [prefix, buttons] of [["journey", "journeys"], ["eval", "evals"]]) for (const action of ["all", "clear"]) {
  $(`${buttons}-${action}`).addEventListener("click", () => { for (const input of $(`${prefix}-options`).querySelectorAll("input")) input.checked = action === "all"; updateSelections(); });
}
$("eval-repeats").addEventListener("change", updateSelections);
$("run-journeys").addEventListener("click", () => { $("journey-picker").close(); requestRun({ suite: "e2e", journeys: selectedOptions("journey") }); });
$("run-evals").addEventListener("click", () => requestRun({ suite: "live", cases: selectedOptions("eval"), repeats: Number($("eval-repeats").value) }));

renderPage(); void refresh(); setInterval(() => { if (!document.hidden) void refresh(); }, 2500);
