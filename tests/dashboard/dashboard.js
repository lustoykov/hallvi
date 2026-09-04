const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="testing-token"]').content;
let state = null;
let selectedRun = "";
let selectedCase = "";
let selectedLog = "";
let pendingRun = null;
let formKey = "";
let stateSignature = "";
const reviewDrafts = new Map();
const selectedAnswers = new Set();
let answerSelectionScope = "";
let selectorsReady = false;
let savingBulk = false;
let inboxView = "active";
let pendingHuman = null;
let returnToEvalPicker = false;
let judgePreferences = null;
const keyOf = (record) => `${record.caseId}:${record.repetition}`;
function element(tag, text, className) { const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node; }
function report() { return state?.reports.find((r) => r.run === selectedRun); }
function record() { return report()?.results.find((r) => keyOf(r) === selectedCase); }
function latest(type) { return report()?.reviews.filter((r) => r.key === selectedCase && r.type === type).at(-1); }
function visibleReports() { return state?.reports.filter((r) => r.archived === (inboxView === "archived")) ?? []; }
function visibleResults() { return report()?.results ?? []; }
function selectedReviewKeys() { return visibleResults().filter((c) => selectedAnswers.has(keyOf(c)) && c.reply && c.input).map(keyOf); }
function failure(error) { $("error").textContent = error.message; $("error").hidden = false; }
async function api(path, body) {
  const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: { "X-SG-Testing-Token": token, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); if (!response.ok) throw new Error(value.error); return value;
}
async function refresh() {
  try {
    const nextState = await api("/api/state");
    const signature = JSON.stringify(nextState);
    if (signature === stateSignature) return; // Preserve keyboard focus and open selects between polls.
    stateSignature = signature; state = nextState;
    $("active").hidden = !state.active;
    $("active-text").textContent = state.active ? `Running ${state.active.suite} · started ${new Date(state.active.startedAt).toLocaleTimeString()}` : "";
    $("suites").replaceChildren(...state.suites.map((suite) => {
      const row = document.createElement("tr"); const name = document.createElement("td");
      name.append(element("strong", suite.name), element("small", suite.scope)); row.append(name, element("td", suite.cost), element("td", suite.ci));
      const picker = suite.id === "e2e" ? "journey" : suite.id === "live" ? "eval" : null;
      const action = document.createElement("td"); const button = element("button", picker === "journey" ? "Choose journeys…" : picker ? "Choose cases…" : "Run", picker ? "secondary" : "primary");
      if (picker) button.dataset.picker = picker;
      button.disabled = Boolean(state.active); button.addEventListener("click", () => {
        if (!picker) { requestRun({ suite: suite.id }); return; }
        $(`${picker}-picker`).showModal();
      }); action.append(button); row.append(action); return row;
    }));
    initializeSelectors(); updateSelections();
    $("empty-runs").hidden = state.history.length > 0;
    $("history").replaceChildren(...state.history.map((run) => {
      const row = element("div", "", "history-item"); const button = element("button", `${run.suite} · ${run.commit}${run.dirty ? " + local changes" : ""}`);
      button.addEventListener("click", () => { selectedLog = run.id; $("log-details").open = true; renderLog(); });
      row.append(button, element("span", new Date(run.startedAt).toLocaleString()), element("span", run.finishedAt ? `${Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000)} seconds` : "In progress"), element("span", run.status, `badge ${run.status === "passed" ? "pass" : run.status === "running" ? "pending" : "fail"}`)); return row;
    })); renderLog();
    const pending = state.reports.filter((r) => !r.archived).reduce((count, r) => count + r.results.filter((c) => c.reply && !r.reviews.some((v) => v.key === keyOf(c) && v.type === "human")).length, 0);
    $("pending").textContent = pending ? `${pending} awaiting human review` : "";
    renderReview();
  } catch (error) { failure(error); }
}
function renderLog() {
  const run = state.history.find((r) => r.id === selectedLog);
  $("log-details").hidden = !run;
  if (run) $("log").textContent = `${run.command ? `$ ${run.command}` : "Command not recorded for this older run."}\n\n${run.log}`;
}
function renderReview() {
  const runs = visibleReports();
  if (!runs.some((r) => r.run === selectedRun)) { selectedRun = runs[0]?.run ?? ""; selectedCase = ""; }
  const saved = report();
  const selectionScope = `${selectedRun}:${saved?.hash ?? ""}:${inboxView}`;
  if (answerSelectionScope !== selectionScope) { selectedAnswers.clear(); answerSelectionScope = selectionScope; $("bulk-result").textContent = ""; }
  for (const view of ["active", "archived"]) {
    const count = state.reports.filter((r) => r.archived === (view === "archived")).length;
    $(`view-${view}`).textContent = `${view === "active" ? "Active" : "Archived"} runs (${count})`;
    $(`view-${view}`).setAttribute("aria-pressed", String(inboxView === view));
  }
  $("empty-reviews").hidden = state.reports.length > 0;
  $("empty-inbox").hidden = !state.reports.length || runs.length > 0;
  $("empty-inbox").textContent = inboxView === "active" ? "No active eval runs. Start a new live eval or open Archived runs to restore an older run." : "No archived eval runs. Archive an old run to keep your active list focused.";
  $("review-content").hidden = !runs.length;
  const visible = visibleResults();
  if (!visible.some((c) => keyOf(c) === selectedCase)) selectedCase = visible[0] ? keyOf(visible[0]) : "";
  for (const key of selectedAnswers) if (!visible.some((c) => keyOf(c) === key)) selectedAnswers.delete(key);
  const focusedCase = document.activeElement?.dataset.caseKey;
  const focusedSelection = document.activeElement?.dataset.answerKey;
  const focusedRun = document.activeElement?.dataset.openRun;
  const focusedRunSelection = document.activeElement?.dataset.selectRun;
  $("eval-runs").replaceChildren(...runs.map((r) => {
    const group = element("li", "", "run-group"); const header = element("div", "", "run-group-heading");
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.className = "run-selection"; checkbox.dataset.selectRun = r.run;
    checkbox.setAttribute("aria-label", `Select all answers in run ${r.run}`); checkbox.disabled = savingBulk || !r.results.some((c) => c.reply && c.input);
    const button = element("button", new Date(r.startedAt).toLocaleString()); button.dataset.openRun = r.run;
    button.setAttribute("aria-label", `Open eval run ${r.run}`); button.setAttribute("aria-current", String(r.run === selectedRun)); button.disabled = savingBulk;
    const answers = r.results.filter((c) => c.reply).length;
    button.append(element("small", `${r.model} / ${r.effort}`), element("small", `${answers} answer${answers === 1 ? "" : "s"} · ${r.results.filter((c) => c.reply && !r.reviews.some((v) => v.key === keyOf(c) && v.type === "human")).length} unreviewed`));
    button.addEventListener("click", () => { selectedRun = r.run; selectedCase = ""; renderReview(); });
    checkbox.addEventListener("change", () => {
      const checked = checkbox.checked;
      if (selectedRun !== r.run) { selectedRun = r.run; selectedCase = ""; renderReview(); }
      for (const c of r.results) if (c.reply && c.input) { if (checked) selectedAnswers.add(keyOf(c)); else selectedAnswers.delete(keyOf(c)); }
      updateBulkActions();
    });
    header.append(checkbox, button); group.append(header);
    if (r.run !== selectedRun) return group;
    const list = document.createElement("ul"); list.id = "cases"; list.setAttribute("aria-label", "Answers in selected run");
    list.append(...r.results.map((c) => {
    const li = document.createElement("li"); const button = element("button", `${c.caseId} · repetition ${c.repetition}`);
    const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.className = "answer-selection";
    checkbox.dataset.answerKey = keyOf(c); checkbox.setAttribute("aria-label", `Select ${c.caseId} repetition ${c.repetition}`);
    checkbox.disabled = savingBulk || !c.reply || !c.input; checkbox.checked = selectedAnswers.has(keyOf(c));
    checkbox.addEventListener("change", () => { if (checkbox.checked) selectedAnswers.add(keyOf(c)); else selectedAnswers.delete(keyOf(c)); updateBulkActions(); });
    button.dataset.caseKey = keyOf(c);
    const human = saved.reviews.filter((r) => r.type === "human" && r.key === keyOf(c)).at(-1);
    const judge = saved.reviews.filter((r) => r.type === "llm" && r.key === keyOf(c)).at(-1);
    button.append(element("small", !c.reply ? "No answer to review" : human ? `Human: ${human.verdict}` : "Human: pending"));
    if (judge) button.append(element("small", `LLM advice: ${judge.verdict}`));
    button.setAttribute("aria-label", `${c.caseId} · repetition ${c.repetition} ${!c.reply ? "No answer to review" : human ? `Human: ${human.verdict}` : "Human: pending"}${judge ? ` LLM advice: ${judge.verdict}` : ""}`);
    button.setAttribute("aria-current", String(keyOf(c) === selectedCase)); button.addEventListener("click", () => { selectedCase = keyOf(c); renderReview(); }); li.append(checkbox, button); return li;
    }));
    group.append(list); return group;
  }));
  const controls = Array.from($("eval-runs").querySelectorAll("button,input"));
  if (focusedCase) controls.find((button) => button.dataset.caseKey === focusedCase)?.focus();
  if (focusedSelection) controls.find((input) => input.dataset.answerKey === focusedSelection)?.focus();
  if (focusedRun) controls.find((button) => button.dataset.openRun === focusedRun)?.focus();
  if (focusedRunSelection) controls.find((input) => input.dataset.selectRun === focusedRunSelection)?.focus();
  updateBulkActions();
  if (!saved) return;
  const current = record();
  $("run-title").textContent = new Date(saved.startedAt).toLocaleString();
  $("run-model-label").textContent = `${saved.model} / ${saved.effort}${saved.archived ? " · Archived run" : ""}`;
  const caseCount = saved.caseIds?.length ?? new Set(saved.results.map((c) => c.caseId)).size;
  const answerCount = saved.results.filter((c) => c.reply).length;
  const plan = saved.repeats ? `${caseCount} cases × ${saved.repeats} repetition${saved.repeats === 1 ? "" : "s"} = ${saved.plannedCases ?? caseCount * saved.repeats} planned answers` : `${caseCount} cases · repetitions not recorded`;
  $("report-meta").textContent = `${plan} · ${answerCount} answers saved · commit ${saved.commit.slice(0, 8)}${saved.dirty ? " + local changes" : ""}`;
  $("archive-error").hidden = !saved.archiveError;
  $("empty-answers").hidden = Boolean(current); $("answer-detail").hidden = !current;
  if (!current) return;
  $("case-title").textContent = `${current.caseId} · repetition ${current.repetition}`;
  $("automatic").textContent = `Automatic: ${current.outcome}`; $("automatic").className = `badge ${current.outcome === "checks-passed" ? "pass" : "fail"}`;
  $("rubric").textContent = current.rubric; $("input").textContent = current.input?.userMessage || "Not run";
  $("answer").textContent = current.reply?.message || current.error || "No accepted answer";
  $("proposals").textContent = JSON.stringify(current.reply?.decisionProposals || [], null, 2);
  $("state").textContent = JSON.stringify({ before: current.before, after: current.after }, null, 2);
  $("checks").replaceChildren(...Object.entries(current.checks).map(([name, pass]) => element("li", `${pass ? "Passed" : "Failed"}: ${name}`)));
  const human = latest("human"); const judge = latest("llm");
  $("judge-result").textContent = judge?.reason ?? "No advice yet. Ask the LLM for a second opinion.";
  $("judge-verdict").hidden = !judge;
  $("judge-verdict").textContent = judge?.verdict ?? "";
  $("judge-verdict").className = `badge ${judge?.verdict === "pass" ? "pass" : judge?.verdict === "fail" ? "fail" : "pending"}`;
  $("judge-meta").textContent = judge ? `${judge.model} / ${judge.effort} · ${new Date(judge.createdAt).toLocaleString()}` : "";
  const nextKey = `${saved.run}:${saved.hash}:${selectedCase}`;
  if (formKey !== nextKey) {
    formKey = nextKey; const draft = reviewDrafts.get(formKey);
    $("reviewer").value = draft?.reviewer ?? human?.reviewer ?? localStorage.getItem("sg-testing-reviewer") ?? "";
    $("verdict").value = draft?.verdict ?? human?.verdict ?? "pass"; $("reason").value = draft?.reason ?? human?.reason ?? "";
    $("saved").textContent = draft ? "Unsaved changes" : human ? `Saved ${new Date(human.createdAt).toLocaleString()}` : "Not reviewed";
  }
  $("judge").disabled = Boolean(state.active) || !current.reply;
  $("human-form").querySelector("button").disabled = !current.reply;
}
async function start(input) { try { await api("/api/start", input); $("error").hidden = true; await refresh(); } catch (error) { failure(error); } }
function requestRun(input) {
  if (input.suite !== "live" && input.suite !== "judge") { void start(input); return; }
  const model = input.model || (input.suite === "judge" ? judgePreferences?.model : null) || state.defaults.model;
  const effort = input.effort || (input.suite === "judge" ? judgePreferences?.effort : null) || state.defaults.effort;
  pendingRun = { ...input, model, effort };
  const keys = input.keys ?? [input.key];
  $("confirm-title").textContent = input.suite === "judge" ? `Judge ${keys.length} saved answer${keys.length === 1 ? "" : "s"}` : "Run live agent evals";
  $("confirm-description").textContent = input.suite === "judge" ? "LLM advice on these saved answers. Does not rerun Server Guy or change human verdicts." : `${input.cases.length} cases × ${input.repeats} repetition${input.repeats === 1 ? "" : "s"} = ${input.cases.length * input.repeats} planned answers. Fresh application data; no GitHub calls.`;
  $("confirm-selection").textContent = input.suite === "judge" ? keys.join(", ") : input.cases.join(", ");
  $("confirm-limits").textContent = input.suite === "judge" ? "One isolated judgment per answer, sequentially. Stops on failure or after 15 minutes; earlier verdicts remain saved. No retries. Model advice can be wrong." : "Repeats test consistency, not retry failures. Tool calls and Pi’s built-in retries can make multiple requests per turn.";
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
for (const button of document.querySelectorAll("[data-close]")) button.addEventListener("click", () => { if (!savingBulk) $(button.dataset.close).close(); });
$("bulk-human-dialog").addEventListener("cancel", (event) => { if (savingBulk) event.preventDefault(); });
$("stop").addEventListener("click", () => { void api("/api/stop", {}).then(refresh).catch(failure); });
for (const tab of ["runs", "reviews"]) $(`${tab}-tab`).addEventListener("click", () => {
  for (const name of ["runs", "reviews"]) { $(`${name}-tab`).setAttribute("aria-pressed", String(name === tab)); $(`${name}-panel`).hidden = name !== tab; }
});
$("judge").addEventListener("click", () => requestRun({ suite: "judge", run: selectedRun, hash: report().hash, key: selectedCase }));
$("human-form").addEventListener("input", () => {
  reviewDrafts.set(formKey, { reviewer: $("reviewer").value, verdict: $("verdict").value, reason: $("reason").value });
  $("saved").textContent = "Unsaved changes";
});
$("human-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/review", { run: selectedRun, hash: report().hash, key: selectedCase,
      review: { reviewer: $("reviewer").value, verdict: $("verdict").value, reason: $("reason").value } });
    localStorage.setItem("sg-testing-reviewer", $("reviewer").value); reviewDrafts.delete(formKey); formKey = ""; await refresh(); $("error").hidden = true;
  } catch (error) { failure(error); }
});
void refresh(); setInterval(() => { if (!document.hidden) void refresh(); }, 2500);

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
  $("bulk-reviewer").value = localStorage.getItem("sg-testing-reviewer") ?? "";
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

function updateBulkActions() {
  const count = selectedAnswers.size;
  const reviewCount = selectedReviewKeys().length;
  $("answer-count").textContent = `${count} selected`;
  $("bulk-judge").textContent = `Judge selected (${reviewCount})…`;
  $("bulk-judge").disabled = !reviewCount || Boolean(state.active) || savingBulk;
  $("bulk-human").disabled = !reviewCount || savingBulk;
  $("archive-run").disabled = !report() || savingBulk || Boolean(report()?.archiveError);
  $("archive-run").textContent = inboxView === "archived" ? "Restore run" : "Archive run";
  $("selection-help").textContent = "Selection applies to this run. LLM judging uses subscription.";
  for (const id of ["answers-all", "answers-pending", "answers-clear", "view-active", "view-archived"]) $(id).disabled = savingBulk;
  for (const checkbox of $("eval-runs").querySelectorAll(".answer-selection")) checkbox.checked = selectedAnswers.has(checkbox.dataset.answerKey);
  for (const checkbox of $("eval-runs").querySelectorAll(".run-selection")) {
    const keys = state.reports.find((r) => r.run === checkbox.dataset.selectRun).results.filter((c) => c.reply && c.input).map(keyOf);
    const selected = checkbox.dataset.selectRun === selectedRun ? keys.filter((key) => selectedAnswers.has(key)).length : 0;
    checkbox.checked = keys.length > 0 && selected === keys.length; checkbox.indeterminate = selected > 0 && selected < keys.length;
  }
}
for (const mode of ["all", "pending", "clear"]) $("answers-" + mode).addEventListener("click", () => {
  const saved = report(); selectedAnswers.clear();
  if (mode !== "clear") for (const c of visibleResults()) if (c.reply && c.input && (mode === "all" || !saved.reviews.some((r) => r.type === "human" && r.key === keyOf(c)))) selectedAnswers.add(keyOf(c));
  renderReview();
});
$("bulk-judge").addEventListener("click", () => requestRun({ suite: "judge", run: selectedRun, hash: report().hash, keys: selectedReviewKeys() }));
$("bulk-human").addEventListener("click", () => {
  pendingHuman = { run: selectedRun, hash: report().hash, keys: selectedReviewKeys() };
  $("bulk-human-title").textContent = `Review ${pendingHuman.keys.length} saved answers`;
  $("bulk-save").textContent = `Save human verdict for ${pendingHuman.keys.length} answers`;
  $("bulk-error").hidden = true; $("bulk-human-dialog").showModal();
});
for (const view of ["active", "archived"]) $(`view-${view}`).addEventListener("click", () => { inboxView = view; renderReview(); });
$("archive-run").addEventListener("click", async () => {
  if (savingBulk || !report()) return;
  const input = { run: selectedRun, hash: report().hash, archived: inboxView === "active" };
  savingBulk = true; renderReview();
  try {
    await api("/api/runs/archive", input); selectedAnswers.clear(); await refresh();
    $("bulk-result").textContent = `Run ${input.archived ? "archived. Restore it from Archived runs." : "restored to Active runs."} All answers and verdicts preserved.`;
    $("error").hidden = true;
  } catch (error) { failure(error); }
  finally { savingBulk = false; renderReview(); }
});
$("bulk-human-form").addEventListener("submit", async (event) => {
  event.preventDefault(); if (savingBulk || !pendingHuman) return;
  const input = pendingHuman;
  savingBulk = true; $("bulk-save").disabled = true; renderReview();
  try {
    const result = await api("/api/review/bulk", { ...input,
      review: { reviewer: $("bulk-reviewer").value, verdict: $("bulk-verdict").value, reason: $("bulk-reason").value } });
    for (const key of result.saved) selectedAnswers.delete(key);
    $("bulk-result").textContent = `Human verdict saved for ${result.saved.length} answers.${result.failed.length ? ` ${result.failed.length} could not be saved and remain selected.` : ""}`;
    formKey = ""; await refresh(); $("error").hidden = true;
    pendingHuman = null; $("bulk-human-dialog").close();
  } catch (error) { $("bulk-error").textContent = error.message; $("bulk-error").hidden = false; }
  finally { savingBulk = false; $("bulk-save").disabled = false; renderReview(); }
});
