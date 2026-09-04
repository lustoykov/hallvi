const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="testing-token"]').content;
let state = null;
let stateSignature = "";
let selectedRun = "";
let selectedCase = "";
let selectedLog = "";
let answerFilter = "attention";
let lastSavedKey = "";
let formKey = "";
let pendingRun = null;
let pendingHuman = null;
let returnToEvalPicker = false;
let judgePreferences = null;
let selectorsReady = false;
let busy = false;
const drafts = new Map();
const selectedAnswers = new Set();
let selectionScope = "";
const VERDICTS = { pass: ["Pass", "pass", "Pass"], fail: ["Fail", "fail", "Fail"], "needs-discussion": ["Needs discussion", "discuss", "Discuss"] };
const keyOf = (record) => `${record.caseId}:${record.repetition}`;
const reviewable = (record) => Boolean(record.reply && record.input);
const attentionStatuses = ["needs-judge", "needs-review", "failures"];
const triageKinds = { "needs-judge": "todo", "needs-review": "discuss", failures: "fail", cleared: "llm pass", reviewed: "pass" };
const triageFor = (saved, c) => saved.triage[keyOf(c)];
const formatDate = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
function element(tag, text, className) { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; }
function chip(text, kind) { return element("span", text, `chip ${kind ?? ""}`.trim()); }
function report() { return state?.reports.find((r) => r.run === selectedRun); }
function record() { return orderedResults(report()).find((c) => keyOf(c) === selectedCase); }
function reviewFor(saved, type, key) { return saved?.reviews.filter((v) => v.type === type && v.key === key).at(-1); }
function caseName(id) { return state.evalCases.find((c) => c.id === id)?.name ?? id; }
function suiteName(id) { return state.suites.find((s) => s.id === id)?.name ?? (id === "judge" ? "LLM advice" : id); }
const statusLabel = (status) => status === "timed-out" ? "Timed out" : status.charAt(0).toUpperCase() + status.slice(1);
const statusKind = (status) => ({ passed: "pass", running: "discuss" })[status] ?? "fail";
const elapsed = (run) => `${Math.max(0, Math.round((run.finishedAt ? Date.parse(run.finishedAt) : Date.now()) - Date.parse(run.startedAt)) / 1000)} s`;
// What a recorded run covered, read back from its explicit runner options.
function scopeOf(run) {
  const command = run.command ?? "";
  const journeys = command.match(/@journey-\(\?:([^)]+)\)/)?.[1].split("|");
  if (journeys) return journeys.map((id) => state.journeys.find((j) => j.id === id)?.name ?? id).join(", ");
  const cases = command.match(/PI_EVAL_CASES=([\w,.-]+)/)?.[1].split(",");
  if (cases) { const repeats = Number(command.match(/PI_EVAL_REPEATS=(\d+)/)?.[1] ?? 1); return `${cases.length} case${cases.length === 1 ? "" : "s"}${repeats > 1 ? ` × ${repeats} repetitions` : ""}`; }
  const keys = command.match(/PI_JUDGE_CASES='(\[[^']*\])'/)?.[1];
  if (keys) { try { const count = JSON.parse(keys).length; return `${count} saved answer${count === 1 ? "" : "s"}`; } catch { return ""; } }
  return "";
}
// Repetitions of one case sit together so a reviewer compares them back to back.
function orderedResults(saved) {
  if (!saved) return [];
  const order = []; for (const c of saved.results) if (!order.includes(c.caseId)) order.push(c.caseId);
  return [...saved.results].sort((a, b) => order.indexOf(a.caseId) - order.indexOf(b.caseId) || a.repetition - b.repetition);
}
function shownResults(saved) {
  return orderedResults(saved).filter((c) => {
    const status = triageFor(saved, c).status;
    return answerFilter === "all" || (answerFilter === "attention" ? attentionStatuses.includes(status)
      : answerFilter === "reviewed" ? Boolean(reviewFor(saved, "human", keyOf(c))) : status === answerFilter);
  });
}
function pendingCount(saved) { return saved.results.filter((c) => attentionStatuses.includes(triageFor(saved, c).status)).length; }
function triageSummary(saved) {
  const count = (status) => saved.results.filter((c) => triageFor(saved, c).status === status).length;
  return `${count("needs-judge")} not judged · ${count("needs-review")} need review · ${count("failures")} failures · ${count("cleared")} LLM-cleared · ${count("reviewed")} human-passed`;
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

async function refresh() {
  try {
    const nextState = await api("/api/state");
    const signature = JSON.stringify(nextState);
    if (signature === stateSignature) return; // Preserve keyboard focus and open controls between polls.
    stateSignature = signature; state = nextState;
    $("active").hidden = !state.active; tick();
    $("suites").replaceChildren(...state.suites.map((suite) => {
      const row = document.createElement("tr"); const name = document.createElement("td");
      name.append(element("strong", suite.name), element("small", suite.scope));
      if (suite.id === "live") name.append($("reviews-link"));
      const last = state.history.find((r) => r.suite === suite.id); const resultCell = document.createElement("td"); const result = element("div", "", "last-result");
      if (last) { result.append(chip(statusLabel(last.status), statusKind(last.status)), element("small", formatDate(last.startedAt))); } else result.append(element("small", "Not run yet"));
      const usage = document.createElement("td"); usage.append(chip(suite.cost, suite.id === "live" ? "usage-paid" : "usage-free"));
      const schedule = element("td", "", "suite-schedule"); schedule.append(element("span", suite.ci));
      if (suite.ciDetail) schedule.append(element("small", suite.ciDetail));
      resultCell.append(result); row.append(name, usage, schedule, resultCell);
      const picker = suite.id === "e2e" ? "journey" : suite.id === "live" ? "eval" : null;
      const action = document.createElement("td"); const button = element("button", picker === "journey" ? "Choose journeys…" : picker ? "Choose cases…" : "Run", picker ? "secondary" : "primary");
      button.disabled = Boolean(state.active);
      button.addEventListener("click", () => { if (picker) $(`${picker}-picker`).showModal(); else requestRun({ suite: suite.id }); });
      action.append(button); row.append(action); return row;
    }));
    initializeSelectors(); updateSelections();
    renderHistory();
    const pending = state.reports.filter((r) => !r.archived).reduce((count, r) => count + pendingCount(r), 0);
    $("pending").textContent = pending ? `${pending} need attention` : ""; $("pending").hidden = !pending;
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
    row.addEventListener("click", () => { selectedLog = selectedLog === run.id ? "" : run.id; renderHistory(); open.focus(); });
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
  const scope = `${saved.run}:${saved.hash}:${answerFilter}`;
  if (selectionScope !== scope) { if (selectionScope.split(":").slice(0, 2).join(":") !== `${saved.run}:${saved.hash}`) $("bulk-result").textContent = ""; selectedAnswers.clear(); selectionScope = scope; }
  const ordered = orderedResults(saved); const shown = shownResults(saved);
  for (const key of selectedAnswers) if (!shown.some((c) => keyOf(c) === key)) selectedAnswers.delete(key);
  if (!shown.some((c) => keyOf(c) === selectedCase)) { selectedCase = shown[0] ? keyOf(shown[0]) : ""; lastSavedKey = ""; }
  renderAnswerList(saved, ordered, shown);
  renderRunHeader(saved);
  renderAnswer(saved, ordered, shown);
  updateSelection(saved, shown);
}

function runCard(r) {
  const li = document.createElement("li"); const button = element("button", "", "run-card"); button.type = "button";
  button.dataset.run = r.run; button.setAttribute("aria-current", String(r.run === selectedRun)); button.disabled = busy;
  const answers = r.results.filter((c) => c.reply).length; const pending = pendingCount(r);
  button.append(element("strong", formatDate(r.startedAt)), element("small", `${r.model} · ${r.effort} · ${answers} answer${answers === 1 ? "" : "s"}`));
  button.append(element("small", pending ? `${pending} need attention` : answers ? "No answers needing attention" : "No saved answers", pending ? "todo" : answers ? "done" : ""));
  button.addEventListener("click", () => { if (selectedRun !== r.run) { selectedRun = r.run; selectedCase = ""; answerFilter = "attention"; lastSavedKey = ""; renderReview(); } });
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
  const counts = { all: ordered.length, attention: pendingCount(saved),
    failures: ordered.filter((c) => triageFor(saved, c).status === "failures").length,
    cleared: ordered.filter((c) => triageFor(saved, c).status === "cleared").length,
    reviewed: ordered.filter((c) => reviewFor(saved, "human", keyOf(c))).length };
  for (const button of document.querySelectorAll(".filters button")) {
    button.setAttribute("aria-pressed", String(button.dataset.filter === answerFilter));
    button.querySelector("span").textContent = String(counts[button.dataset.filter]);
  }
  $("answers-total").textContent = `${shown.length} of ${ordered.length}`;
  const focusedCase = document.activeElement?.dataset.caseKey; const focusedSelection = document.activeElement?.dataset.answerKey;
  const repeated = new Set(ordered.map((c) => c.repetition)).size > 1;
  const rows = []; let lastCase = null;
  for (const c of shown) {
    if (repeated && c.caseId !== lastCase) { rows.push(element("li", caseName(c.caseId), "answer-group")); lastCase = c.caseId; }
    rows.push(answerRow(saved, c, repeated));
  }
  $("answer-list").replaceChildren(...rows);
  $("no-answers").hidden = shown.length > 0;
  $("no-answers").textContent = !ordered.length ? "This run saved no answers." : answerFilter === "attention" ? "No answers need attention. Spot-check a cleared answer or open All." : "No answers match this filter.";
  if (focusedCase) document.querySelector(`.answer-open[data-case-key="${CSS.escape(focusedCase)}"]`)?.focus();
  if (focusedSelection) document.querySelector(`input[data-answer-key="${CSS.escape(focusedSelection)}"]`)?.focus();
}
// One row per saved answer. Runs with several repetitions group rows under the case name.
function answerRow(saved, c, repeated) {
    const key = keyOf(c); const li = element("li", "", "answer-row");
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.dataset.answerKey = key;
    checkbox.setAttribute("aria-label", `Select ${caseName(c.caseId)} repetition ${c.repetition}`);
    checkbox.disabled = busy || !reviewable(c); checkbox.checked = selectedAnswers.has(key);
    checkbox.addEventListener("change", () => { if (checkbox.checked) selectedAnswers.add(key); else selectedAnswers.delete(key); updateSelection(saved, shownResults(saved)); });
    const button = element("button", "", "answer-open"); button.type = "button"; button.dataset.caseKey = key;
    button.setAttribute("aria-current", String(key === selectedCase)); button.disabled = busy;
    if (c.reply && c.outcome !== "checks-passed") { const warn = element("span", "", "warn"); warn.append(element("span", "Automatic checks failed. ", "visually-hidden")); button.append(warn); }
    button.append(element("span", repeated ? `Repetition ${c.repetition}` : caseName(c.caseId), "answer-name"));
    const status = element("span", "", "answer-status"); const llm = reviewFor(saved, "llm", key);
    if (!c.reply) status.append(chip("No answer", "todo"));
    else {
      const triage = triageFor(saved, c);
      status.append(chip(triage.label, triageKinds[triage.status]));
      if (llm && triage.status !== "cleared") { const advice = chip("LLM", `llm ${VERDICTS[llm.verdict][1]}`); advice.append(element("span", ` advice: ${VERDICTS[llm.verdict][0]}`, "visually-hidden")); status.append(advice); }
    }
    button.append(status);
    button.addEventListener("click", () => { selectedCase = key; lastSavedKey = ""; renderReview(); });
    li.append(checkbox, button); return li;
}

function renderRunHeader(saved) {
  const caseCount = saved.caseIds?.length ?? new Set(saved.results.map((c) => c.caseId)).size;
  const answers = saved.results.filter((c) => c.reply).length;
  const plan = saved.repeats ? `${caseCount} case${caseCount === 1 ? "" : "s"} × ${saved.repeats} repetition${saved.repeats === 1 ? "" : "s"} = ${saved.plannedCases ?? caseCount * saved.repeats} planned` : `${caseCount} case${caseCount === 1 ? "" : "s"} · repetitions not recorded`;
  $("run-title").textContent = `Run from ${formatDate(saved.startedAt)}`;
  $("run-meta").textContent = `${saved.model} · ${saved.effort} effort · ${plan} · ${answers} answer${answers === 1 ? "" : "s"} saved · commit ${saved.commit.slice(0, 8)}${saved.dirty ? " + local changes" : ""}`;
  $("run-repeats").hidden = !(saved.repeats > 1);
  $("run-repeats").textContent = saved.repeats > 1 ? `Each case was answered ${saved.repeats} times, each from a fresh application. Compare a case's repetitions for consistency; every answer gets its own verdict.` : "";
  $("run-archived").hidden = !saved.archived;
  $("archive-run").textContent = saved.archived ? "Restore run" : "Archive run";
  $("archive-run").disabled = busy || Boolean(saved.archiveError);
  $("judge-run").disabled = busy || Boolean(state.active) || !saved.results.some(reviewable);
  $("spot-check").disabled = !saved.results.some((c) => triageFor(saved, c).status === "cleared");
  $("triage-summary").textContent = triageSummary(saved);
  $("archive-error").hidden = !saved.archiveError;
  const totals = { pass: 0, fail: 0, "needs-discussion": 0 };
  for (const c of saved.results) { const human = reviewFor(saved, "human", keyOf(c)); if (c.reply && human) totals[human.verdict]++; }
  const reviewed = totals.pass + totals.fail + totals["needs-discussion"];
  for (const [verdict, [, kind]] of Object.entries(VERDICTS)) $("progress-bar").querySelector(`.${kind}`).style.width = answers ? `${(totals[verdict] / answers) * 100}%` : "0";
  const parts = [`${reviewed} of ${answers} human-reviewed`];
  if (totals.pass) parts.push(`${totals.pass} pass`); if (totals.fail) parts.push(`${totals.fail} fail`); if (totals["needs-discussion"]) parts.push(`${totals["needs-discussion"]} to discuss`);
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
  $("triage-reason").textContent = triage.status === "cleared" ? "Current judge policy and recorded code checks passed. Not human-approved."
    : triage.status === "needs-judge" || triage.label === "Failed checks" ? triage.reason
    : triage.status === "reviewed" ? "Human verdict saved separately from the model judgment."
    : "See the judgment and human verdict below for the supporting evidence.";
  const index = shown.findIndex((c) => keyOf(c) === key);
  $("answer-position").textContent = index >= 0 ? `${index + 1} of ${shown.length}` : "";
  $("prev-answer").disabled = index <= 0; $("next-answer").disabled = index >= 0 ? index >= shown.length - 1 : !shown.length;
  const repetitions = ordered.filter((c) => c.caseId === current.caseId).length;
  $("case-title").textContent = repetitions > 1 ? `${caseName(current.caseId)} · repetition ${current.repetition} of ${repetitions}` : caseName(current.caseId);
  $("case-sub").textContent = `${current.caseId} · ${saved.model} · ${saved.effort}`;
  const knownCase = state.evalCases.some((c) => c.id === current.caseId);
  $("rerun-case").disabled = Boolean(state.active) || busy || !knownCase;
  $("rerun-unavailable").hidden = knownCase;
  const outcomes = { "checks-passed": ["Checks passed", "pass"], "checks-failed": ["Checks failed", "fail"], "run-error": ["Run error", "fail"], "not-run": ["Not run", "todo"] };
  const [outcomeText, outcomeKind] = outcomes[current.outcome] ?? [current.outcome, ""];
  $("automatic").textContent = outcomeText; $("automatic").className = `chip ${outcomeKind}`;
  const human = reviewFor(saved, "human", key); const llm = reviewFor(saved, "llm", key);
  $("human-chip").textContent = human ? `Your verdict: ${VERDICTS[human.verdict][0]}` : current.reply ? "Not reviewed" : "Nothing to review";
  $("human-chip").className = `chip ${human ? VERDICTS[human.verdict][1] : "todo"}`;
  $("llm-chip").hidden = !llm;
  if (llm) { $("llm-chip").textContent = `LLM advice: ${VERDICTS[llm.verdict][0]}`; $("llm-chip").className = `chip llm ${VERDICTS[llm.verdict][1]}`; }
  $("rubric").textContent = current.rubric;
  const decisions = Array.isArray(current.input?.decisions) ? current.input.decisions : [];
  $("context").hidden = !decisions.length;
  $("context-list").replaceChildren(...decisions.map((d) => { const li = document.createElement("li"); li.append(chip(d.kind ?? "decision"), element("span", d.value ?? JSON.stringify(d))); return li; }));
  renderRich($("input"), current.input?.userMessage ?? "Not run.");
  renderRich($("answer"), current.reply?.message ?? ""); $("answer").hidden = !current.reply;
  $("answer-error").hidden = Boolean(current.reply); $("answer-error").textContent = current.error ?? "No accepted answer was saved.";
  const proposals = current.reply?.decisionProposals ?? [];
  $("proposals").parentElement.hidden = !current.reply;
  $("no-proposals").hidden = proposals.length > 0;
  $("proposals").replaceChildren(...proposals.map((p) => {
    const li = element("li", "", "proposal"); const body = document.createElement("div"); body.append(element("span", p?.value ?? JSON.stringify(p)));
    if (p?.replaces) { const existing = decisions.find((d) => d.id === p.replaces); body.append(element("small", existing ? `Replaces: ${existing.value}` : `Replaces decision ${p.replaces}`)); }
    li.append(chip(p?.kind ?? "proposal"), body); return li;
  }));
  const checks = Object.entries(current.checks); const passed = checks.filter(([, ok]) => ok).length;
  $("checks-summary").textContent = checks.length ? `Automatic checks · ${passed} of ${checks.length} passed` : "Automatic checks · none recorded";
  $("checks").replaceChildren(...checks.map(([name, ok]) => element("li", name, ok ? "" : "failed")));
  $("state").textContent = JSON.stringify({ before: current.before, after: current.after }, null, 2);
  $("judge-verdict").hidden = !llm;
  if (llm) { $("judge-verdict").textContent = VERDICTS[llm.verdict][0]; $("judge-verdict").className = `chip llm ${VERDICTS[llm.verdict][1]}`; }
  $("judge-meta").textContent = llm ? `${llm.model} · ${llm.effort} · ${formatDate(llm.createdAt)}` : "";
  $("judge-result").textContent = llm?.reason ?? "Not judged. Judge this saved answer against its rubric; this does not rerun Server Guy.";
  $("judge-result").className = `judgment${llm ? "" : " none"}`;
  $("judge").textContent = llm ? "Judge again…" : "Judge answer…";
  $("judge").disabled = Boolean(state.active) || busy || !reviewable(current);
  $("human-form").hidden = !reviewable(current); $("unreviewable").hidden = reviewable(current);
  const nextKey = `${saved.run}:${saved.hash}:${key}`;
  if (formKey !== nextKey) {
    formKey = nextKey; const draft = drafts.get(formKey);
    const verdict = draft?.verdict ?? human?.verdict ?? "";
    for (const radio of $("human-form").elements.verdict) radio.checked = radio.value === verdict;
    $("reason").value = draft?.reason ?? human?.reason ?? "";
    setSavedStatus(draft ? "dirty" : human ? "ok" : "", draft ? "Unsaved changes" : human ? `Saved by ${human.reviewer} · ${formatDate(human.createdAt)}` : "Not reviewed yet");
  }
  const next = lastSavedKey === key ? nextPending(saved, ordered, key) : null;
  $("next-pending").hidden = !next; $("next-pending").dataset.target = next ?? "";
}
function setSavedStatus(kind, text) { $("saved").className = kind; $("saved").textContent = text; }
function nextPending(saved, ordered, fromKey) {
  const start = ordered.findIndex((c) => keyOf(c) === fromKey);
  const rotated = [...ordered.slice(start + 1), ...ordered.slice(0, Math.max(start, 0))];
  const next = rotated.find((c) => reviewable(c) && attentionStatuses.includes(triageFor(saved, c).status));
  return next ? keyOf(next) : null;
}
function step(direction) {
  const saved = report(); if (!saved) return;
  const shown = shownResults(saved); if (!shown.length) return;
  const index = shown.findIndex((c) => keyOf(c) === selectedCase);
  const target = index < 0 ? shown[0] : shown[index + direction];
  if (!target) return;
  selectedCase = keyOf(target); lastSavedKey = ""; renderReview();
  const top = $("answer-detail").getBoundingClientRect().top; // Start each answer from its top without hiding the run header when it already fits.
  if (top < 0 || top > window.innerHeight / 2) window.scrollTo({ top: window.scrollY + top - 20, behavior: "smooth" });
}
$("prev-answer").addEventListener("click", () => step(-1));
$("next-answer").addEventListener("click", () => step(1));
$("next-pending").addEventListener("click", () => { const target = $("next-pending").dataset.target; if (target) { answerFilter = "attention"; selectedCase = target; lastSavedKey = ""; renderReview(); $("reason").focus(); } });
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && event.target.closest("#human-form")) { event.preventDefault(); $("human-form").requestSubmit(); return; }
  if (event.metaKey || event.ctrlKey || event.altKey || $("reviews-panel").hidden || document.querySelector("dialog[open]")) return;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName) || event.target.isContentEditable) return;
  if (event.key === "j") step(1); else if (event.key === "k") step(-1);
});
for (const button of document.querySelectorAll(".filters button")) button.addEventListener("click", () => { answerFilter = button.dataset.filter; renderReview(); });

function updateSelection(saved, shown) {
  const selectable = shown.filter(reviewable).map(keyOf);
  const count = selectedAnswers.size;
  $("select-all").disabled = busy || !selectable.length;
  $("select-all").checked = selectable.length > 0 && count === selectable.length;
  $("select-all").indeterminate = count > 0 && count < selectable.length;
  $("selection-bar").hidden = !count || $("reviews-panel").hidden;
  $("selection-count").textContent = `${count} selected`;
  $("bulk-judge").textContent = `Judge selected (${count})…`; $("bulk-human").textContent = `Set human verdict (${count})…`;
  $("bulk-judge").disabled = !count || Boolean(state.active) || busy; $("bulk-human").disabled = !count || busy; $("selection-clear").disabled = busy;
  for (const checkbox of document.querySelectorAll("input[data-answer-key]")) checkbox.checked = selectedAnswers.has(checkbox.dataset.answerKey);
}
$("select-all").addEventListener("change", () => {
  const saved = report(); const shown = shownResults(saved);
  selectedAnswers.clear();
  if ($("select-all").checked) for (const c of shown) if (reviewable(c)) selectedAnswers.add(keyOf(c));
  updateSelection(saved, shown);
});
$("selection-clear").addEventListener("click", () => { selectedAnswers.clear(); updateSelection(report(), shownResults(report())); });
function selectedKeys() { return shownResults(report()).filter((c) => selectedAnswers.has(keyOf(c))).map(keyOf); }

async function start(input) { try { await api("/api/start", input); $("error").hidden = true; await refresh(); } catch (error) { failure(error); } }
function requestRun(input) {
  if (input.suite !== "live" && input.suite !== "judge") { void start(input); return; }
  const judge = input.suite === "judge";
  const model = (judge ? judgePreferences?.model : null) || state.defaults.model;
  const effort = (judge ? judgePreferences?.effort : null) || state.defaults.effort;
  pendingRun = { ...input, model, effort };
  const count = judge ? input.keys.length : input.cases.length * input.repeats;
  $("confirm-title").textContent = judge ? `Judge ${input.keys.length} saved answer${input.keys.length === 1 ? "" : "s"}` : input.cases.length === 1 ? `Run ${caseName(input.cases[0])}` : "Run live agent evals";
  $("confirm-description").textContent = judge ? "An isolated Pi session grades each saved answer against its rubric. Results update triage, never human verdicts. Already judged answers in this selection will be judged again; earlier judgments are kept. Server Guy is not rerun." : `${input.cases.length} case${input.cases.length === 1 ? "" : "s"} × ${input.repeats} repetition${input.repeats === 1 ? "" : "s"} = ${count} planned answer${count === 1 ? "" : "s"}. Uses current code and case definitions with fresh application data; no GitHub calls. Saves a new run; existing answers and reviews stay unchanged. Judging is a separate action, not part of this run.`;
  $("confirm-selection").textContent = judge ? input.keys.join(", ") : input.cases.join(", ");
  $("confirm-limits").textContent = judge ? "One judgment per answer, sequentially. Stops on the first failure or after 15 minutes; earlier advice stays saved. No retries. Model advice can be wrong." : "Repeats test consistency, not retry failures. Tool calls and Pi’s built-in retries can make multiple requests per turn.";
  $("run-model").value = model; $("run-effort").value = effort;
  returnToEvalPicker = $("eval-picker").open;
  if (returnToEvalPicker) $("eval-picker").close();
  $("consent").checked = false; $("confirm-run").disabled = true; $("confirm").showModal();
}
$("consent").addEventListener("change", () => { $("confirm-run").disabled = !$("consent").checked; });
function cancelRun() { pendingRun = null; $("confirm").close(); if (returnToEvalPicker) { $("eval-picker").showModal(); $("run-evals").focus(); } returnToEvalPicker = false; }
$("cancel").addEventListener("click", cancelRun);
$("confirm").addEventListener("cancel", (event) => { event.preventDefault(); cancelRun(); });
for (const id of ["run-model", "run-effort"]) $(id).addEventListener("input", () => { $("consent").checked = false; $("confirm-run").disabled = true; });
$("confirm-run").addEventListener("click", () => {
  if (!$("consent").checked || !pendingRun || !$("run-model").reportValidity()) return;
  const input = { ...pendingRun, model: $("run-model").value.trim(), effort: $("run-effort").value, consent: true };
  if (input.suite === "judge") judgePreferences = { model: input.model, effort: input.effort };
  pendingRun = null; returnToEvalPicker = false; $("confirm").close(); void start(input);
});
for (const button of document.querySelectorAll("[data-close]")) button.addEventListener("click", () => { if (!busy) $(button.dataset.close).close(); });
$("bulk-human-dialog").addEventListener("cancel", (event) => { if (busy) event.preventDefault(); });
$("stop").addEventListener("click", () => { void api("/api/stop", {}).then(refresh).catch(failure); });
// Two real URLs, sharing the shell so route changes preserve review drafts and selections.
function renderPage() {
  const reviewing = location.pathname === "/evals";
  $("runs-panel").hidden = reviewing; $("reviews-panel").hidden = !reviewing;
  $("checks-title").hidden = reviewing; $("checks-link").hidden = !reviewing;
  document.title = `${reviewing ? "Eval runs" : "Run checks"} · Server Guy Testing`;
  if (report()) updateSelection(report(), shownResults(report()));
}
for (const id of ["checks-link", "reviews-link"]) $(id).addEventListener("click", (event) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  history.pushState(null, "", $(id).href); renderPage();
  $(location.pathname === "/evals" ? "reviews-title" : "checks-title").focus({ preventScroll: true });
  window.scrollTo(0, 0);
});
window.addEventListener("popstate", renderPage);
$("empty-choose").addEventListener("click", () => $("eval-picker").showModal());
$("judge").addEventListener("click", () => requestRun({ suite: "judge", run: selectedRun, hash: report().hash, keys: [selectedCase] }));
$("rerun-case").addEventListener("click", () => requestRun({ suite: "live", cases: [record().caseId], repeats: 1 }));
$("bulk-judge").addEventListener("click", () => requestRun({ suite: "judge", run: selectedRun, hash: report().hash, keys: selectedKeys() }));
$("judge-run").addEventListener("click", () => requestRun({ suite: "judge", run: selectedRun, hash: report().hash, keys: orderedResults(report()).filter(reviewable).map(keyOf) }));
$("spot-check").addEventListener("click", () => {
  const cleared = orderedResults(report()).filter((c) => triageFor(report(), c).status === "cleared");
  if (!cleared.length) return;
  answerFilter = "cleared"; selectedCase = keyOf(cleared[Math.floor(Math.random() * cleared.length)]); lastSavedKey = ""; renderReview();
  $("answer-detail").scrollIntoView({ block: "start" });
});

$("reviewer").value = localStorage.getItem("sg-testing-reviewer") ?? "";
$("reviewer").addEventListener("input", () => localStorage.setItem("sg-testing-reviewer", $("reviewer").value));
$("human-form").addEventListener("input", () => {
  drafts.set(formKey, { verdict: $("human-form").elements.verdict.value, reason: $("reason").value });
  setSavedStatus("dirty", "Unsaved changes"); $("next-pending").hidden = true;
});
$("human-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const reviewer = $("reviewer").value.trim();
  if (!reviewer) { setSavedStatus("dirty", "Enter your name under “Reviewing as” first."); $("reviewer").focus(); return; }
  try {
    await api("/api/review", { run: selectedRun, hash: report().hash, key: selectedCase, review: { reviewer, verdict: $("human-form").elements.verdict.value, reason: $("reason").value } });
    drafts.delete(formKey); formKey = ""; lastSavedKey = selectedCase; $("error").hidden = true;
    await refresh();
  } catch (error) { failure(error); }
});

$("bulk-human").addEventListener("click", () => {
  pendingHuman = { run: selectedRun, hash: report().hash, keys: selectedKeys() };
  $("bulk-human-title").textContent = `Set a human verdict for ${pendingHuman.keys.length} answer${pendingHuman.keys.length === 1 ? "" : "s"}`;
  $("bulk-save").textContent = `Save verdict for ${pendingHuman.keys.length} answer${pendingHuman.keys.length === 1 ? "" : "s"}`;
  $("bulk-reviewer").value = $("reviewer").value; $("bulk-reason").value = "";
  for (const radio of $("bulk-human-form").elements["bulk-verdict"]) radio.checked = false;
  $("bulk-error").hidden = true; $("bulk-human-dialog").showModal();
});
$("bulk-human-form").addEventListener("submit", async (event) => {
  event.preventDefault(); if (busy || !pendingHuman) return;
  const input = pendingHuman;
  busy = true; $("bulk-save").disabled = true; renderReview();
  try {
    const result = await api("/api/review/bulk", { ...input, review: { reviewer: $("bulk-reviewer").value, verdict: $("bulk-human-form").elements["bulk-verdict"].value, reason: $("bulk-reason").value } });
    for (const key of result.saved) selectedAnswers.delete(key);
    if (!$("reviewer").value.trim()) { $("reviewer").value = $("bulk-reviewer").value; localStorage.setItem("sg-testing-reviewer", $("reviewer").value); }
    formKey = ""; $("error").hidden = true; pendingHuman = null; $("bulk-human-dialog").close();
    busy = false; await refresh();
    $("bulk-result").textContent = `Human verdict saved for ${result.saved.length} answer${result.saved.length === 1 ? "" : "s"}.${result.failed.length ? ` ${result.failed.length} could not be saved and remain selected.` : ""}`;
  } catch (error) { $("bulk-error").textContent = error.message; $("bulk-error").hidden = false; }
  finally { busy = false; $("bulk-save").disabled = false; renderReview(); }
});
$("archive-run").addEventListener("click", async () => {
  const saved = report(); if (busy || !saved) return;
  const input = { run: saved.run, hash: saved.hash, archived: !saved.archived };
  busy = true; renderReview();
  try {
    await api("/api/runs/archive", input); selectedAnswers.clear(); $("error").hidden = true;
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
  $("eval-count").textContent = `${cases} cases × ${repeats} repetition${repeats === 1 ? "" : "s"} = ${cases * repeats} planned answers`;
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
